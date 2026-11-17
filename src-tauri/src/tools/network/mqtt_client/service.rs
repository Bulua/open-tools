//! 每个工具会话独占事件循环，操作收到协议确认后才向界面报告成功。
use rumqttc::{
    AsyncClient, Event, Incoming, MqttOptions, Outgoing, QoS, SubscribeReasonCode, Transport,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::ipc::Channel;
use tokio::sync::{mpsc, oneshot};
use tokio::time::{timeout, Instant};

const WAIT: Duration = Duration::from_secs(15);
pub(super) const MAX_PAYLOAD: usize = 256 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Config {
    pub host: String,
    pub port: u16,
    pub client_id: String,
    pub username: String,
    pub password: String,
    pub keep_alive: u16,
    pub clean_session: bool,
    pub tls: bool,
}

impl Config {
    fn options(self) -> Result<MqttOptions, String> {
        if self.host.is_empty()
            || self
                .host
                .chars()
                .any(|c| c.is_whitespace() || "/?#\0".contains(c))
        {
            return Err("Enter a hostname or IP without a scheme or path".into());
        }
        if self.port == 0 || self.keep_alive < 5 || self.client_id.is_empty() {
            return Err("Invalid port, client ID or keep alive (minimum 5 seconds)".into());
        }
        for value in [&self.client_id, &self.username, &self.password] {
            if value.len() > u16::MAX as usize || value.contains('\0') {
                return Err("MQTT credentials or client ID are invalid or too long".into());
            }
        }
        if self.username.is_empty() && !self.password.is_empty() {
            return Err("A username is required when a password is supplied".into());
        }
        let mut options = MqttOptions::new(self.client_id, self.host, self.port);
        options.set_keep_alive(Duration::from_secs(self.keep_alive.into()));
        options.set_clean_session(self.clean_session);
        options.set_max_packet_size(MAX_PAYLOAD + 65536, MAX_PAYLOAD + 65536);
        if !self.username.is_empty() {
            options.set_credentials(self.username, self.password);
        }
        if self.tls {
            // 显式选择已有加密后端，TLS 保持系统信任链和主机名校验。
            let _ = rustls::crypto::ring::default_provider().install_default();
            let mut roots = rustls::RootCertStore::empty();
            roots.add_parsable_certificates(rustls_native_certs::load_native_certs().certs);
            if roots.is_empty() {
                return Err("No trusted system certificates are available for TLS".into());
            }
            let tls = rustls::ClientConfig::builder()
                .with_root_certificates(roots)
                .with_no_client_auth();
            options.set_transport(Transport::tls_with_config(tls.into()));
        }
        Ok(options)
    }
}

pub(super) fn valid_topic(value: &str, filter: bool) -> bool {
    if value.is_empty() || value.len() > 65535 || value.contains('\0') {
        return false;
    }
    if !filter {
        return !value.contains(['+', '#']);
    }
    let levels: Vec<_> = value.split('/').collect();
    levels.iter().enumerate().all(|(i, part)| {
        (!part.contains('+') || *part == "+")
            && (!part.contains('#') || (*part == "#" && i == levels.len() - 1))
    })
}

pub(super) fn qos(value: u8) -> Result<QoS, String> {
    match value {
        0 => Ok(QoS::AtMostOnce),
        1 => Ok(QoS::AtLeastOnce),
        2 => Ok(QoS::ExactlyOnce),
        _ => Err("Invalid QoS".into()),
    }
}

#[derive(Clone, Serialize, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum Notice {
    Message {
        topic: String,
        payload: Vec<u8>,
        qos: u8,
        retain: bool,
    },
    Closed {
        error: Option<String>,
    },
}

pub(super) enum Action {
    Subscribe(String, QoS),
    Unsubscribe(String),
    Publish(String, Vec<u8>, QoS, bool),
}
struct Request {
    action: Action,
    reply: oneshot::Sender<Result<Option<u8>, String>>,
}
struct Session {
    requests: mpsc::Sender<Request>,
    cancel: oneshot::Sender<()>,
    token: Arc<()>,
}
#[derive(Clone, Default)]
pub(crate) struct MqttState(Arc<Mutex<HashMap<String, Session>>>);

impl MqttState {
    pub(super) async fn connect(
        &self,
        id: String,
        config: Config,
        events: Channel<Notice>,
    ) -> Result<(), String> {
        let options = config.options()?;
        let (requests, rx) = mpsc::channel(16);
        let (cancel, cancelled) = oneshot::channel();
        let (ready, connected) = oneshot::channel();
        let token = Arc::new(());
        {
            let mut sessions = self.0.lock().map_err(|e| e.to_string())?;
            if sessions.contains_key(&id) || sessions.len() >= 16 {
                return Err("Too many MQTT sessions or duplicate session ID".into());
            }
            sessions.insert(
                id.clone(),
                Session {
                    requests,
                    cancel,
                    token: token.clone(),
                },
            );
        }
        let state = self.clone();
        tauri::async_runtime::spawn(async move {
            run(options, rx, cancelled, ready, events).await;
            if let Ok(mut sessions) = state.0.lock() {
                if sessions
                    .get(&id)
                    .is_some_and(|session| Arc::ptr_eq(&session.token, &token))
                {
                    sessions.remove(&id);
                }
            }
        });
        connected
            .await
            .map_err(|_| "MQTT connection closed".to_string())?
    }

