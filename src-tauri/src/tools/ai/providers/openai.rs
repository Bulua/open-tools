//! OpenAI 及所有 OpenAI 兼容提供商适配器（基于 `async-openai` SDK）。

use std::collections::BTreeMap;

use async_openai::{config::OpenAIConfig, Client};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::watch;

use crate::core::error::{AppError, AppResult};

use super::{
    build_text_with_file_attachments, classify_provider_error, ChatRoundRequest, ChatRoundResult,
    EndpointConfig, PromptTurn, ProviderToolCall, RemoteModelInfo, StreamDelta, ThinkTagSplitter,
    ThinkingEffort,
};

#[derive(Debug, Deserialize)]
struct OpenAiStreamChunk {
    #[serde(default)]
    choices: Vec<OpenAiChoice>,
    #[serde(default)]
    error: Option<OpenAiErrorBody>,
}

#[derive(Debug, Deserialize)]
struct OpenAiErrorBody {
    #[serde(default)]
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    #[serde(default)]
    delta: Option<OpenAiDelta>,
    #[serde(default)]
    message: Option<OpenAiDelta>,
}

#[derive(Debug, Deserialize, Default)]
struct OpenAiDelta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    reasoning_content: Option<String>,
    #[serde(default)]
    reasoning: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<OpenAiToolCallDelta>>,
}

#[derive(Debug, Deserialize)]
struct OpenAiToolCallDelta {
    #[serde(default)]
    index: Option<usize>,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    function: Option<OpenAiFunctionDelta>,
}

#[derive(Debug, Deserialize)]
struct OpenAiFunctionDelta {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<String>,
}

fn build_client(base: &str, api_key: &str) -> Client<OpenAIConfig> {
    let config = OpenAIConfig::new()
        .with_api_base(base)
        .with_api_key(api_key.trim());
    Client::with_config(config)
}

