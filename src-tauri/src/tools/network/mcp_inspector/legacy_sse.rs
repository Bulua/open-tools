use std::{future::Future, io};

use futures_util::{stream::BoxStream, StreamExt};
use reqwest::{
    header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE},
    Client, Url,
};
use rmcp::{
    service::{RoleClient, RxJsonRpcMessage, TxJsonRpcMessage},
    transport::Transport,
};
use sse_stream::{Error as SseError, Sse, SseStream};

// 查看器只需要读取一轮工具列表，限制整条响应流的大小。
const MAX_STREAM_BYTES: usize = 32 * 1024 * 1024;

pub(super) struct LegacySseTransport {
    client: Client,
    endpoint: Url,
    headers: HeaderMap,
    events: Option<BoxStream<'static, Result<Sse, SseError>>>,
}

impl LegacySseTransport {
    pub(super) async fn connect(
        client: Client,
        url: Url,
        mut headers: HeaderMap,
    ) -> Result<Self, String> {
        let mut get_headers = headers.clone();
        get_headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
        let response = client
            .get(url.clone())
            .headers(get_headers)
            .send()
            .await
            .map_err(|err| format!("Could not open the MCP SSE stream: {}", err.without_url()))?;
        if !response.status().is_success() {
            return Err(format!(
                "The MCP SSE endpoint returned HTTP {}.",
                response.status()
            ));
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok());
        if !content_type.is_some_and(|value| {
            value
                .split(';')
                .next()
                .unwrap_or_default()
                .trim()
                .eq_ignore_ascii_case("text/event-stream")
        }) {
            return Err("The MCP SSE endpoint did not return text/event-stream.".to_owned());
        }

        let mut remaining = MAX_STREAM_BYTES;
        let bytes = response.bytes_stream().map(move |chunk| {
            let chunk = chunk.map_err(|err| io::Error::other(err.without_url()))?;
            remaining = remaining
                .checked_sub(chunk.len())
                .ok_or_else(|| io::Error::other("The MCP SSE stream exceeded the size limit."))?;
            Ok::<_, io::Error>(chunk)
        });
        let mut events = SseStream::from_bytes_stream(bytes).boxed();
        let endpoint = loop {
            let event = events
                .next()
                .await
                .ok_or("The MCP SSE stream ended before announcing its message endpoint.")?
                .map_err(|err| format!("Could not read the MCP SSE endpoint event: {err}"))?;
            if event.event.as_deref() == Some("endpoint") {
                break message_endpoint(&url, event.data.as_deref())?;
            }
        };
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        Ok(Self {
            client,
            endpoint,
            headers,
            events: Some(events),
        })
    }
}

fn message_endpoint(url: &Url, data: Option<&str>) -> Result<Url, String> {
    let path = data
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .ok_or("The MCP SSE endpoint event did not include a message URL.")?;
    let endpoint = url.join(path).map_err(|_| "Invalid MCP SSE message URL.")?;
    // 消息地址由服务器提供。只向同源地址发送请求与配置里的凭据。
    if endpoint.origin() != url.origin()
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
    {
        return Err(
            "The MCP SSE message URL must use the same origin and contain no credentials."
                .to_owned(),
        );
    }
    Ok(endpoint)
}

impl Transport<RoleClient> for LegacySseTransport {
    type Error = io::Error;

    fn send(
        &mut self,
        item: TxJsonRpcMessage<RoleClient>,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + 'static {
        let request = self
            .client
            .post(self.endpoint.clone())
            .headers(self.headers.clone())
            .json(&item);
        async move {
            let response = request
                .send()
                .await
                .map_err(|err| io::Error::other(err.without_url()))?;
            if !response.status().is_success() {
                return Err(io::Error::other(format!(
                    "The MCP SSE message endpoint returned HTTP {}.",
                    response.status()
                )));
            }
            Ok(())
        }
    }

    async fn receive(&mut self) -> Option<RxJsonRpcMessage<RoleClient>> {
        let events = self.events.as_mut()?;
        loop {
            let event = events.next().await?.ok()?;
            if matches!(event.event.as_deref(), None | Some("message")) {
                if let Some(data) = event.data {
                    return serde_json::from_str(&data).ok();
                }
            }
        }
    }

    async fn close(&mut self) -> Result<(), Self::Error> {
        self.events.take();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::message_endpoint;
    use reqwest::Url;

    #[test]
    fn accepts_relative_and_same_origin_message_urls() {
        let url = Url::parse("https://example.com/mcp/sse").unwrap();
        let expected = "https://example.com/mcp/messages?sessionId=abc";
        for path in [
            "messages?sessionId=abc",
            "/mcp/messages?sessionId=abc",
            expected,
        ] {
            assert_eq!(
                message_endpoint(&url, Some(path)).unwrap().as_str(),
                expected
            );
        }
    }

    #[test]
    fn rejects_message_urls_that_would_send_credentials_elsewhere() {
        let url = Url::parse("https://example.com/mcp/sse").unwrap();
        for path in [
            "//other.example/messages",
            "http://example.com/messages",
            "https://example.com:8080/messages",
            "https://user:secret@example.com/messages",
        ] {
            assert!(message_endpoint(&url, Some(path)).is_err());
        }
    }
}