    pub(super) fn disconnect(&self, id: &str) -> Result<(), String> {
        if let Some(session) = self.0.lock().map_err(|e| e.to_string())?.remove(id) {
            let _ = session.cancel.send(());
        }
        Ok(())
    }

    pub(super) async fn request(&self, id: &str, action: Action) -> Result<Option<u8>, String> {
        let requests = self
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .get(id)
            .ok_or("MQTT is not connected")?
            .requests
            .clone();
        let (reply, response) = oneshot::channel();
        requests
            .try_send(Request { action, reply })
            .map_err(|_| "MQTT connection is closed or busy")?;
        timeout(WAIT * 2, response)
            .await
            .map_err(|_| "MQTT operation timed out")?
            .map_err(|_| "MQTT connection closed before acknowledgement".to_string())?
    }
}

async fn run(
    options: MqttOptions,
    mut requests: mpsc::Receiver<Request>,
    mut cancelled: oneshot::Receiver<()>,
    ready: oneshot::Sender<Result<(), String>>,
    events: Channel<Notice>,
) {
    let (client, mut eventloop) = AsyncClient::new(options, 16);
    let mut ready = Some(ready);
    let mut pending: Option<Request> = None;
    let mut deadline = Instant::now() + WAIT;
    let error = loop {
        tokio::select! {
            biased;
            _ = &mut cancelled => {
                // 尽量发送 DISCONNECT；即使服务器无响应也及时释放套接字。
                let _ = client.try_disconnect();
                let _ = timeout(Duration::from_millis(500), async {
                    loop { match eventloop.poll().await {
                        Ok(Event::Outgoing(Outgoing::Disconnect)) | Err(_) => break,
                        _ => {}
                    } }
                }).await;
                break None;
            }
            _ = tokio::time::sleep_until(deadline), if ready.is_some() || pending.is_some() => {
                break Some("MQTT connection or acknowledgement timed out".to_string());
            }
            request = requests.recv(), if ready.is_none() && pending.is_none() => {
                let Some(request) = request else { break None };
                let result = match &request.action {
                    Action::Subscribe(topic, qos) => client.try_subscribe(topic, *qos),
                    Action::Unsubscribe(topic) => client.try_unsubscribe(topic),
                    Action::Publish(topic, payload, qos, retain) => client.try_publish(topic, *qos, *retain, payload.clone()),
                };
                if let Err(e) = result { let _ = request.reply.send(Err(e.to_string())); }
                else { pending = Some(request); deadline = Instant::now() + WAIT; }
            }
            event = eventloop.poll() => {
                let event = match event { Ok(event) => event, Err(e) => break Some(e.to_string()) };
                if matches!(event, Event::Incoming(Incoming::ConnAck(_))) {
                    if let Some(ready) = ready.take() { let _ = ready.send(Ok(())); }
                }
                if let Event::Incoming(Incoming::Publish(ref p)) = event {
                    if events.send(Notice::Message { topic: p.topic.clone(), payload: p.payload.to_vec(), qos: p.qos as u8, retain: p.retain }).is_err() { break None; }
                }
                let complete = pending.as_ref().and_then(|r| match (&r.action, &event) {
                    (Action::Subscribe(..), Event::Incoming(Incoming::SubAck(ack))) => Some(match ack.return_codes.first() {
                        Some(SubscribeReasonCode::Success(qos)) => Ok(Some(*qos as u8)),
                        _ => Err("Broker rejected the subscription".into()),
                    }),
                    (Action::Unsubscribe(..), Event::Incoming(Incoming::UnsubAck(_))) => Some(Ok(None)),
                    (Action::Publish(_, _, QoS::AtMostOnce, _), Event::Outgoing(Outgoing::Publish(_))) |
                    (Action::Publish(_, _, QoS::AtLeastOnce, _), Event::Incoming(Incoming::PubAck(_))) |
                    (Action::Publish(_, _, QoS::ExactlyOnce, _), Event::Incoming(Incoming::PubComp(_))) => Some(Ok(None)),
                    _ => None,
                });
                if let Some(result) = complete { if let Some(request) = pending.take() { let _ = request.reply.send(result); } }
            }
        }
    };
    if let Some(ready) = ready {
        let _ = ready.send(Err(error
            .clone()
            .unwrap_or_else(|| "MQTT connection cancelled".into())));
    }
    if let Some(request) = pending {
        let _ = request.reply.send(Err(error
            .clone()
            .unwrap_or_else(|| "MQTT disconnected".into())));
    }
    let _ = events.send(Notice::Closed { error });
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
