//! Anthropic (Claude) 适配器（基于 `adk-anthropic` SDK）。

use std::collections::BTreeMap;
use std::pin::pin;

use adk_anthropic::{
    Anthropic, Base64ImageSource, ContentBlock, ContentBlockDelta, ImageBlock, ImageMediaType,
    MessageCreateParams, MessageParam, MessageRole, MessageStreamEvent, Model, SystemPrompt,
    TextBlock, ThinkingConfig, ToolParam, ToolResultBlock, ToolUnionParam, ToolUseBlock,
};
use futures_util::StreamExt;
use serde_json::json;
use tokio::sync::watch;

use crate::core::error::{AppError, AppResult};

use super::{
    build_text_with_file_attachments, classify_provider_error, safe_parse_json_object,
    split_data_url, ChatRoundRequest, ChatRoundResult, EndpointConfig, PromptTurn,
    ProviderToolCall, RemoteModelInfo, StreamDelta, ThinkingEffort, TokenUsage,
};

/// `adk-anthropic` 内部会自动拼接 `/v1/{endpoint}`，如果用户填写的 baseUrl 以 `/v1` 结尾需先剥离。
fn normalize_anthropic_base_url(base: &str) -> String {
    let trimmed = base.trim().trim_end_matches('/');
    trimmed
        .strip_suffix("/v1")
        .unwrap_or(trimmed)
        .trim_end_matches('/')
        .to_string()
}

fn build_client(base: &str, api_key: &str) -> AppResult<Anthropic> {
    let normalized = normalize_anthropic_base_url(base);
    let key = api_key.trim();
    let key_opt = if key.is_empty() {
        Some(String::new())
    } else {
        Some(key.to_string())
    };
    let mut client = Anthropic::new(key_opt).map_err(|err| AppError::provider(err.to_string()))?;
    if normalized.starts_with("http://") {
        client = client.allow_insecure_http();
    }
    client = client
        .with_base_url(normalized)
        .map_err(|err| AppError::invalid_input(err.to_string()))?;
    Ok(client)
}

fn parse_image_media_type(mime: &str) -> Option<ImageMediaType> {
    match mime.trim().to_ascii_lowercase().as_str() {
        "image/jpeg" | "image/jpg" => Some(ImageMediaType::Jpeg),
        "image/png" => Some(ImageMediaType::Png),
        "image/gif" => Some(ImageMediaType::Gif),
        "image/webp" => Some(ImageMediaType::Webp),
        _ => None,
    }
}

