//! 将「MCP 工具查看器」的持久化连接管理与状态探测能力封装为统一 `AiTool`。

use std::collections::HashSet;

use reqwest::Url;
use serde_json::{json, Value};
use tauri::{Emitter, Manager};

use crate::core::db::Database;
use crate::core::id::next_id_string;
use crate::tools::ai::args;
use crate::tools::ai::registry::{
    AiTool, AiToolContext, AiToolFuture, AiToolResult, ToolApprovalPolicy,
};

use super::config::{HttpConfig, McpConfig};
use super::sessions::{
    active_session_ids, connect_or_reuse_session, disconnect_session, inspect_session,
    McpInspectionSnapshot, McpSessions,
};
use super::store::{load_stored_connections, save_stored_connections, StoredConnection};

const MCP_CHANGED_EVENT: &str = "mcp-connections-changed";

fn ai_session_id(connection_id: &str) -> String {
    format!("ai-chat:{connection_id}")
}

fn format_tool_summary(tool: &rmcp::model::Tool) -> String {
    let required: HashSet<&str> = tool
        .input_schema
        .get("required")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();

    let params = tool
        .input_schema
        .get("properties")
        .and_then(Value::as_object)
        .map(|props| {
            let mut keys: Vec<&String> = props.keys().collect();
            keys.sort();
            keys.into_iter()
                .map(|k| {
                    if required.contains(k.as_str()) {
                        format!("{k}*")
                    } else {
                        k.clone()
                    }
                })
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();

    let desc = tool
        .description
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            let single = s.replace(['\r', '\n'], " ");
            if single.chars().count() > 120 {
                let head: String = single.chars().take(120).collect();
                format!("{head}…")
            } else {
                single
            }
        });

    let sig = if params.is_empty() {
        tool.name.to_string()
    } else {
        format!("{}({params})", tool.name)
    };
    match desc {
        Some(text) => format!("- {sig}: {text}"),
        None => format!("- {sig}"),
    }
}

fn format_inspection_report(conn: &StoredConnection, snapshot: &McpInspectionSnapshot) -> String {
    let server_label = match &snapshot.server.server_info {
        Some(info) => format!("{} {} (protocol {})", info.name, info.version, snapshot.server.protocol_version),
        None => format!("protocol {}", snapshot.server.protocol_version),
    };
    let mut lines = vec![
        format!("MCP Connection: {} (id: {})", conn.name, conn.id),
        format!("Target: {}", conn.config.summary()),
        "Status: connected".to_string(),
        format!("Server: {server_label}"),
        format!(
            "Capabilities: {} tools, {} prompts, {} resources",
            snapshot.tools.len(),
            snapshot.prompt_count,
            snapshot.resource_count
        ),
    ];
    if snapshot.tools.is_empty() {
        lines.push("Tools: (none)".to_string());
    } else {
        lines.push("Tools:".to_string());
        for tool in &snapshot.tools {
            lines.push(format_tool_summary(tool));
        }
    }
    lines.join("\n")
}

fn build_mcp_config(args: &Value) -> Result<McpConfig, String> {
    let transport = args::trimmed(args, "transport")
        .or_else(|| args::trimmed(args, "type"))
        .ok_or_else(|| "Parameter 'transport' is required ('stdio' or 'http').".to_string())?
        .to_lowercase();

    match transport.as_str() {
        "stdio" => {
            let command = args::trimmed(args, "command")
                .ok_or_else(|| "Parameter 'command' is required for stdio MCP connections.".to_string())?;
            let cmd_args = args::string_vec(args, "args")?;
            let env = args::string_map(args, "env")?;
            let env_vars = args::string_vec(args, "env_vars")?;
            let cwd = args::trimmed(args, "cwd");
            Ok(McpConfig::Stdio {
                command,
                args: cmd_args,
                env,
                env_vars,
                cwd,
            })
        }
        "http" => {
            let url = args::trimmed(args, "url")
                .ok_or_else(|| "Parameter 'url' is required for http MCP connections.".to_string())?;
            let parsed = Url::parse(&url).map_err(|_| "Invalid MCP server URL.".to_string())?;
            if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
                return Err("The MCP server URL must use http:// or https://.".to_string());
            }
            let headers = args::string_map(args, "headers")?;
            let env_http_headers = args::string_map(args, "env_http_headers")?;
            let bearer_token_env_var = args::trimmed(args, "bearer_token_env_var");
            Ok(McpConfig::Http(HttpConfig {
                url,
                headers,
                env_http_headers,
                bearer_token_env_var,
            }))
        }
        other => Err(format!(
            "Unsupported transport '{other}'. Expected 'stdio' or 'http'."
        )),
    }
}

pub(crate) struct McpListConnectionsTool;

