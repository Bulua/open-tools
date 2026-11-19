//! 每个工具会话独占事件循环，操作收到协议确认后才向界面报告成功。
use super::config::Config;
use super::protocol::{Action, Connection, Event, Options};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::ipc::Channel;
use tokio::sync::{mpsc, oneshot};
use tokio::time::{timeout, Instant};

const WAIT: Duration = Duration::from_secs(15);
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
        let connect_timeout = Duration::from_secs(config.connect_timeout.into());
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
            run(options, connect_timeout, rx, cancelled, ready, events).await;
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
    options: Options,
    connect_timeout: Duration,
    mut requests: mpsc::Receiver<Request>,
    mut cancelled: oneshot::Receiver<()>,
    ready: oneshot::Sender<Result<(), String>>,
    events: Channel<Notice>,
) {
    let mut connection = Connection::new(options, connect_timeout);
    let mut ready = Some(ready);
    let mut pending: Option<Request> = None;
    let mut deadline = Instant::now() + connect_timeout;
    let error = loop {
        tokio::select! {
            biased;
            _ = &mut cancelled => {
                // 尽量发送 DISCONNECT；即使服务器无响应也及时释放套接字。
                connection.disconnect();
                let _ = timeout(Duration::from_millis(500), async {
                    loop { match connection.poll().await {
                        Ok(Event::Disconnected) | Err(_) => break,
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
                if let Err(error) = connection.submit(&request.action) { let _ = request.reply.send(Err(error)); }
                else { pending = Some(request); deadline = Instant::now() + WAIT; }
            }
            event = connection.poll() => {
                match event {
                    Err(error) => break Some(error),
                    Ok(Event::Connected) => {
                        if let Some(ready) = ready.take() { let _ = ready.send(Ok(())); }
                    }
                    Ok(Event::Message { topic, payload, qos, retain }) => {
                        if events.send(Notice::Message { topic, payload, qos, retain }).is_err() { break None; }
                    }
                    Ok(event) => {
                        if let Some(result) = pending.as_ref().and_then(|request| event.completion(&request.action)) {
                            if let Some(request) = pending.take() { let _ = request.reply.send(result); }
                        }
                    }
                }
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
