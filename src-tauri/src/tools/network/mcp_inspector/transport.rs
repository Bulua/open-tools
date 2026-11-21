use std::process::Stdio;

use process_wrap::tokio::{CommandWrap, KillOnDrop};
use reqwest::Client;
use rmcp::{
    model::ClientConfig,
    service::{RoleClient, RunningService},
    transport::{
        streamable_http_client::{
            StreamableHttpClientTransport, StreamableHttpClientTransportConfig,
        },
        which_command, TokioChildProcess,
    },
    ServiceExt,
};

use super::config::{prepare_http, prepare_stdio, McpConfig};

pub(super) type McpService = RunningService<RoleClient, ClientConfig>;

pub(super) async fn connect(info: ClientConfig, config: McpConfig) -> Result<McpService, String> {
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
        McpConfig::Http(config) => {
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
            let config =
                StreamableHttpClientTransportConfig::with_uri(url.as_str()).custom_headers(headers);
            info.serve(StreamableHttpClientTransport::with_client(client, config))
                .await
        }
    };
    service.map_err(|err| format!("Could not connect to the MCP server: {err}"))
}
