//! Google Gemini 适配器（基于 `gemini-rust` SDK）。

use futures_util::StreamExt;
use gemini_rust::{
    Blob, Content, FunctionCall, FunctionDeclaration, FunctionResponse, Gemini, Message, Model,
    Part, Role, Tool,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use tokio::sync::watch;

use super::{
    build_text_with_file_attachments, safe_parse_json_object, split_data_url, ChatRoundRequest,
    ChatRoundResult, EndpointConfig, PromptTurn, ProviderToolCall, RemoteModelInfo, StreamDelta,
    ThinkingEffort,
};

/// 清理 Gemini 不支持的 JSON Schema 字段（如 `$schema`、`additionalProperties`、`default`）。
fn sanitize_gemini_schema(schema: &Value) -> Value {
    let Some(obj) = schema.as_object() else {
        return json!({ "type": "object", "properties": {} });
    };
    let mut out = Map::new();
    for (key, value) in obj {
        if key == "$schema" || key == "additionalProperties" || key == "default" {
            continue;
        }
        if key == "properties" {
            if let Some(props) = value.as_object() {
                let mut clean_props = Map::new();
                for (prop_key, prop_val) in props {
                    let clean_val = if prop_val.is_object() {
                        sanitize_gemini_schema(prop_val)
                    } else {
                        prop_val.clone()
                    };
                    clean_props.insert(prop_key.clone(), clean_val);
                }
                out.insert(key.clone(), Value::Object(clean_props));
                continue;
            }
        }
        if key == "items" && value.is_object() {
            out.insert(key.clone(), sanitize_gemini_schema(value));
            continue;
        }
        out.insert(key.clone(), value.clone());
    }
    if !out.contains_key("type") {
        out.insert("type".into(), Value::String("object".into()));
    }
    Value::Object(out)
}

fn normalize_gemini_model(model_id: &str) -> Model {
    let trimmed = model_id.trim();
    let full = if trimmed.starts_with("models/") {
        trimmed.to_string()
    } else {
        format!("models/{trimmed}")
    };
    Model::Custom(full)
}

fn parse_gemini_base_url(base: &str) -> Result<reqwest::Url, String> {
    let with_slash = format!("{}/", base.trim().trim_end_matches('/'));
    reqwest::Url::parse(&with_slash).map_err(|err| format!("Invalid Gemini base URL: {err}"))
}

#[allow(deprecated)]
pub(crate) async fn stream_chat(
    base: &str,
    req: &ChatRoundRequest<'_>,
    cancel_rx: &mut watch::Receiver<bool>,
    on_delta: &mut (dyn FnMut(StreamDelta) + Send),
) -> Result<ChatRoundResult, String> {
    let base_url = parse_gemini_base_url(base)?;
    let client = Gemini::with_model_and_base_url(
        req.endpoint.api_key.trim(),
        normalize_gemini_model(req.model_id),
        base_url,
    )
    .map_err(|err| err.to_string())?;

    let mut builder = client.generate_content();

    if let Some(sys) = req.system_prompt.map(str::trim).filter(|s| !s.is_empty()) {
        builder = builder.with_system_instruction(sys);
    }
    if let Some(max_tokens) = req.max_tokens.filter(|&n| n > 0) {
        builder = builder.with_max_output_tokens(max_tokens as i32);
    }
    if let Some(effort) = req.thinking_effort {
        let budget = match effort {
            ThinkingEffort::None => None,
            ThinkingEffort::Low => Some(1024),
            ThinkingEffort::Medium => Some(4096),
            ThinkingEffort::High => Some(12288),
        };
        if let Some(b) = budget {
            builder = builder
                .with_thinking_budget(b)
                .with_thoughts_included(true);
        }
    }

    let mut pending_tool_parts: Vec<Part> = Vec::new();
    let flush_tool_parts =
        |pending: &mut Vec<Part>, b: gemini_rust::ContentBuilder| -> gemini_rust::ContentBuilder {
            if pending.is_empty() {
                return b;
            }
            let parts = std::mem::take(pending);
            let msg = Message {
                content: Content {
                    parts: Some(parts),
                    role: Some(Role::User),
                },
                role: Role::User,
            };
            b.with_message(msg)
        };

    for turn in req.messages {
        match turn {
            PromptTurn::Tool {
                tool_name, content, ..
            } => {
                pending_tool_parts.push(Part::FunctionResponse {
                    function_response: FunctionResponse::new(
                        tool_name.clone(),
                        json!({ "result": content }),
                    ),
                });
            }
            PromptTurn::Assistant {
                content,
                tool_calls,
            } => {
                builder = flush_tool_parts(&mut pending_tool_parts, builder);
                let mut parts = Vec::new();
                if !content.is_empty() {
                    parts.push(Part::Text {
                        text: content.clone(),
                        thought: None,
                        thought_signature: None,
                    });
                }
                for call in tool_calls {
                    parts.push(Part::FunctionCall {
                        function_call: FunctionCall {
                            id: None,
                            name: call.name.clone(),
                            args: safe_parse_json_object(&call.arguments_text),
                            thought_signature: None,
                        },
                        thought_signature: None,
                    });
                }
                if parts.is_empty() {
                    parts.push(Part::Text {
                        text: String::new(),
                        thought: None,
                        thought_signature: None,
                    });
                }
                builder = builder.with_message(Message {
                    content: Content {
                        parts: Some(parts),
                        role: Some(Role::Model),
                    },
                    role: Role::Model,
                });
            }
            PromptTurn::User {
                content,
                attachments,
            } => {
                builder = flush_tool_parts(&mut pending_tool_parts, builder);
                let merged_text = build_text_with_file_attachments(content, attachments);
                let mut parts = Vec::new();
                for att in attachments.iter().filter(|a| a.kind == "image") {
                    if let Some(data_url) = att.data_url.as_deref() {
                        if let Some((mime, b64)) = split_data_url(data_url) {
                            parts.push(Part::InlineData {
                                inline_data: Blob::new(mime, b64),
                                media_resolution: None,
                            });
                        }
                    }
                }
                if !merged_text.is_empty() || parts.is_empty() {
                    parts.push(Part::Text {
                        text: merged_text,
                        thought: None,
                        thought_signature: None,
                    });
                }
                builder = builder.with_message(Message {
                    content: Content {
                        parts: Some(parts),
                        role: Some(Role::User),
                    },
                    role: Role::User,
                });
            }
        }
    }
    builder = flush_tool_parts(&mut pending_tool_parts, builder);

    if !req.tools.is_empty() {
        let mut decls = Vec::with_capacity(req.tools.len());
        for tool in req.tools {
            let clean_schema = sanitize_gemini_schema(&tool.parameters);
            let decl: FunctionDeclaration = serde_json::from_value(json!({
                "name": tool.name,
                "description": tool.description,
                "parameters": clean_schema,
            }))
            .map_err(|err| format!("Failed to build Gemini tool schema for {}: {err}", tool.name))?;
            decls.push(decl);
        }
        builder = builder.with_tool(Tool::with_functions(decls));
    }

    let mut stream = tokio::select! {
        res = builder.execute_stream() => {
            res.map_err(|err| err.to_string())?
        }
        _ = cancel_rx.changed() => {
            return Err("CANCELLED".into());
        }
    };

    let mut content = String::new();
    let mut tool_calls: Vec<ProviderToolCall> = Vec::new();

    loop {
        let next_item = tokio::select! {
            biased;
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    return Err("CANCELLED".into());
                }
                continue;
            }
            item = stream.next() => item,
        };

        let Some(chunk_res) = next_item else {
            break;
        };
        let resp = chunk_res.map_err(|err| err.to_string())?;
        let Some(first) = resp.candidates.into_iter().next() else {
            continue;
        };
        let Some(parts) = first.content.parts else {
            continue;
        };

        for part in parts {
            match part {
                Part::Text { text, thought, .. } if !text.is_empty() => {
                    if thought == Some(true) {
                        on_delta(StreamDelta {
                            content: None,
                            reasoning: Some(text),
                        });
                    } else {
                        content.push_str(&text);
                        on_delta(StreamDelta {
                            content: Some(text),
                            reasoning: None,
                        });
                    }
                }
                Part::FunctionCall { function_call, .. } if !function_call.name.is_empty() => {
                    let id = function_call
                        .id
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| format!("gemini_call_{}", tool_calls.len() + 1));
                    let args_text = serde_json::to_string(&function_call.args)
                        .unwrap_or_else(|_| "{}".to_string());
                    tool_calls.push(ProviderToolCall {
                        id,
                        name: function_call.name,
                        arguments_text: args_text,
                    });
                }
                _ => {}
            }
        }
    }

    Ok(ChatRoundResult {
        content,
        tool_calls,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModelsResponse {
    #[serde(default)]
    models: Vec<GeminiModelItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModelItem {
    #[serde(default)]
    name: String,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    supported_generation_methods: Vec<String>,
}

pub(crate) async fn fetch_models(
    base: &str,
    endpoint: &EndpointConfig,
) -> Result<Vec<RemoteModelInfo>, String> {
    let url = format!("{}/models", base.trim_end_matches('/'));
    let http = reqwest::Client::new();
    let mut req = http.get(&url);
    let key = endpoint.api_key.trim();
    if !key.is_empty() {
        req = req.header("x-goog-api-key", key);
    }
    let res = req.send().await.map_err(|err| err.to_string())?;
    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status.as_u16(), body.trim()));
    }
    let parsed: GeminiModelsResponse = res.json().await.map_err(|err| err.to_string())?;
    let models = parsed
        .models
        .into_iter()
        .filter(|m| {
            m.supported_generation_methods.is_empty()
                || m.supported_generation_methods
                    .iter()
                    .any(|method| method == "generateContent")
        })
        .filter_map(|m| {
            let id = m.name.trim().trim_start_matches("models/").to_string();
            if id.is_empty() {
                None
            } else {
                let name = m
                    .display_name
                    .map(|n| n.trim().to_string())
                    .filter(|n| !n.is_empty());
                Some(RemoteModelInfo { id, name })
            }
        })
        .collect();
    Ok(models)
}
