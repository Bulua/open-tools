//! AI 多轮对话编排、MCP 工具调度、安全审批状态机与流式事件推送引擎。

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rmcp::model::JsonObject;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use specta::Type;
use tauri::{ipc::Channel, AppHandle};
use tokio::sync::{oneshot, watch};

use crate::core::db::Database;
use crate::core::error::{AppError, AppErrorCode, AppResult};
use crate::tools::network::mcp_inspector::{
    sessions::{call_tool_on_session, connect_or_reuse_session, inspect_session, McpSessions},
    store::load_stored_connections,
};

use super::commands::read_image_impl;
use super::paths::{ensure_conversation_workspace_dir, resolve_target_path};
use super::prompt::build_system_prompt;
use super::providers::{
    safe_parse_json_object, stream_chat_round, ChatRoundRequest, PromptTurn,
    ProviderToolDefinition, ThinkingEffort,
};
use super::registry::{
    AiToolContext, AiToolOutputFile, AiToolRegistry, ToolApprovalPolicy,
};
use super::shell::AiCommandState;
use super::store::{
    read_disabled_builtin_tools, resolve_model_credentials, ResolvedModelCredentials,
};

const MAX_TOOL_ROUNDS: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ToolApprovalDecision {
    Once,
    Session,
    Deny,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ExecutionPolicy {
    Review,
    Auto,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ApprovalKind {
    Command,
    ExternalWrite,
    Tool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ToolCallStatus {
    Done,
    Error,
}

#[derive(Debug, Clone, Default)]
struct SessionApproval {
    allow_command: bool,
    allow_external_write: bool,
}

struct ActiveChatHandle {
    cancel_tx: watch::Sender<bool>,
    active_run_id: Arc<Mutex<Option<String>>>,
    pending_approval: Arc<Mutex<Option<oneshot::Sender<ToolApprovalDecision>>>>,
}

/// 管理进行中的 AI 对话取消句柄、工具审批挂起队列与会话级放行策略。
#[derive(Default)]
pub(crate) struct AiChatState {
    active: Mutex<HashMap<String, ActiveChatHandle>>,
    session_approvals: Mutex<HashMap<String, SessionApproval>>,
}

impl AiChatState {
    fn register(
        &self,
        conversation_id: &str,
    ) -> AppResult<(
        watch::Receiver<bool>,
        Arc<Mutex<Option<String>>>,
        Arc<Mutex<Option<oneshot::Sender<ToolApprovalDecision>>>>,
    )> {
        let mut guard = self.active.lock().unwrap_or_else(|e| e.into_inner());
        if guard.contains_key(conversation_id) {
            return Err(AppError::busy(
                "A chat turn is already running for this conversation.",
            ));
        }
        let (cancel_tx, cancel_rx) = watch::channel(false);
        let active_run_id = Arc::new(Mutex::new(None));
        let pending_approval = Arc::new(Mutex::new(None));
        guard.insert(
            conversation_id.to_string(),
            ActiveChatHandle {
                cancel_tx,
                active_run_id: active_run_id.clone(),
                pending_approval: pending_approval.clone(),
            },
        );
        Ok((cancel_rx, active_run_id, pending_approval))
    }

    fn unregister(&self, conversation_id: &str) {
        let mut guard = self.active.lock().unwrap_or_else(|e| e.into_inner());
        guard.remove(conversation_id);
    }

    pub(crate) fn cancel(&self, conversation_id: &str, command_state: &AiCommandState) -> bool {
        let (run_id, approval_tx, found) = {
            let guard = self.active.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(handle) = guard.get(conversation_id) {
                let _ = handle.cancel_tx.send(true);
                let run_id = handle
                    .active_run_id
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .clone();
                let approval_tx = handle
                    .pending_approval
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .take();
                (run_id, approval_tx, true)
            } else {
                (None, None, false)
            }
        };
        if let Some(tx) = approval_tx {
            let _ = tx.send(ToolApprovalDecision::Deny);
        }
        if let Some(id) = run_id {
            command_state.cancel(&id);
        }
        found
    }

    pub(crate) fn resolve_approval(
        &self,
        conversation_id: &str,
        decision: ToolApprovalDecision,
    ) -> bool {
        if decision == ToolApprovalDecision::Session {
            let mut perms = self
                .session_approvals
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            let entry = perms.entry(conversation_id.to_string()).or_default();
            entry.allow_command = true;
            entry.allow_external_write = true;
        }
        let tx = {
            let guard = self.active.lock().unwrap_or_else(|e| e.into_inner());
            guard.get(conversation_id).and_then(|handle| {
                handle
                    .pending_approval
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .take()
            })
        };
        tx.map(|sender| sender.send(decision).is_ok())
            .unwrap_or(false)
    }

    pub(crate) fn set_policy(&self, conversation_id: &str, policy: ExecutionPolicy) {
        let allow = policy == ExecutionPolicy::Auto;
        {
            let mut perms = self
                .session_approvals
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            let entry = perms.entry(conversation_id.to_string()).or_default();
            entry.allow_command = allow;
            entry.allow_external_write = allow;
        }
        if allow {
            let _ = self.resolve_approval(conversation_id, ToolApprovalDecision::Once);
        }
    }

    pub(crate) fn clear_session(&self, conversation_id: &str) {
        let mut perms = self
            .session_approvals
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        perms.remove(conversation_id);
    }

    fn session_allows_command(&self, conversation_id: &str) -> bool {
        let perms = self
            .session_approvals
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        perms
            .get(conversation_id)
            .map(|p| p.allow_command)
            .unwrap_or(false)
    }

    fn session_allows_external_write(&self, conversation_id: &str) -> bool {
        let perms = self
            .session_approvals
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        perms
            .get(conversation_id)
            .map(|p| p.allow_external_write)
            .unwrap_or(false)
    }
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiChatRunRequest {
    pub(crate) conversation_id: String,
    /// 模型配置 ID，后端直接从 SQLite 读取协议、地址并解密 API Key，前端不再传递明文密钥
    pub(crate) model_config_id: String,
    pub(crate) messages: Vec<PromptTurn>,
    #[serde(default)]
    pub(crate) workspace_dir: Option<String>,
    #[serde(default)]
    pub(crate) execution_policy: Option<ExecutionPolicy>,
    #[serde(default)]
    pub(crate) thinking_effort: Option<ThinkingEffort>,
    #[serde(default)]
    pub(crate) enabled_mcp_ids: Vec<String>,
    #[serde(default)]
    pub(crate) builtin_tool_badge: Option<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum AiChatEvent {
    ReasoningDelta {
        text: String,
    },
    ContentDelta {
        text: String,
    },
    RoundSeparator,
    ToolCallStart {
        id: String,
        #[serde(rename = "serverId")]
        server_id: String,
        #[serde(rename = "serverName")]
        server_name: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "argumentsText")]
        arguments_text: String,
    },
    ApprovalRequired {
        id: String,
        #[serde(rename = "conversationId")]
        conversation_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        kind: ApprovalKind,
        #[serde(skip_serializing_if = "Option::is_none")]
        command: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        shell: Option<String>,
        #[serde(rename = "targetPath", skip_serializing_if = "Option::is_none")]
        target_path: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cwd: Option<String>,
        #[serde(rename = "argumentsText", skip_serializing_if = "Option::is_none")]
        arguments_text: Option<String>,
    },
    ApprovalCleared {
        #[serde(rename = "conversationId")]
        conversation_id: String,
    },
    SessionPolicyChanged {
        #[serde(rename = "executionPolicy")]
        execution_policy: ExecutionPolicy,
    },
    ToolCallResult {
        id: String,
        status: ToolCallStatus,
        #[serde(rename = "resultText")]
        result_text: String,
        #[serde(rename = "outputFile", skip_serializing_if = "Option::is_none")]
        output_file: Option<AiToolOutputFile>,
    },
    Notice {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiChatRunResult {
    pub(crate) aborted: bool,
    #[specta(type = f64)]
    pub(crate) duration_ms: u64,
}

struct ActiveMcpTool {
    function_name: String,
    server_id: String,
    server_name: String,
    tool_name: String,
    description: String,
    input_schema: Value,
}

fn ai_mcp_session_id(connection_id: &str) -> String {
    format!("ai-chat:{connection_id}")
}

fn build_safe_function_name(
    server_index: usize,
    tool_name: &str,
    used: &mut HashSet<String>,
) -> String {
    let clean: String = tool_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let mut candidate = format!("mcp_{server_index}_{clean}");
    if candidate.len() > 60 {
        candidate.truncate(60);
    }
    if used.insert(candidate.clone()) {
        return candidate;
    }
    let mut suffix = 2usize;
    loop {
        let mut next = format!("{candidate}_{suffix}");
        if next.len() > 64 {
            next.truncate(64);
        }
        if used.insert(next.clone()) {
            return next;
        }
        suffix += 1;
    }
}

fn format_mcp_tool_result(val: &Value) -> String {
    if val.is_null() {
        return String::new();
    }
    if let Some(s) = val.as_str() {
        return s.to_string();
    }
    if let Some(obj) = val.as_object() {
        if let Some(arr) = obj.get("content").and_then(Value::as_array) {
            let parts: Vec<String> = arr
                .iter()
                .map(|item| {
                    if let Some(text) = item.get("text").and_then(Value::as_str) {
                        text.to_string()
                    } else {
                        serde_json::to_string_pretty(item).unwrap_or_default()
                    }
                })
                .collect();
            let joined = parts.join("\n").trim().to_string();
            if !joined.is_empty() {
                let is_err = obj.get("isError").and_then(Value::as_bool).unwrap_or(false);
                return if is_err {
                    format!("Error: {joined}")
                } else {
                    joined
                };
            }
        }
    }
    serde_json::to_string_pretty(val).unwrap_or_default()
}

async fn collect_enabled_mcp_tools(
    app: &AppHandle,
    db: &Database,
    sessions: &McpSessions,
    enabled_ids: &[String],
    on_event: &Channel<AiChatEvent>,
) -> Vec<ActiveMcpTool> {
    if enabled_ids.is_empty() {
        return Vec::new();
    }
    let stored = match load_stored_connections(db).await {
        Ok(list) => list,
        Err(err) => {
            let _ = on_event.send(AiChatEvent::Notice {
                message: err.message,
            });
            return Vec::new();
        }
    };
    let enabled_set: HashSet<&str> = enabled_ids.iter().map(String::as_str).collect();
    let targets: Vec<_> = stored
        .into_iter()
        .filter(|c| enabled_set.contains(c.id.as_str()))
        .collect();
    if targets.is_empty() {
        return Vec::new();
    }

    let mut entries = Vec::new();
    let mut used_names = HashSet::new();
    for (idx, conn) in targets.into_iter().enumerate() {
        let session_id = ai_mcp_session_id(&conn.id);
        if let Err(err) =
            connect_or_reuse_session(app, sessions, session_id.clone(), conn.config).await
        {
            let _ = on_event.send(AiChatEvent::Notice {
                message: format!("{}: {err}", conn.name),
            });
            continue;
        }
        let snapshot = match inspect_session(sessions, &session_id).await {
            Ok(s) => s,
            Err(err) => {
                let _ = on_event.send(AiChatEvent::Notice {
                    message: format!("{}: {err}", conn.name),
                });
                continue;
            }
        };
        for tool in snapshot.tools {
            let tool_name = tool.name.to_string();
            let description = tool
                .description
                .as_deref()
                .filter(|s| !s.is_empty())
                .or(tool.title.as_deref().filter(|s| !s.is_empty()))
                .unwrap_or(&tool_name)
                .to_string();
            let input_schema = serde_json::to_value(&tool.input_schema)
                .unwrap_or_else(|_| serde_json::json!({ "type": "object", "properties": {} }));
            let function_name = build_safe_function_name(idx + 1, &tool_name, &mut used_names);
            entries.push(ActiveMcpTool {
                function_name,
                server_id: conn.id.clone(),
                server_name: conn.name.clone(),
                tool_name,
                description,
                input_schema,
            });
        }
    }
    entries
}

/// 按需从磁盘读取已落盘的图片附件，生成 base64 Data URL 供多模态 SDK 使用。
async fn hydrate_turns(turns: &mut [PromptTurn], workspace_dir: &str) {
    if workspace_dir.trim().is_empty() {
        return;
    }
    for turn in turns.iter_mut() {
        if let PromptTurn::User { attachments, .. } = turn {
            for att in attachments.iter_mut() {
                if att.kind != "image" || att.data_url.as_deref().is_some_and(|s| !s.is_empty()) {
                    continue;
                }
                let Some(path) = att.file_path.as_deref().filter(|p| !p.is_empty()) else {
                    continue;
                };
                if let Ok(img) = read_image_impl(workspace_dir.to_string(), path.to_string()).await
                {
                    att.data_url = Some(img.data_url);
                }
            }
        }
    }
}

async fn wait_for_approval(
    pending_slot: &Arc<Mutex<Option<oneshot::Sender<ToolApprovalDecision>>>>,
    cancel_rx: &mut watch::Receiver<bool>,
    on_event: &Channel<AiChatEvent>,
    event: AiChatEvent,
    conversation_id: &str,
) -> ToolApprovalDecision {
    if *cancel_rx.borrow() {
        return ToolApprovalDecision::Deny;
    }
    let (tx, rx) = oneshot::channel();
    {
        let mut slot = pending_slot.lock().unwrap_or_else(|e| e.into_inner());
        *slot = Some(tx);
    }
    let _ = on_event.send(event);

    let decision = tokio::select! {
        res = rx => res.unwrap_or(ToolApprovalDecision::Deny),
        _ = cancel_rx.changed() => ToolApprovalDecision::Deny,
    };

    {
        let mut slot = pending_slot.lock().unwrap_or_else(|e| e.into_inner());
        slot.take();
    }
    let _ = on_event.send(AiChatEvent::ApprovalCleared {
        conversation_id: conversation_id.to_string(),
    });
    decision
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn run_chat_turn(
    app: &AppHandle,
    db: &Database,
    registry: &AiToolRegistry,
    command_state: &AiCommandState,
    mcp_sessions: &McpSessions,
    chat_state: &AiChatState,
    req: AiChatRunRequest,
    on_event: Channel<AiChatEvent>,
) -> AppResult<AiChatRunResult> {
    let started = Instant::now();
    let conv_id = req.conversation_id.clone();

    let creds = resolve_model_credentials(db, &req.model_config_id).await?;

    let (mut cancel_rx, active_run_id, pending_approval) = chat_state.register(&conv_id)?;

    let result = run_chat_turn_inner(
        app,
        db,
        registry,
        command_state,
        mcp_sessions,
        chat_state,
        creds,
        req,
        &on_event,
        &mut cancel_rx,
        &active_run_id,
        &pending_approval,
    )
    .await;

    chat_state.unregister(&conv_id);
    let duration_ms = started.elapsed().as_millis() as u64;

    match result {
        Ok(aborted) => Ok(AiChatRunResult {
            aborted,
            duration_ms,
        }),
        Err(err) if err.code == AppErrorCode::Cancelled || *cancel_rx.borrow() => {
            Ok(AiChatRunResult {
                aborted: true,
                duration_ms,
            })
        }
        Err(err) => Err(err),
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_chat_turn_inner(
    app: &AppHandle,
    db: &Database,
    registry: &AiToolRegistry,
    command_state: &AiCommandState,
    mcp_sessions: &McpSessions,
    chat_state: &AiChatState,
    creds: ResolvedModelCredentials,
    req: AiChatRunRequest,
    on_event: &Channel<AiChatEvent>,
    cancel_rx: &mut watch::Receiver<bool>,
    active_run_id: &Arc<Mutex<Option<String>>>,
    pending_approval: &Arc<Mutex<Option<oneshot::Sender<ToolApprovalDecision>>>>,
) -> AppResult<bool> {
    let workspace_dir = match req
        .workspace_dir
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(dir) => dir.to_string(),
        None => ensure_conversation_workspace_dir(app, &req.conversation_id)?,
    };

    let system_prompt = build_system_prompt(&workspace_dir);
    let disabled_builtin_tools = read_disabled_builtin_tools(db).await?;
    let builtin_defs = registry.definitions();
    let all_builtin_names: HashSet<String> =
        builtin_defs.iter().map(|d| d.name.clone()).collect();
    let enabled_builtin_defs: Vec<_> = builtin_defs
        .into_iter()
        .filter(|d| !disabled_builtin_tools.contains(&d.name))
        .collect();
    let builtin_by_name: HashMap<String, ToolApprovalPolicy> = enabled_builtin_defs
        .iter()
        .map(|d| (d.name.clone(), d.approval))
        .collect();

    let mut all_tool_defs: Vec<ProviderToolDefinition> = enabled_builtin_defs
        .into_iter()
        .map(|d| ProviderToolDefinition {
            name: d.name,
            description: d.description,
            parameters: d.parameters,
        })
        .collect();

    let mcp_entries =
        collect_enabled_mcp_tools(app, db, mcp_sessions, &req.enabled_mcp_ids, on_event).await;
    let mut mcp_by_fn: HashMap<String, ActiveMcpTool> = HashMap::new();
    for entry in mcp_entries {
        all_tool_defs.push(ProviderToolDefinition {
            name: entry.function_name.clone(),
            description: entry.description.clone(),
            parameters: entry.input_schema.clone(),
        });
        mcp_by_fn.insert(entry.function_name.clone(), entry);
    }

    let mut turns = req.messages;
    hydrate_turns(&mut turns, &workspace_dir).await;

    let builtin_badge = req
        .builtin_tool_badge
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Built-in".to_string());

    let mut auto_all = req.execution_policy == Some(ExecutionPolicy::Auto);

    for round in 0..MAX_TOOL_ROUNDS {
        if *cancel_rx.borrow() {
            return Ok(true);
        }

        let round_req = ChatRoundRequest {
            endpoint: &creds.endpoint,
            model_id: &creds.model_id,
            messages: &turns,
            system_prompt: if system_prompt.trim().is_empty() {
                None
            } else {
                Some(&system_prompt)
            },
            max_tokens: creds.max_tokens,
            thinking_effort: req.thinking_effort,
            tools: &all_tool_defs,
        };

        let mut on_delta = |delta: super::providers::StreamDelta| {
            if let Some(r) = delta.reasoning {
                let _ = on_event.send(AiChatEvent::ReasoningDelta { text: r });
            }
            if let Some(c) = delta.content {
                let _ = on_event.send(AiChatEvent::ContentDelta { text: c });
            }
        };

        let round_result = stream_chat_round(&round_req, cancel_rx, &mut on_delta).await?;

        if round_result.tool_calls.is_empty() || *cancel_rx.borrow() {
            return Ok(*cancel_rx.borrow());
        }

        turns.push(PromptTurn::Assistant {
            content: round_result.content,
            tool_calls: round_result.tool_calls.clone(),
        });

        for (call_idx, call) in round_result.tool_calls.into_iter().enumerate() {
            if *cancel_rx.borrow() {
                return Ok(true);
            }

            let args_text = if call.arguments_text.is_empty() {
                "{}".to_string()
            } else {
                call.arguments_text.clone()
            };

            if disabled_builtin_tools.contains(&call.name) && all_builtin_names.contains(&call.name) {
                let _ = on_event.send(AiChatEvent::ToolCallStart {
                    id: call.id.clone(),
                    server_id: "__builtin__".into(),
                    server_name: builtin_badge.clone(),
                    tool_name: call.name.clone(),
                    arguments_text: args_text.clone(),
                });
                let msg = format!("Built-in tool '{}' is disabled in settings.", call.name);
                let _ = on_event.send(AiChatEvent::ToolCallResult {
                    id: call.id.clone(),
                    status: ToolCallStatus::Error,
                    result_text: msg.clone(),
                    output_file: None,
                });
                turns.push(PromptTurn::Tool {
                    tool_call_id: call.id,
                    tool_name: call.name,
                    content: msg,
                });
                continue;
            }

            if let Some(&approval_policy) = builtin_by_name.get(&call.name) {
                let parsed_args = safe_parse_json_object(&args_text);
                let _ = on_event.send(AiChatEvent::ToolCallStart {
                    id: call.id.clone(),
                    server_id: "__builtin__".into(),
                    server_name: builtin_badge.clone(),
                    tool_name: call.name.clone(),
                    arguments_text: args_text.clone(),
                });

                let mut approved = true;

                if approval_policy == ToolApprovalPolicy::Command
                    && !auto_all
                    && !chat_state.session_allows_command(&req.conversation_id)
                {
                    let is_shell = call.name == "run_command";
                    let approval_ev = if is_shell {
                        let cmd_str = parsed_args
                            .get("command")
                            .and_then(Value::as_str)
                            .unwrap_or(&args_text)
                            .to_string();
                        let shell_str = parsed_args
                            .get("shell")
                            .and_then(Value::as_str)
                            .filter(|s| !s.trim().is_empty())
                            .unwrap_or("powershell")
                            .to_string();
                        let cwd_str = parsed_args
                            .get("cwd")
                            .and_then(Value::as_str)
                            .filter(|s| !s.trim().is_empty())
                            .unwrap_or(&workspace_dir)
                            .to_string();
                        AiChatEvent::ApprovalRequired {
                            id: call.id.clone(),
                            conversation_id: req.conversation_id.clone(),
                            tool_name: call.name.clone(),
                            kind: ApprovalKind::Command,
                            command: Some(cmd_str),
                            shell: Some(shell_str),
                            target_path: None,
                            cwd: Some(cwd_str),
                            arguments_text: None,
                        }
                    } else {
                        let formatted_args = serde_json::to_string_pretty(&parsed_args)
                            .unwrap_or_else(|_| args_text.clone());
                        AiChatEvent::ApprovalRequired {
                            id: call.id.clone(),
                            conversation_id: req.conversation_id.clone(),
                            tool_name: call.name.clone(),
                            kind: ApprovalKind::Tool,
                            command: None,
                            shell: None,
                            target_path: None,
                            cwd: None,
                            arguments_text: Some(formatted_args),
                        }
                    };
                    let decision = wait_for_approval(
                        pending_approval,
                        cancel_rx,
                        on_event,
                        approval_ev,
                        &req.conversation_id,
                    )
                    .await;
                    if decision == ToolApprovalDecision::Session {
                        auto_all = true;
                        let _ = on_event.send(AiChatEvent::SessionPolicyChanged {
                            execution_policy: ExecutionPolicy::Auto,
                        });
                    }
                    approved = decision != ToolApprovalDecision::Deny;
                } else if approval_policy == ToolApprovalPolicy::ExternalWrite
                    && !auto_all
                    && !chat_state.session_allows_external_write(&req.conversation_id)
                {
                    let raw_target = parsed_args
                        .get("output_path")
                        .and_then(Value::as_str)
                        .filter(|s| !s.trim().is_empty())
                        .or_else(|| {
                            parsed_args
                                .get("path")
                                .and_then(Value::as_str)
                                .filter(|s| !s.trim().is_empty())
                        });
                    if let Some(target) = raw_target {
                        if let Ok((_root, resolved, outside)) =
                            resolve_target_path(&workspace_dir, Some(target))
                        {
                            if outside {
                                let approval_ev = AiChatEvent::ApprovalRequired {
                                    id: call.id.clone(),
                                    conversation_id: req.conversation_id.clone(),
                                    tool_name: call.name.clone(),
                                    kind: ApprovalKind::ExternalWrite,
                                    command: None,
                                    shell: None,
                                    target_path: Some(resolved.to_string_lossy().to_string()),
                                    cwd: None,
                                    arguments_text: None,
                                };
                                let decision = wait_for_approval(
                                    pending_approval,
                                    cancel_rx,
                                    on_event,
                                    approval_ev,
                                    &req.conversation_id,
                                )
                                .await;
                                if decision == ToolApprovalDecision::Session {
                                    auto_all = true;
                                    let _ = on_event.send(AiChatEvent::SessionPolicyChanged {
                                        execution_policy: ExecutionPolicy::Auto,
                                    });
                                }
                                approved = decision != ToolApprovalDecision::Deny;
                            }
                        }
                    }
                }

                let tool_result_text = if !approved || *cancel_rx.borrow() {
                    let msg = if *cancel_rx.borrow() {
                        "Tool execution cancelled by user.".to_string()
                    } else {
                        "User denied permission to run this tool.".to_string()
                    };
                    let _ = on_event.send(AiChatEvent::ToolCallResult {
                        id: call.id.clone(),
                        status: ToolCallStatus::Error,
                        result_text: msg.clone(),
                        output_file: None,
                    });
                    msg
                } else {
                    let run_id = format!("{}_{}_{}", req.conversation_id, round, call_idx);
                    {
                        let mut slot = active_run_id.lock().unwrap_or_else(|e| e.into_inner());
                        *slot = Some(run_id.clone());
                    }
                    let ctx = AiToolContext {
                        app,
                        run_id: &run_id,
                        workspace_dir: &workspace_dir,
                        command_state,
                    };
                    let res = registry.execute(&call.name, parsed_args, &ctx).await;
                    {
                        let mut slot = active_run_id.lock().unwrap_or_else(|e| e.into_inner());
                        *slot = None;
                    }
                    let _ = on_event.send(AiChatEvent::ToolCallResult {
                        id: call.id.clone(),
                        status: if res.is_error {
                            ToolCallStatus::Error
                        } else {
                            ToolCallStatus::Done
                        },
                        result_text: res.text.clone(),
                        output_file: if res.is_error { None } else { res.output_file },
                    });
                    res.text
                };

                turns.push(PromptTurn::Tool {
                    tool_call_id: call.id,
                    tool_name: call.name,
                    content: tool_result_text,
                });
                continue;
            }

            // MCP 工具调用分支
            let entry = mcp_by_fn.get(&call.name);
            let _ = on_event.send(AiChatEvent::ToolCallStart {
                id: call.id.clone(),
                server_id: entry.map(|e| e.server_id.clone()).unwrap_or_default(),
                server_name: entry
                    .map(|e| e.server_name.clone())
                    .unwrap_or_else(|| "MCP".into()),
                tool_name: entry
                    .map(|e| e.tool_name.clone())
                    .unwrap_or_else(|| call.name.clone()),
                arguments_text: args_text.clone(),
            });

            let (status, tool_result_text) = if let Some(mcp_tool) = entry {
                let args_map: JsonObject = match safe_parse_json_object(&args_text) {
                    Value::Object(map) => map,
                    _ => Map::new(),
                };
                match call_tool_on_session(
                    mcp_sessions,
                    &ai_mcp_session_id(&mcp_tool.server_id),
                    mcp_tool.tool_name.clone(),
                    args_map,
                )
                .await
                {
                    Ok(res) => {
                        let val = serde_json::to_value(&res).unwrap_or(Value::Null);
                        let is_err = val
                            .get("isError")
                            .and_then(Value::as_bool)
                            .unwrap_or(false);
                        (
                            if is_err {
                                ToolCallStatus::Error
                            } else {
                                ToolCallStatus::Done
                            },
                            format_mcp_tool_result(&val),
                        )
                    }
                    Err(err) => (ToolCallStatus::Error, err),
                }
            } else {
                (
                    ToolCallStatus::Error,
                    format!("Unknown MCP tool: {}", call.name),
                )
            };

            let _ = on_event.send(AiChatEvent::ToolCallResult {
                id: call.id.clone(),
                status,
                result_text: tool_result_text.clone(),
                output_file: None,
            });

            turns.push(PromptTurn::Tool {
                tool_call_id: call.id,
                tool_name: call.name,
                content: tool_result_text,
            });
        }

        let _ = on_event.send(AiChatEvent::RoundSeparator);
    }

    Ok(*cancel_rx.borrow())
}
