//! 多厂商大模型 SDK 统一适配层（OpenAI / Anthropic / Google Gemini）。

pub(crate) mod anthropic;
pub(crate) mod gemini;
pub(crate) mod openai;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use specta::Type;
use tokio::sync::watch;

use crate::core::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ApiProtocol {
    Openai,
    Anthropic,
    Gemini,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ThinkingEffort {
    None,
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EndpointConfig {
    pub(crate) protocol: ApiProtocol,
    pub(crate) base_url: String,
    #[serde(default)]
    pub(crate) api_key: String,
    #[serde(default)]
    pub(crate) requires_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderToolDefinition {
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) description: String,
    pub(crate) parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderToolCall {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) arguments_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AttachmentPayload {
    #[serde(default)]
    pub(crate) id: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) mime_type: String,
    #[serde(default)]
    #[specta(type = f64)]
    pub(crate) size: u64,
    pub(crate) kind: String,
    #[serde(default)]
    pub(crate) file_path: Option<String>,
    #[serde(default)]
    pub(crate) data_url: Option<String>,
    #[serde(default)]
    pub(crate) text_content: Option<String>,
    #[serde(default)]
    pub(crate) truncated: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "role", rename_all = "lowercase")]
pub(crate) enum PromptTurn {
    User {
        #[serde(default)]
        content: String,
        #[serde(default)]
        attachments: Vec<AttachmentPayload>,
    },
    Assistant {
        #[serde(default)]
        content: String,
        #[serde(default, rename = "toolCalls")]
        tool_calls: Vec<ProviderToolCall>,
    },
    Tool {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        content: String,
    },
}

#[derive(Debug, Clone, Default)]
pub(crate) struct StreamDelta {
    pub(crate) content: Option<String>,
    pub(crate) reasoning: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct ChatRoundResult {
    pub(crate) content: String,
    pub(crate) tool_calls: Vec<ProviderToolCall>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteModelInfo {
    pub(crate) id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) name: Option<String>,
}

pub(crate) struct ChatRoundRequest<'a> {
    pub(crate) endpoint: &'a EndpointConfig,
    pub(crate) model_id: &'a str,
    pub(crate) messages: &'a [PromptTurn],
    pub(crate) system_prompt: Option<&'a str>,
    pub(crate) max_tokens: Option<u32>,
    pub(crate) thinking_effort: Option<ThinkingEffort>,
    pub(crate) tools: &'a [ProviderToolDefinition],
}

pub(crate) fn strip_trailing_slash(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

pub(crate) fn validate_endpoint(endpoint: &EndpointConfig) -> AppResult<String> {
    let base = strip_trailing_slash(&endpoint.base_url);
    if base.is_empty() {
        return Err(AppError::invalid_input("API base URL is required."));
    }
    if endpoint.requires_key && endpoint.api_key.trim().is_empty() {
        return Err(AppError::unauthorized(
            "API key is required for this provider.",
        ));
    }
    Ok(base)
}

/// 将各厂商 SDK 返回的错误文本按语义归类为精确的 `AppErrorCode`
pub(crate) fn classify_provider_error(err_text: impl Into<String>) -> AppError {
    let msg = err_text.into();
    let lower = msg.to_ascii_lowercase();
    if lower.contains("401")
        || lower.contains("403")
        || lower.contains("unauthorized")
        || lower.contains("invalid api key")
        || lower.contains("invalid_api_key")
        || lower.contains("authentication")
    {
        AppError::unauthorized(msg)
    } else if lower.contains("timed out")
        || lower.contains("timeout")
        || lower.contains("connection")
        || lower.contains("dns")
        || lower.contains("connect error")
    {
        AppError::network(msg)
    } else {
        AppError::provider(msg)
    }
}

pub(crate) fn split_data_url(data_url: &str) -> Option<(String, String)> {
    let rest = data_url.strip_prefix("data:")?;
    let (meta, data) = rest.split_once(";base64,")?;
    if meta.is_empty() || data.is_empty() {
        return None;
    }
    Some((meta.to_string(), data.to_string()))
}

pub(crate) fn format_attachment_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

pub(crate) fn build_text_with_file_attachments(
    content: &str,
    attachments: &[AttachmentPayload],
) -> String {
    if attachments.is_empty() {
        return content.to_string();
    }
    let mut blocks = Vec::new();
    for att in attachments {
        let path_part = att
            .file_path
            .as_deref()
            .filter(|p| !p.is_empty())
            .map(|p| format!(", local path: {p}"))
            .unwrap_or_default();
        if att.kind == "text" {
            if let Some(text_content) = att.text_content.as_deref() {
                let note = if att.truncated.unwrap_or(false) {
                    "\n(Content truncated due to length limit; use read_file on the local path above to inspect remaining lines.)"
                } else {
                    ""
                };
                blocks.push(format!(
                    "[File: {}{path_part}]{note}\n```\n{text_content}\n```",
                    att.name
                ));
            }
        } else if att.kind == "file" {
            let mime = if att.mime_type.is_empty() {
                "application/octet-stream"
            } else {
                &att.mime_type
            };
            blocks.push(format!(
                "[Attached file: {} (type: {mime}, size: {}{path_part})]",
                att.name,
                format_attachment_bytes(att.size)
            ));
        } else if att.kind == "image" && !path_part.is_empty() {
            blocks.push(format!(
                "[Attached image: {} (size: {}{path_part})]",
                att.name,
                format_attachment_bytes(att.size)
            ));
        }
    }
    if blocks.is_empty() {
        return content.to_string();
    }
    if content.trim().is_empty() {
        blocks.join("\n\n")
    } else {
        format!("{}\n\n{content}", blocks.join("\n\n"))
    }
}

pub(crate) fn safe_parse_json_object(text: &str) -> Value {
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(map)) => Value::Object(map),
        _ => Value::Object(Map::new()),
    }
}

