//! MCP 工具查看器所有 Tauri IPC 命令入口。

use rmcp::model::{CallToolResult, GetPromptResult, JsonObject, ReadResourceResult};
use serde_json::Value;

use crate::core::{
    db::Database,
    error::{api_ok, api_result, ApiResult, AppError},
};

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
) -> ApiResult<Vec<StoredConnection>> {
    api_result(load_stored_connections(db.inner()).await)
}

#[tauri::command]
pub(crate) async fn mcp_save_connections(
    db: tauri::State<'_, Database>,
    connections: Vec<StoredConnection>,
) -> ApiResult<Vec<StoredConnection>> {
    api_result(save_stored_connections(db.inner(), connections).await)
}

#[tauri::command]
pub(crate) async fn mcp_connect(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    config: McpConfig,
) -> ApiResult<McpServerInfo> {
    api_result(
        connect_session(&app, sessions.inner(), session_id, config)
            .await
            .map_err(AppError::from),
    )
}

#[tauri::command]
pub(crate) async fn mcp_disconnect(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
) -> ApiResult<()> {
    disconnect_session(sessions.inner(), &session_id).await;
    api_ok(())
}

#[tauri::command]
pub(crate) async fn mcp_active_sessions(
    sessions: tauri::State<'_, McpSessions>,
) -> ApiResult<Vec<String>> {
    api_ok(active_session_ids(sessions.inner()).await)
}

#[tauri::command]
pub(crate) async fn mcp_list_entries(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    catalog: McpCatalog,
) -> ApiResult<Value> {
    api_result(
        list_entries(sessions.inner(), &session_id, catalog)
            .await
            .map_err(AppError::from),
    )
}

#[tauri::command]
pub(crate) async fn mcp_call_tool(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    name: String,
    arguments: JsonObject,
) -> ApiResult<CallToolResult> {
    api_result(
        call_tool_on_session(sessions.inner(), &session_id, name, arguments)
            .await
            .map_err(AppError::from),
    )
}

#[tauri::command]
pub(crate) async fn mcp_get_prompt(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    name: String,
    arguments: JsonObject,
) -> ApiResult<GetPromptResult> {
    api_result(
        get_prompt(sessions.inner(), &session_id, name, arguments)
            .await
            .map_err(AppError::from),
    )
}

#[tauri::command]
pub(crate) async fn mcp_read_resource(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    uri: String,
) -> ApiResult<ReadResourceResult> {
    api_result(
        read_resource(sessions.inner(), &session_id, uri)
            .await
            .map_err(AppError::from),
    )
}