pub(crate) async fn stream_chat(
    base: &str,
    req: &ChatRoundRequest<'_>,
    cancel_rx: &mut watch::Receiver<bool>,
    on_delta: &mut (dyn FnMut(StreamDelta) + Send),
) -> AppResult<ChatRoundResult> {
    let client = build_client(base, &req.endpoint.api_key);

    let mut payload_messages: Vec<Value> = Vec::new();
    if let Some(sys) = req.system_prompt.map(str::trim).filter(|s| !s.is_empty()) {
        payload_messages.push(json!({ "role": "system", "content": sys }));
    }

    for msg in req.messages {
        match msg {
            PromptTurn::Tool {
                tool_call_id,
                content,
                ..
            } => {
                payload_messages.push(json!({
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "content": content,
                }));
            }
            PromptTurn::Assistant {
                content,
                tool_calls,
            } if !tool_calls.is_empty() => {
                let calls: Vec<Value> = tool_calls
                    .iter()
                    .map(|call| {
                        let args = if call.arguments_text.is_empty() {
                            "{}"
                        } else {
                            &call.arguments_text
                        };
                        json!({
                            "id": call.id,
                            "type": "function",
                            "function": {
                                "name": call.name,
                                "arguments": args,
                            }
                        })
                    })
                    .collect();
                let content_val = if content.is_empty() {
                    Value::Null
                } else {
                    Value::String(content.clone())
                };
                payload_messages.push(json!({
                    "role": "assistant",
                    "content": content_val,
                    "tool_calls": calls,
                }));
            }
            PromptTurn::Assistant { content, .. } => {
                payload_messages.push(json!({
                    "role": "assistant",
                    "content": content,
                }));
            }
            PromptTurn::User {
                content,
                attachments,
            } => {
                let merged_text = build_text_with_file_attachments(content, attachments);
                let images: Vec<&str> = attachments
                    .iter()
                    .filter(|a| a.kind == "image")
                    .filter_map(|a| a.data_url.as_deref())
                    .filter(|url| !url.is_empty())
                    .collect();
                if images.is_empty() {
                    payload_messages.push(json!({
                        "role": "user",
                        "content": merged_text,
                    }));
                } else {
                    let mut parts: Vec<Value> = Vec::new();
                    if !merged_text.is_empty() {
                        parts.push(json!({ "type": "text", "text": merged_text }));
                    }
                    for img_url in images {
                        parts.push(json!({
                            "type": "image_url",
                            "image_url": { "url": img_url },
                        }));
                    }
                    payload_messages.push(json!({
                        "role": "user",
                        "content": parts,
                    }));
                }
            }
        }
    }

    let mut body = serde_json::Map::new();
    body.insert("model".into(), Value::String(req.model_id.to_string()));
    body.insert("messages".into(), Value::Array(payload_messages));
    body.insert("stream".into(), Value::Bool(true));

    if let Some(max_tokens) = req.max_tokens.filter(|&n| n > 0) {
        body.insert("max_tokens".into(), Value::from(max_tokens));
    }
    if let Some(effort) = req.thinking_effort {
        let effort_str = match effort {
            ThinkingEffort::None => None,
            ThinkingEffort::Low => Some("low"),
            ThinkingEffort::Medium => Some("medium"),
            ThinkingEffort::High => Some("high"),
        };
        if let Some(val) = effort_str {
            body.insert("reasoning_effort".into(), Value::String(val.to_string()));
        }
    }
    if !req.tools.is_empty() {
        let tools: Vec<Value> = req
            .tools
            .iter()
            .map(|tool| {
                let params = if tool.parameters.is_object() {
                    tool.parameters.clone()
                } else {
                    json!({ "type": "object", "properties": {} })
                };
                json!({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": params,
                    }
                })
            })
            .collect();
        body.insert("tools".into(), Value::Array(tools));
    }

    // 通过 async-openai 的 byot 流式接口发送，既使用 SDK 的认证与 SSE 通道，
    // 又能完整保留 DeepSeek/Qwen/Ollama 等兼容接口的 reasoning_content 字段。
    let chat = client.chat();
    let mut stream = tokio::select! {
        res = chat.create_stream_byot::<Value, OpenAiStreamChunk>(Value::Object(body)) => {
            res.map_err(|err| classify_provider_error(err.to_string()))?
        }
        _ = cancel_rx.changed() => {
            return Err(AppError::cancelled("Chat cancelled."));
        }
    };

    let mut content = String::new();
    let mut tool_call_map: BTreeMap<usize, ProviderToolCall> = BTreeMap::new();
    let mut splitter = ThinkTagSplitter::new();

    loop {
        let next_item = tokio::select! {
            biased;
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    return Err(AppError::cancelled("Chat cancelled."));
                }
                continue;
            }
            item = stream.next() => item,
        };

        let Some(chunk_res) = next_item else {
            break;
        };
        let chunk = chunk_res.map_err(|err| classify_provider_error(err.to_string()))?;
        if let Some(err_body) = chunk.error {
            if let Some(msg) = err_body.message.filter(|m| !m.is_empty()) {
                return Err(classify_provider_error(msg));
            }
        }
        let Some(first) = chunk.choices.into_iter().next() else {
            continue;
        };
        let delta = first.delta.or(first.message).unwrap_or_default();

        if let Some(r_chunk) = delta
            .reasoning_content
            .filter(|s| !s.is_empty())
            .or_else(|| delta.reasoning.filter(|s| !s.is_empty()))
        {
            on_delta(StreamDelta {
                content: None,
                reasoning: Some(r_chunk),
            });
        }

        if let Some(raw_text) = delta.content.filter(|s| !s.is_empty()) {
            let (c_part, r_part) = splitter.push(&raw_text);
            if !r_part.is_empty() {
                on_delta(StreamDelta {
                    content: None,
                    reasoning: Some(r_part),
                });
            }
            if !c_part.is_empty() {
                content.push_str(&c_part);
                on_delta(StreamDelta {
                    content: Some(c_part),
                    reasoning: None,
                });
            }
        }

        if let Some(calls) = delta.tool_calls {
            for raw_call in calls {
                let idx = raw_call.index.unwrap_or(tool_call_map.len());
                let entry = tool_call_map.entry(idx).or_insert_with(|| ProviderToolCall {
                    id: format!("call_{}", idx + 1),
                    name: String::new(),
                    arguments_text: String::new(),
                });
                if let Some(id) = raw_call.id.filter(|s| !s.is_empty()) {
                    entry.id = id;
                }
                if let Some(func) = raw_call.function {
                    if let Some(name) = func.name.filter(|s| !s.is_empty()) {
                        entry.name.push_str(&name);
                    }
                    if let Some(args) = func.arguments {
                        entry.arguments_text.push_str(&args);
                    }
                }
            }
        }
    }

    let (tail_c, tail_r) = splitter.flush();
    if !tail_r.is_empty() {
        on_delta(StreamDelta {
            content: None,
            reasoning: Some(tail_r),
        });
    }
    if !tail_c.is_empty() {
        content.push_str(&tail_c);
        on_delta(StreamDelta {
            content: Some(tail_c),
            reasoning: None,
        });
    }

    let tool_calls = tool_call_map
        .into_values()
        .filter(|call| !call.name.is_empty())
        .collect();

    Ok(ChatRoundResult {
        content,
        tool_calls,
    })
}

pub(crate) async fn fetch_models(
    base: &str,
    endpoint: &EndpointConfig,
) -> AppResult<Vec<RemoteModelInfo>> {
    let client = build_client(base, &endpoint.api_key);
    let resp = client
        .models()
        .list()
        .await
        .map_err(|err| classify_provider_error(err.to_string()))?;
    let mut models: Vec<RemoteModelInfo> = resp
        .data
        .into_iter()
        .filter_map(|item| {
            let id = item.id.trim().to_string();
            if id.is_empty() {
                None
            } else {
                Some(RemoteModelInfo { id, name: None })
            }
        })
        .collect();
    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}