impl AiTool for McpListConnectionsTool {
    fn name(&self) -> &'static str {
        "mcp_list_connections"
    }

    fn description(&self) -> &'static str {
        "List all saved MCP server connections in MCP Inspector together with their live connection status."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {}
        })
    }

    fn execute<'a>(&'a self, _args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let db = ctx.app.state::<Database>();
            let connections = match load_stored_connections(db.inner()).await {
                Ok(list) => list,
                Err(err) => return AiToolResult::err(err),
            };
            if connections.is_empty() {
                return AiToolResult::ok("No MCP connections are currently saved.");
            }
            let sessions = ctx.app.state::<McpSessions>();
            let active: HashSet<String> = active_session_ids(&sessions).await.into_iter().collect();

            let mut lines = vec![format!("Saved MCP connections ({}):", connections.len())];
            for conn in &connections {
                let status = if active.contains(&ai_session_id(&conn.id)) {
                    "connected"
                } else {
                    "disconnected"
                };
                lines.push(format!(
                    "- {} (id: {}) | {} | status: {}",
                    conn.name,
                    conn.id,
                    conn.config.summary(),
                    status
                ));
            }
            AiToolResult::ok(lines.join("\n"))
        })
    }
}

pub(crate) struct McpAddConnectionTool;

impl AiTool for McpAddConnectionTool {
    fn name(&self) -> &'static str {
        "mcp_add_connection"
    }

    fn description(&self) -> &'static str {
        "Add (or update) an MCP server connection in MCP Inspector (stdio or http), save it persistently, and optionally test the connection immediately to inspect its available tools."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Human-readable name for the MCP server connection."
                },
                "transport": {
                    "type": "string",
                    "enum": ["stdio", "http"],
                    "description": "Transport type: 'stdio' for local command servers or 'http' for Streamable HTTP servers."
                },
                "command": {
                    "type": "string",
                    "description": "Startup executable for stdio transport (e.g. 'npx', 'uvx', 'node')."
                },
                "args": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Command-line arguments for stdio transport."
                },
                "cwd": {
                    "type": "string",
                    "description": "Optional working directory for stdio transport."
                },
                "env": {
                    "type": "object",
                    "additionalProperties": { "type": "string" },
                    "description": "Optional explicit environment variables for stdio transport."
                },
                "env_vars": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional host environment variable names to pass through for stdio transport."
                },
                "url": {
                    "type": "string",
                    "description": "Server HTTP/HTTPS endpoint URL for http transport."
                },
                "headers": {
                    "type": "object",
                    "additionalProperties": { "type": "string" },
                    "description": "Optional HTTP headers for http transport."
                },
                "env_http_headers": {
                    "type": "object",
                    "additionalProperties": { "type": "string" },
                    "description": "Optional map of HTTP header name to host environment variable name."
                },
                "bearer_token_env_var": {
                    "type": "string",
                    "description": "Optional host environment variable name containing a Bearer token for http transport."
                },
                "id": {
                    "type": "string",
                    "description": "Optional connection ID (used when updating an existing connection)."
                },
                "overwrite": {
                    "type": "boolean",
                    "description": "If true, update an existing connection with the same id or name instead of rejecting duplicates (default false)."
                },
                "test_connection": {
                    "type": "boolean",
                    "description": "If true (default), connect right after saving to verify server status and list available tools."
                }
            },
            "required": ["name", "transport"]
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::Command
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let name = match args::trimmed(&args, "name") {
                Some(n) => n,
                None => return AiToolResult::err("Parameter 'name' is required."),
            };
            let config = match build_mcp_config(&args) {
                Ok(cfg) => cfg,
                Err(err) => return AiToolResult::err(err),
            };
            let requested_id = args::trimmed(&args, "id");
            let overwrite = args::bool_or(&args, "overwrite", false);
            let test_connection = args::bool_or(&args, "test_connection", true);

            let db = ctx.app.state::<Database>();
            let mut list = match load_stored_connections(db.inner()).await {
                Ok(items) => items,
                Err(err) => return AiToolResult::err(err),
            };

            let existing_idx = list.iter().position(|item| {
                if let Some(ref id) = requested_id {
                    item.id == *id
                } else {
                    item.name.eq_ignore_ascii_case(&name)
                }
            });

            let (action, saved_conn) = if let Some(idx) = existing_idx {
                if !overwrite && requested_id.is_none() {
                    return AiToolResult::err(format!(
                        "An MCP connection named '{}' (id: {}) already exists. Pass overwrite=true to update it or choose another name.",
                        list[idx].name, list[idx].id
                    ));
                }
                let id = list[idx].id.clone();
                let updated = StoredConnection { id, name, config };
                list[idx] = updated.clone();
                ("Updated", updated)
            } else {
                let mut id = requested_id.unwrap_or_else(next_id_string);
                while list.iter().any(|item| item.id == id) {
                    id = next_id_string();
                }
                let created = StoredConnection { id, name, config };
                list.push(created.clone());
                ("Added", created)
            };

            if let Err(err) = save_stored_connections(db.inner(), list).await {
                return AiToolResult::err(err);
            }
            let _ = ctx.app.emit(MCP_CHANGED_EVENT, ());

            let sessions = ctx.app.state::<McpSessions>();
            let session_id = ai_session_id(&saved_conn.id);
            disconnect_session(&sessions, &session_id).await;

            if !test_connection {
                return AiToolResult::ok(format!(
                    "{action} MCP connection '{}' (id: {}, {}). Connection test was skipped.",
                    saved_conn.name,
                    saved_conn.id,
                    saved_conn.config.summary()
                ));
            }

            if let Err(err) =
                connect_or_reuse_session(ctx.app, &sessions, session_id.clone(), saved_conn.config.clone()).await
            {
                return AiToolResult::ok(format!(
                    "{action} MCP connection '{}' (id: {}, {}), but connection test failed:\n{err}",
                    saved_conn.name,
                    saved_conn.id,
                    saved_conn.config.summary()
                ));
            }

            match inspect_session(&sessions, &session_id).await {
                Ok(snapshot) => {
                    let _ = ctx.app.emit(MCP_CHANGED_EVENT, ());
                    AiToolResult::ok(format!(
                        "{action} MCP connection successfully.\n\n{}",
                        format_inspection_report(&saved_conn, &snapshot)
                    ))
                }
                Err(err) => AiToolResult::ok(format!(
                    "{action} MCP connection '{}' (id: {}), connected, but failed to inspect tools:\n{err}",
                    saved_conn.name, saved_conn.id
                )),
            }
        })
    }
}

