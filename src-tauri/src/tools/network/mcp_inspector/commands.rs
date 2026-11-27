//! MCP 工具查看器所有 Tauri IPC 命令入口。

use rmcp::model::{CallToolResult, GetPromptResult, JsonObject, ReadResourceResult};
use serde_json::Value;

use crate::core::db::Database;

use super::{
    config::McpConfig,
    sessions::{
        active_session_ids, call_tool_on_session, connect_session, disconnect_session, get_prompt,
        list_entries, read_resource, McpCatalog, McpServerInfo, McpSessions,
    },
    store::{load_stored_connections, save_stored_connections, StoredConnection},
};

#[tauri::command]
pub(crate) async fn mcp_read_connections(
    db: tauri::State<'_, Database>,
) -> Result<Vec<StoredConnection>, String> {
    load_stored_connections(db.inner())
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn mcp_save_connections(
    db: tauri::State<'_, Database>,
    connections: Vec<StoredConnection>,
) -> Result<Vec<StoredConnection>, String> {
    save_stored_connections(db.inner(), connections)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn mcp_connect(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    config: McpConfig,
) -> Result<McpServerInfo, String> {
    connect_session(&app, sessions.inner(), session_id, config).await
}

#[tauri::command]
pub(crate) async fn mcp_disconnect(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
) -> Result<(), String> {
    disconnect_session(sessions.inner(), &session_id).await;
    Ok(())
}

#[tauri::command]
pub(crate) async fn mcp_active_sessions(
    sessions: tauri::State<'_, McpSessions>,
) -> Result<Vec<String>, String> {
    Ok(active_session_ids(sessions.inner()).await)
}

#[tauri::command]
pub(crate) async fn mcp_list_entries(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    catalog: McpCatalog,
) -> Result<Value, String> {
    list_entries(sessions.inner(), &session_id, catalog).await
}

#[tauri::command]
pub(crate) async fn mcp_call_tool(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    name: String,
    arguments: JsonObject,
) -> Result<CallToolResult, String> {
    call_tool_on_session(sessions.inner(), &session_id, name, arguments).await
}

#[tauri::command]
pub(crate) async fn mcp_get_prompt(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    name: String,
    arguments: JsonObject,
) -> Result<GetPromptResult, String> {
    get_prompt(sessions.inner(), &session_id, name, arguments).await
}

#[tauri::command]
pub(crate) async fn mcp_read_resource(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    uri: String,
) -> Result<ReadResourceResult, String> {
    read_resource(sessions.inner(), &session_id, uri).await
}
