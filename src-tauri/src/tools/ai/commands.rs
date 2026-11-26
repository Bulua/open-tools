//! AI 模块所有 Tauri IPC 命令入口（持久化、系统提示词上下文、工具统一执行与工作区辅助）。

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use super::fs_tools::{
    edit_file_impl, list_dir_impl, read_file_impl, write_file_impl, EditFileResult, ListDirResult,
    ReadFileResult, WriteFileResult,
};
use super::paths::{ensure_conversation_workspace_dir, resolve_target_path};
use super::prompt::build_system_prompt;
use super::registry::{AiToolContext, AiToolDefinition, AiToolRegistry, AiToolResult};
use super::shell::{run_command_impl, AiCommandState, RunCommandResult};
use super::store::{self, ConversationIndexEntry};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PathCheckResult {
    pub(crate) resolved_path: String,
    pub(crate) outside_workspace: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuiltinAiContext {
    pub(crate) workspace_dir: String,
    pub(crate) system_prompt: String,
    pub(crate) tools: Vec<AiToolDefinition>,
}

// ---------- 配置与会话持久化 ----------

#[tauri::command]
pub(crate) async fn ai_read_config(app: AppHandle) -> Result<Option<String>, String> {
    store::ai_read_config_impl(app).await
}

#[tauri::command]
pub(crate) async fn ai_save_config(app: AppHandle, data: String) -> Result<(), String> {
    store::ai_save_config_impl(app, data).await
}

#[tauri::command]
pub(crate) async fn ai_list_conversations(
    app: AppHandle,
) -> Result<Vec<ConversationIndexEntry>, String> {
    store::ai_list_conversations_impl(app).await
}

#[tauri::command]
pub(crate) async fn ai_read_conversation(
    app: AppHandle,
    id: String,
) -> Result<Option<String>, String> {
    store::ai_read_conversation_impl(app, id).await
}

#[tauri::command]
pub(crate) async fn ai_save_conversation(
    app: AppHandle,
    summary: ConversationIndexEntry,
    data: String,
) -> Result<Vec<ConversationIndexEntry>, String> {
    store::ai_save_conversation_impl(app, summary, data).await
}

#[tauri::command]
pub(crate) async fn ai_delete_conversation(
    app: AppHandle,
    id: String,
) -> Result<Vec<ConversationIndexEntry>, String> {
    store::ai_delete_conversation_impl(app, id).await
}

// ---------- 系统提示词、注册表与统一工具执行 ----------

#[tauri::command]
pub(crate) fn ai_workspace_dir(app: AppHandle, conversation_id: String) -> Result<String, String> {
    ensure_conversation_workspace_dir(&app, &conversation_id)
}

#[tauri::command]
pub(crate) fn ai_builtin_context(
    app: AppHandle,
    registry: State<'_, AiToolRegistry>,
    conversation_id: String,
    custom_workspace_dir: Option<String>,
) -> Result<BuiltinAiContext, String> {
    let workspace_dir = match custom_workspace_dir
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(dir) => dir.to_string(),
        None => ensure_conversation_workspace_dir(&app, &conversation_id)?,
    };
    let system_prompt = build_system_prompt(&workspace_dir);
    let tools = registry.definitions();
    Ok(BuiltinAiContext {
        workspace_dir,
        system_prompt,
        tools,
    })
}

#[tauri::command]
pub(crate) async fn ai_tool_execute(
    registry: State<'_, AiToolRegistry>,
    command_state: State<'_, AiCommandState>,
    run_id: String,
    workspace_dir: String,
    tool_name: String,
    arguments: Value,
) -> Result<AiToolResult, String> {
    let ctx = AiToolContext {
        run_id: &run_id,
        workspace_dir: &workspace_dir,
        command_state: &command_state,
    };
    Ok(registry.execute(&tool_name, arguments, &ctx).await)
}

// ---------- 细粒度工具命令（保留兼容与直调场景） ----------

#[tauri::command]
pub(crate) fn ai_tool_check_path(
    workspace_dir: String,
    path: String,
) -> Result<PathCheckResult, String> {
    if path.trim().is_empty() {
        return Err("File path is required.".into());
    }
    let (_root, resolved, outside) = resolve_target_path(&workspace_dir, Some(&path))?;
    Ok(PathCheckResult {
        resolved_path: resolved.to_string_lossy().to_string(),
        outside_workspace: outside,
    })
}

#[tauri::command]
pub(crate) fn ai_tool_list_dir(
    workspace_dir: String,
    path: Option<String>,
    max_entries: Option<usize>,
) -> Result<ListDirResult, String> {
    list_dir_impl(&workspace_dir, path.as_deref(), max_entries)
}

#[tauri::command]
pub(crate) fn ai_tool_read_file(
    workspace_dir: String,
    path: String,
    start_line: Option<usize>,
    end_line: Option<usize>,
) -> Result<ReadFileResult, String> {
    read_file_impl(&workspace_dir, &path, start_line, end_line)
}

#[tauri::command]
pub(crate) fn ai_tool_write_file(
    workspace_dir: String,
    path: String,
    content: String,
) -> Result<WriteFileResult, String> {
    write_file_impl(&workspace_dir, &path, &content)
}

#[tauri::command]
pub(crate) fn ai_tool_edit_file(
    workspace_dir: String,
    path: String,
    old_text: String,
    new_text: String,
    replace_all: Option<bool>,
) -> Result<EditFileResult, String> {
    edit_file_impl(
        &workspace_dir,
        &path,
        &old_text,
        &new_text,
        replace_all.unwrap_or(false),
    )
}

#[tauri::command]
pub(crate) async fn ai_tool_run_command(
    state: State<'_, AiCommandState>,
    run_id: String,
    workspace_dir: String,
    command: String,
    shell: Option<String>,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<RunCommandResult, String> {
    let cancel_rx = state.register(&run_id);
    let result = run_command_impl(
        cancel_rx,
        &workspace_dir,
        &command,
        shell.as_deref(),
        cwd.as_deref(),
        timeout_secs,
    )
    .await;
    state.unregister(&run_id);
    result
}

#[tauri::command]
pub(crate) fn ai_tool_cancel_command(
    state: State<'_, AiCommandState>,
    run_id: String,
) -> Result<bool, String> {
    Ok(state.cancel(&run_id))
}