pub(crate) struct McpInspectConnectionTool;

impl AiTool for McpInspectConnectionTool {
    fn name(&self) -> &'static str {
        "mcp_inspect_connection"
    }

    fn description(&self) -> &'static str {
        "Check the connection status of a saved MCP server (by id or name) and list all tools, prompts, and resources it exposes."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Saved MCP connection ID."
                },
                "name": {
                    "type": "string",
                    "description": "Saved MCP connection name (case-insensitive match)."
                },
                "connect_if_disconnected": {
                    "type": "boolean",
                    "description": "If true (default), connect automatically when currently disconnected so status and tools can be inspected."
                }
            }
        })
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let target_id = args::trimmed(&args, "id");
            let target_name = args::trimmed(&args, "name");
            if target_id.is_none() && target_name.is_none() {
                return AiToolResult::err("Please provide either 'id' or 'name' of the MCP connection.");
            }
            let connect_if_disconnected = args::bool_or(&args, "connect_if_disconnected", true);

            let db = ctx.app.state::<Database>();
            let list = match load_stored_connections(db.inner()).await {
                Ok(items) => items,
                Err(err) => return AiToolResult::err(err),
            };

            let conn = list.iter().find(|item| {
                if let Some(ref id) = target_id {
                    item.id == *id
                } else if let Some(ref name) = target_name {
                    item.name.eq_ignore_ascii_case(name)
                } else {
                    false
                }
            });

            let Some(conn) = conn else {
                let available = list
                    .iter()
                    .map(|item| format!("{} ({})", item.name, item.id))
                    .collect::<Vec<_>>()
                    .join(", ");
                return AiToolResult::err(if available.is_empty() {
                    "MCP connection not found (no MCP connections are saved yet).".to_string()
                } else {
                    format!("MCP connection not found. Available connections: {available}")
                });
            };

            let sessions = ctx.app.state::<McpSessions>();
            let session_id = ai_session_id(&conn.id);
            let active = active_session_ids(&sessions).await;
            let is_connected = active.iter().any(|s| s == &session_id);

            if !is_connected && !connect_if_disconnected {
                return AiToolResult::ok(format!(
                    "MCP Connection: {} (id: {})\nTarget: {}\nStatus: disconnected",
                    conn.name,
                    conn.id,
                    conn.config.summary()
                ));
            }

            if !is_connected {
                if let Err(err) =
                    connect_or_reuse_session(ctx.app, &sessions, session_id.clone(), conn.config.clone()).await
                {
                    return AiToolResult::err(format!(
                        "MCP connection '{}' (id: {}) failed to connect: {err}",
                        conn.name, conn.id
                    ));
                }
            }

            match inspect_session(&sessions, &session_id).await {
                Ok(snapshot) => {
                    let _ = ctx.app.emit(MCP_CHANGED_EVENT, ());
                    AiToolResult::ok(format_inspection_report(conn, &snapshot))
                }
                Err(err) => AiToolResult::err(format!(
                    "Failed to inspect MCP connection '{}' (id: {}): {err}",
                    conn.name, conn.id
                )),
            }
        })
    }
}
