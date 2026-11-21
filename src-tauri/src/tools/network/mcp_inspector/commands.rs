use std::{collections::HashMap, future::Future, time::Duration};

use rmcp::{
    model::{
        CallToolRequestParams, CallToolResult, ClientCapabilities, ClientConfig,
        GetPromptRequestParams, GetPromptResult, Implementation, JsonObject,
        ReadResourceRequestParams, ReadResourceResult,
    },
    service::{Peer, RoleClient, ServiceError},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::{sync::Mutex, time::timeout};

use super::{
    config::McpConfig,
    transport::{connect, McpService},
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Default)]
pub(crate) struct McpSessions(Mutex<HashMap<String, McpService>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct McpServerInfo {
    server_info: Option<Implementation>,
    protocol_version: String,
}

impl McpSessions {
    async fn peer(&self, id: &str) -> Result<Peer<RoleClient>, String> {
        let sessions = self.0.lock().await;
        sessions
            .get(id)
            .filter(|service| !service.is_closed() && !service.peer().is_transport_closed())
            .map(|service| service.peer().clone())
            .ok_or_else(|| "The MCP server is disconnected.".to_owned())
    }
}

#[tauri::command]
pub(crate) async fn mcp_connect(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    config: McpConfig,
) -> Result<McpServerInfo, String> {
    let info = ClientConfig::new(
        ClientCapabilities::default(),
        Implementation::new("open-tools", app.package_info().version.to_string()),
    );
    let service = timeout(REQUEST_TIMEOUT, connect(info, config))
        .await
        .map_err(|_| "The MCP connection timed out after 45 seconds.".to_owned())??;
    let server = service
        .peer_info()
        .ok_or("Missing MCP server information.")?;
    let mut active = sessions.0.lock().await;
    if active.contains_key(&session_id) {
        return Err("This MCP session is already connected.".to_owned());
    }
    active.insert(session_id, service);
    Ok(McpServerInfo {
        server_info: server.server_info.clone(),
        protocol_version: server.protocol_version.to_string(),
    })
}

#[tauri::command]
pub(crate) async fn mcp_disconnect(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
) -> Result<(), String> {
    let service = sessions.0.lock().await.remove(&session_id);
    if let Some(mut service) = service {
        let _ = service.close_with_timeout(Duration::from_secs(4)).await;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn mcp_active_sessions(
    sessions: tauri::State<'_, McpSessions>,
) -> Result<Vec<String>, String> {
    let mut active = sessions.0.lock().await;
    active.retain(|_, service| !service.is_closed() && !service.peer().is_transport_closed());
    Ok(active.keys().cloned().collect())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum McpCatalog {
    Tools,
    Prompts,
    Resources,
    ResourceTemplates,
}

#[tauri::command]
pub(crate) async fn mcp_list_entries(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    catalog: McpCatalog,
) -> Result<Value, String> {
    let peer = sessions.peer(&session_id).await?;
    let server = peer.peer_info().ok_or("Missing MCP server information.")?;
    let capabilities = &server.capabilities;
    let list = match catalog {
        McpCatalog::Tools if capabilities.tools.is_some() => {
            serde_json::to_value(request(peer.list_all_tools()).await?)
        }
        McpCatalog::Prompts if capabilities.prompts.is_some() => {
            serde_json::to_value(request(peer.list_all_prompts()).await?)
        }
        McpCatalog::Resources if capabilities.resources.is_some() => {
            serde_json::to_value(request(peer.list_all_resources()).await?)
        }
        McpCatalog::ResourceTemplates if capabilities.resources.is_some() => {
            serde_json::to_value(request(peer.list_all_resource_templates()).await?)
        }
        _ => return Ok(Value::Array(Vec::new())),
    };
    list.map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn mcp_call_tool(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    name: String,
    arguments: JsonObject,
) -> Result<CallToolResult, String> {
    let peer = sessions.peer(&session_id).await?;
    request(peer.call_tool(CallToolRequestParams::new(name).with_arguments(arguments))).await
}

#[tauri::command]
pub(crate) async fn mcp_get_prompt(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    name: String,
    arguments: JsonObject,
) -> Result<GetPromptResult, String> {
    let peer = sessions.peer(&session_id).await?;
    request(peer.get_prompt(GetPromptRequestParams::new(name).with_arguments(arguments))).await
}

#[tauri::command]
pub(crate) async fn mcp_read_resource(
    sessions: tauri::State<'_, McpSessions>,
    session_id: String,
    uri: String,
) -> Result<ReadResourceResult, String> {
    let peer = sessions.peer(&session_id).await?;
    request(peer.read_resource(ReadResourceRequestParams::new(uri))).await
}

async fn request<T>(operation: impl Future<Output = Result<T, ServiceError>>) -> Result<T, String> {
    timeout(REQUEST_TIMEOUT, operation)
        .await
        .map_err(|_| "The MCP request timed out after 45 seconds.".to_owned())?
        .map_err(|error| error.to_string())
}