pub(crate) async fn stream_chat(
    base: &str,
    req: &ChatRoundRequest<'_>,
    cancel_rx: &mut watch::Receiver<bool>,
    on_delta: &mut (dyn FnMut(StreamDelta) + Send),
) -> AppResult<ChatRoundResult> {
    let client = build_client(base, &req.endpoint.api_key)?;

    let mut messages: Vec<MessageParam> = Vec::new();
    let mut pending_tool_results: Vec<ContentBlock> = Vec::new();

    let flush_tool_results =
        |pending: &mut Vec<ContentBlock>, out: &mut Vec<MessageParam>| {
            if !pending.is_empty() {
                let blocks = std::mem::take(pending);
                out.push(MessageParam::new_with_blocks(blocks, MessageRole::User));
            }
        };

    for msg in req.messages {
        match msg {
            PromptTurn::Tool {
                tool_call_id,
                content,
                ..
            } => {
                pending_tool_results.push(ContentBlock::ToolResult(
                    ToolResultBlock::new(tool_call_id.clone())
                        .with_string_content(content.clone()),
                ));
            }
            PromptTurn::Assistant {
                content,
                tool_calls,
            } => {
                flush_tool_results(&mut pending_tool_results, &mut messages);
                if tool_calls.is_empty() {
                    messages.push(MessageParam::new_with_string(
                        content.clone(),
                        MessageRole::Assistant,
                    ));
                } else {
                    let mut blocks = Vec::new();
                    if !content.is_empty() {
                        blocks.push(ContentBlock::Text(TextBlock::new(content.clone())));
                    }
                    for call in tool_calls {
                        blocks.push(ContentBlock::ToolUse(ToolUseBlock::new(
                            call.id.clone(),
                            call.name.clone(),
                            safe_parse_json_object(&call.arguments_text),
                        )));
                    }
                    messages.push(MessageParam::new_with_blocks(
                        blocks,
                        MessageRole::Assistant,
                    ));
                }
            }
            PromptTurn::User {
                content,
                attachments,
            } => {
                flush_tool_results(&mut pending_tool_results, &mut messages);
                let merged_text = build_text_with_file_attachments(content, attachments);
                let mut image_blocks: Vec<ContentBlock> = Vec::new();
                for att in attachments.iter().filter(|a| a.kind == "image") {
                    if let Some(data_url) = att.data_url.as_deref() {
                        if let Some((mime, b64)) = split_data_url(data_url) {
                            if let Some(media_type) = parse_image_media_type(&mime) {
                                image_blocks.push(ContentBlock::Image(ImageBlock::new_with_base64(
                                    Base64ImageSource::new(b64, media_type),
                                )));
                            }
                        }
                    }
                }
                if image_blocks.is_empty() {
                    messages.push(MessageParam::new_with_string(
                        merged_text,
                        MessageRole::User,
                    ));
                } else {
                    if !merged_text.is_empty() {
                        image_blocks.push(ContentBlock::Text(TextBlock::new(merged_text)));
                    }
                    messages.push(MessageParam::new_with_blocks(
                        image_blocks,
                        MessageRole::User,
                    ));
                }
            }
        }
    }
    flush_tool_results(&mut pending_tool_results, &mut messages);

    let thinking_budget: Option<u32> = match req.thinking_effort {
        Some(ThinkingEffort::Low) => Some(2048),
        Some(ThinkingEffort::Medium) => Some(8192),
        Some(ThinkingEffort::High) => Some(16384),
        _ => None,
    };

    let base_max_tokens = req.max_tokens.filter(|&n| n > 0).unwrap_or(4096);
    let max_tokens = match thinking_budget {
        Some(budget) => base_max_tokens.max(budget + 2048),
        None => base_max_tokens,
    };

    let mut params = MessageCreateParams::new(
        max_tokens,
        messages,
        Model::Custom(req.model_id.to_string()),
    );

    if let Some(sys) = req.system_prompt.map(str::trim).filter(|s| !s.is_empty()) {
        params = params.with_system(SystemPrompt::from(sys.to_string()));
    }
    if let Some(budget) = thinking_budget {
        params = params.with_thinking(ThinkingConfig::enabled(budget));
    }
    if !req.tools.is_empty() {
        let tools: Vec<ToolUnionParam> = req
            .tools
            .iter()
            .map(|tool| {
                let schema = if tool.parameters.is_object() {
                    tool.parameters.clone()
                } else {
                    json!({ "type": "object", "properties": {} })
                };
                let mut param = ToolParam::new(tool.name.clone(), schema);
                if !tool.description.is_empty() {
                    param = param.with_description(tool.description.clone());
                }
                ToolUnionParam::CustomTool(param)
            })
            .collect();
        params = params.with_tools(tools);
    }

    let raw_stream = tokio::select! {
        res = client.stream(&params) => {
            res.map_err(|err| classify_provider_error(err.to_string()))?
        }
        _ = cancel_rx.changed() => {
            return Err(AppError::cancelled("Chat cancelled."));
        }
    };
    let mut stream = pin!(raw_stream);

    let mut content = String::new();
    let mut tool_call_map: BTreeMap<usize, ProviderToolCall> = BTreeMap::new();
    let mut input_tokens: Option<u64> = None;
    let mut output_tokens: Option<u64> = None;

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

        let Some(event_res) = next_item else {
            break;
        };
        let event = event_res.map_err(|err| classify_provider_error(err.to_string()))?;
        match event {
            MessageStreamEvent::MessageStart(start) => {
                let u = start.message.usage;
                let total_in = (u.input_tokens.max(0) as u64)
                    .saturating_add(u.cache_creation_input_tokens.unwrap_or(0).max(0) as u64)
                    .saturating_add(u.cache_read_input_tokens.unwrap_or(0).max(0) as u64);
                input_tokens = Some(total_in);
                if u.output_tokens > 0 {
                    output_tokens = Some(u.output_tokens as u64);
                }
            }
            MessageStreamEvent::MessageDelta(delta_ev) => {
                if let Some(inp) = delta_ev.usage.input_tokens {
                    let total_in = (inp.max(0) as u64)
                        .saturating_add(
                            delta_ev
                                .usage
                                .cache_creation_input_tokens
                                .unwrap_or(0)
                                .max(0) as u64,
                        )
                        .saturating_add(
                            delta_ev
                                .usage
                                .cache_read_input_tokens
                                .unwrap_or(0)
                                .max(0) as u64,
                        );
                    input_tokens = Some(total_in);
                }
                output_tokens = Some(delta_ev.usage.output_tokens.max(0) as u64);
            }
            MessageStreamEvent::ContentBlockStart(start) => {
                if let ContentBlock::ToolUse(tu) = start.content_block {
                    let id = if tu.id.is_empty() {
                        format!("toolu_{}", start.index + 1)
                    } else {
                        tu.id
                    };
                    tool_call_map.insert(
                        start.index,
                        ProviderToolCall {
                            id,
                            name: tu.name,
                            arguments_text: String::new(),
                        },
                    );
                }
            }
            MessageStreamEvent::ContentBlockDelta(delta_ev) => match delta_ev.delta {
                ContentBlockDelta::TextDelta(td) => {
                    if !td.text.is_empty() {
                        content.push_str(&td.text);
                        on_delta(StreamDelta {
                            content: Some(td.text),
                            reasoning: None,
                        });
                    }
                }
                ContentBlockDelta::ThinkingDelta(td) => {
                    if !td.thinking.is_empty() {
                        on_delta(StreamDelta {
                            content: None,
                            reasoning: Some(td.thinking),
                        });
                    }
                }
                ContentBlockDelta::InputJsonDelta(jd) => {
                    if let Some(call) = tool_call_map.get_mut(&delta_ev.index) {
                        call.arguments_text.push_str(&jd.partial_json);
                    }
                }
                _ => {}
            },
            MessageStreamEvent::StreamError { error } => {
                return Err(classify_provider_error(error.message));
            }
            _ => {}
        }
    }

    let tool_calls = tool_call_map
        .into_values()
        .filter(|call| !call.name.is_empty())
        .collect();

    let usage = TokenUsage {
        input_tokens,
        output_tokens,
        total_tokens: None,
    }
    .normalized();

    Ok(ChatRoundResult {
        content,
        tool_calls,
        usage,
    })
}

pub(crate) async fn fetch_models(
    base: &str,
    endpoint: &EndpointConfig,
) -> AppResult<Vec<RemoteModelInfo>> {
    let client = build_client(base, &endpoint.api_key)?;
    let resp = client
        .list_models(None)
        .await
        .map_err(|err| classify_provider_error(err.to_string()))?;
    let models = resp
        .data
        .into_iter()
        .filter_map(|item| {
            let id = item.id.trim().to_string();
            if id.is_empty() {
                None
            } else {
                let display = item.display_name.trim().to_string();
                Some(RemoteModelInfo {
                    id,
                    name: if display.is_empty() { None } else { Some(display) },
                })
            }
        })
        .collect();
    Ok(models)
}
