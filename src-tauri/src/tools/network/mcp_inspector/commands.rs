use std::{ops::AsyncFnOnce, process::Stdio, time::Duration};

use process_wrap::tokio::{CommandWrap, KillOnDrop};
use reqwest::Client;
use rmcp::{
    model::{
        CallToolRequestParams, CallToolResult, ClientCapabilities, ClientConfig, Implementation,
        JsonObject, ProtocolVersion, Tool,
    },
    service::{serve_client_with_lifecycle, ClientLifecycleMode, RoleClient, RunningService},
    transport::{
        streamable_http_client::{
            StreamableHttpClientTransport, StreamableHttpClientTransportConfig,
        },
        which_command, TokioChildProcess,
    },
    ServiceExt,
};
use serde::Serialize;
use tokio::time::timeout;

use super::{
    config::{prepare_http, prepare_stdio, McpConfig},
    legacy_sse::LegacySseTransport,
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);
type McpService = RunningService<RoleClient, ClientConfig>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct McpToolList {
    #[serde(skip_serializing_if = "Option::is_none")]
    server_info: Option<Implementation>,
    protocol_version: String,
    tools: Vec<Tool>,
}

#[tauri::command]
pub(crate) async fn mcp_list_tools(
    app: tauri::AppHandle,
    config: McpConfig,
) -> Result<McpToolList, String> {
    with_connection(app.package_info().version.to_string(), config, read_tools).await
}

#[tauri::command]
pub(crate) async fn mcp_call_tool(
    app: tauri::AppHandle,
    config: McpConfig,
    name: String,
    arguments: JsonObject,
) -> Result<CallToolResult, String> {
    let request = CallToolRequestParams::new(name).with_arguments(arguments);
    with_connection(
        app.package_info().version.to_string(),
        config,
        async |service: &McpService| {
            service
                .peer()
                .call_tool(request)
                .await
                .map_err(|err| format!("Could not call the MCP tool: {err}"))
        },
    )
    .await
}

async fn with_connection<T>(
    version: String,
    config: McpConfig,
    operation: impl AsyncFnOnce(&McpService) -> Result<T, String>,
) -> Result<T, String> {
    let info = ClientConfig::new(
        ClientCapabilities::default(),
        Implementation::new("open-tools", version),
    );
    let mut service = None;
    let result = timeout(REQUEST_TIMEOUT, async {
        let connection = service.insert(connect(info, config).await?);
        operation(connection).await
    })
    .await;
    if let Some(mut service) = service {
        let _ = service.close_with_timeout(Duration::from_secs(4)).await;
    }
    result.map_err(|_| "The MCP request timed out after 45 seconds.".to_owned())?
}

async fn connect(info: ClientConfig, config: McpConfig) -> Result<McpService, String> {
    let legacy_sse = matches!(config, McpConfig::Sse(_));
    let service = match config {
        McpConfig::Stdio {
            command,
            args,
            env,
            env_vars,
            cwd,
        } => {
            let mut command = which_command(&command)
                .map_err(|err| format!("Could not find the MCP server command: {err}"))?;
            prepare_stdio(&mut command, &env_vars, env)?;
            command.args(args);
            if let Some(cwd) = cwd {
                command.current_dir(cwd);
            }
            let mut command = CommandWrap::from(command);
            // npx 等启动器还会创建子进程，关闭连接时一起清理。
            #[cfg(windows)]
            {
                use process_wrap::tokio::{CreationFlags, JobObject};
                use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;
                let mut flags = CreationFlags(Default::default());
                flags.0 .0 = CREATE_NO_WINDOW;
                command.wrap(JobObject).wrap(flags);
            }
            #[cfg(unix)]
            command.wrap(process_wrap::tokio::ProcessGroup::leader());
            command.wrap(KillOnDrop);
            let (transport, _) = TokioChildProcess::builder(command)
                .stderr(Stdio::null())
                .spawn()
                .map_err(|err| format!("Could not start the MCP server: {err}"))?;
            info.serve(transport).await
        }
        McpConfig::Http(config) | McpConfig::Sse(config) => {
            let (url, headers) = prepare_http(config, |name| {
                std::env::var(name)
                    .map_err(|_| format!("Environment variable {name} is missing or unreadable."))
            })?;
            let _ = rustls::crypto::ring::default_provider().install_default();
            // 自定义请求头可能含凭据，不将它们转发到重定向地址。
            let client = Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|err| format!("Could not initialize the HTTP client: {err}"))?;
            if legacy_sse {
                let transport =
                    LegacySseTransport::connect(client, url, headers.into_iter().collect()).await?;
                let info = info.with_protocol_version(ProtocolVersion::V_2024_11_05);
                serve_client_with_lifecycle(info, transport, ClientLifecycleMode::Initialize).await
            } else {
                let config = StreamableHttpClientTransportConfig::with_uri(url.as_str())
                    .custom_headers(headers);
                info.serve(StreamableHttpClientTransport::with_client(client, config))
                    .await
            }
        }
    };
    service.map_err(|err| format!("Could not connect to the MCP server: {err}"))
}

async fn read_tools(service: &McpService) -> Result<McpToolList, String> {
    let server = service
        .peer_info()
        .ok_or("Missing MCP server information.")?;
    let tools = if server.capabilities.tools.is_some() {
        service
            .list_all_tools()
            .await
            .map_err(|err| format!("Could not list MCP tools: {err}"))?
    } else {
        Vec::new()
    };
    Ok(McpToolList {
        server_info: server.server_info.clone(),
        protocol_version: server.protocol_version.to_string(),
        tools,
    })
}
