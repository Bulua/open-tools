use std::{collections::HashMap, env};

use reqwest::{
    header::{HeaderName, HeaderValue, AUTHORIZATION},
    Url,
};
use serde::Deserialize;
use tokio::process::Command;

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub(crate) enum McpConfig {
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        env: HashMap<String, String>,
        #[serde(default)]
        env_vars: Vec<String>,
        cwd: Option<String>,
    },
    Http(HttpConfig),
}

#[derive(Deserialize)]
pub(crate) struct HttpConfig {
    url: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    env_http_headers: HashMap<String, String>,
    bearer_token_env_var: Option<String>,
}

// 指定传递列表时，保留启动常用运行时所需的基础变量。
const BASE_ENV: &[&str] = &[
    "PATH",
    "HOME",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "APPDATA",
    "LOCALAPPDATA",
];

fn check_env_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.contains(['=', '\0']) {
        return Err("Invalid environment variable name.".to_owned());
    }
    Ok(())
}

pub(super) fn prepare_stdio(
    command: &mut Command,
    names: &[String],
    explicit: HashMap<String, String>,
) -> Result<(), String> {
    if !names.is_empty() {
        command.env_clear();
        for name in BASE_ENV {
            if let Some(value) = env::var_os(name) {
                command.env(name, value);
            }
        }
        for name in names {
            check_env_name(name)?;
            let value = env::var_os(name)
                .ok_or_else(|| format!("Environment variable {name} is missing."))?;
            command.env(name, value);
        }
    }
    command.envs(explicit);
    Ok(())
}

pub(super) fn prepare_http(
    config: HttpConfig,
    read_env: impl Fn(&str) -> Result<String, String>,
) -> Result<(Url, HashMap<HeaderName, HeaderValue>), String> {
    let url = Url::parse(&config.url).map_err(|_| "Invalid MCP server URL.")?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("The MCP server URL must use HTTP or HTTPS.".to_owned());
    }
    let mut headers = HashMap::new();
    for (name, value) in config.headers {
        headers.insert(parse_header_name(name)?, sensitive_header(&value)?);
    }
    for (name, variable) in config.env_http_headers {
        check_env_name(&variable)?;
        headers.insert(
            parse_header_name(name)?,
            sensitive_header(&read_env(&variable)?)?,
        );
    }
    if let Some(variable) = config.bearer_token_env_var {
        check_env_name(&variable)?;
        let token = read_env(&variable)?;
        if token.trim().is_empty() {
            return Err(format!(
                "Environment variable {variable} contains no bearer token."
            ));
        }
        headers.insert(AUTHORIZATION, sensitive_header(&format!("Bearer {token}"))?);
    }
    Ok((url, headers))
}

fn parse_header_name(name: String) -> Result<HeaderName, String> {
    HeaderName::try_from(name).map_err(|_| "Invalid HTTP header name.".to_owned())
}

fn sensitive_header(value: &str) -> Result<HeaderValue, String> {
    let mut header = HeaderValue::try_from(value).map_err(|_| "Invalid HTTP header value.")?;
    header.set_sensitive(true);
    Ok(header)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn resolves_http_credentials_at_connection_time() {
        let settings = json!({
            "type": "http",
            "url": "https://example.com/mcp",
            "headers": {"Authorization": "old-token", "x-api-key": "old-key"},
            "env_http_headers": {"X-Api-Key": "MCP_API_KEY"},
            "bearer_token_env_var": "MCP_BEARER_TOKEN"
        });
        let McpConfig::Http(config) = serde_json::from_value(settings).unwrap() else {
            panic!("Expected HTTP settings");
        };
        let (_, headers) = prepare_http(config, |name| match name {
            "MCP_API_KEY" => Ok("example-key".into()),
            "MCP_BEARER_TOKEN" => Ok("example-token".into()),
            _ => panic!("Unexpected variable"),
        })
        .unwrap();
        assert_eq!(
            headers[&HeaderName::from_static("x-api-key")],
            "example-key"
        );
        assert_eq!(headers[&AUTHORIZATION], "Bearer example-token");
        assert!(headers.values().all(HeaderValue::is_sensitive));
    }

    #[test]
    fn rejects_legacy_sse_transport() {
        let settings = json!({
            "type": "sse",
            "url": "http://localhost:3000/sse",
            "headers": {"Authorization": "Bearer example-token"}
        });
        assert!(serde_json::from_value::<McpConfig>(settings).is_err());
    }
}