/// 将部分模型写在正文中 `<think>...</think>` 标签拆分为思考过程和正文，兼容跨 chunk 边界。
pub(crate) struct ThinkTagSplitter {
    inside: bool,
    pending: String,
}

impl ThinkTagSplitter {
    const OPEN: &'static str = "<think>";
    const CLOSE: &'static str = "</think>";

    pub(crate) fn new() -> Self {
        Self {
            inside: false,
            pending: String::new(),
        }
    }

    fn tail_overlap(text: &str, tag: &str) -> usize {
        let max = text.len().min(tag.len().saturating_sub(1));
        for len in (1..=max).rev() {
            if text.is_char_boundary(text.len() - len) && text.ends_with(&tag[..len]) {
                return len;
            }
        }
        0
    }

    pub(crate) fn push(&mut self, chunk: &str) -> (String, String) {
        let mut content = String::new();
        let mut reasoning = String::new();
        let mut buffer = std::mem::take(&mut self.pending);
        buffer.push_str(chunk);

        while !buffer.is_empty() {
            if !self.inside {
                if let Some(idx) = buffer.find(Self::OPEN) {
                    content.push_str(&buffer[..idx]);
                    buffer.drain(..idx + Self::OPEN.len());
                    self.inside = true;
                } else {
                    let keep = Self::tail_overlap(&buffer, Self::OPEN);
                    let split_at = buffer.len() - keep;
                    content.push_str(&buffer[..split_at]);
                    self.pending.push_str(&buffer[split_at..]);
                    buffer.clear();
                }
            } else if let Some(idx) = buffer.find(Self::CLOSE) {
                reasoning.push_str(&buffer[..idx]);
                buffer.drain(..idx + Self::CLOSE.len());
                self.inside = false;
            } else {
                let keep = Self::tail_overlap(&buffer, Self::CLOSE);
                let split_at = buffer.len() - keep;
                reasoning.push_str(&buffer[..split_at]);
                self.pending.push_str(&buffer[split_at..]);
                buffer.clear();
            }
        }

        (content, reasoning)
    }

    pub(crate) fn flush(&mut self) -> (String, String) {
        if self.pending.is_empty() {
            return (String::new(), String::new());
        }
        let rest = std::mem::take(&mut self.pending);
        if self.inside {
            (String::new(), rest)
        } else {
            (rest, String::new())
        }
    }
}

pub(crate) async fn stream_chat_round(
    req: &ChatRoundRequest<'_>,
    cancel_rx: &mut watch::Receiver<bool>,
    on_delta: &mut (dyn FnMut(StreamDelta) + Send),
) -> AppResult<ChatRoundResult> {
    let base = validate_endpoint(req.endpoint)?;
    match req.endpoint.protocol {
        ApiProtocol::Openai => openai::stream_chat(&base, req, cancel_rx, on_delta).await,
        ApiProtocol::Anthropic => anthropic::stream_chat(&base, req, cancel_rx, on_delta).await,
        ApiProtocol::Gemini => gemini::stream_chat(&base, req, cancel_rx, on_delta).await,
    }
}

pub(crate) async fn fetch_models(endpoint: &EndpointConfig) -> AppResult<Vec<RemoteModelInfo>> {
    let base = validate_endpoint(endpoint)?;
    match endpoint.protocol {
        ApiProtocol::Openai => openai::fetch_models(&base, endpoint).await,
        ApiProtocol::Anthropic => anthropic::fetch_models(&base, endpoint).await,
        ApiProtocol::Gemini => gemini::fetch_models(&base, endpoint).await,
    }
}
