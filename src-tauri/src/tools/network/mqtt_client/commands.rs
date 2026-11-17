pub(crate) use super::service::MqttState;
use super::service::{self, Action, Config, Notice};
use tauri::{ipc::Channel, State, WebviewWindow};

fn key(window: &WebviewWindow, id: &str) -> Result<String, String> {
    if window.label() != "main" || id.is_empty() || id.len() > 100 {
        return Err("Invalid MQTT session".into());
    }
    Ok(format!("{}:{id}", window.label()))
}

#[tauri::command]
pub async fn mqtt_connect(
    window: WebviewWindow,
    state: State<'_, MqttState>,
    id: String,
    config: Config,
    events: Channel<Notice>,
) -> Result<(), String> {
    state.connect(key(&window, &id)?, config, events).await
}

#[tauri::command]
pub fn mqtt_disconnect(
    window: WebviewWindow,
    state: State<'_, MqttState>,
    id: String,
) -> Result<(), String> {
    state.disconnect(&key(&window, &id)?)
}

#[tauri::command]
pub async fn mqtt_subscribe(
    window: WebviewWindow,
    state: State<'_, MqttState>,
    id: String,
    topic: String,
    qos: u8,
) -> Result<Option<u8>, String> {
    if !service::valid_topic(&topic, true) {
        return Err("Invalid MQTT topic filter".into());
    }
    state
        .request(
            &key(&window, &id)?,
            Action::Subscribe(topic, service::qos(qos)?),
        )
        .await
}

#[tauri::command]
pub async fn mqtt_unsubscribe(
    window: WebviewWindow,
    state: State<'_, MqttState>,
    id: String,
    topic: String,
) -> Result<(), String> {
    if !service::valid_topic(&topic, true) {
        return Err("Invalid MQTT topic filter".into());
    }
    state
        .request(&key(&window, &id)?, Action::Unsubscribe(topic))
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn mqtt_publish(
    window: WebviewWindow,
    state: State<'_, MqttState>,
    id: String,
    topic: String,
    payload: Vec<u8>,
    qos: u8,
    retain: bool,
) -> Result<(), String> {
    if !service::valid_topic(&topic, false) {
        return Err("Invalid MQTT publish topic".into());
    }
    if payload.len() > service::MAX_PAYLOAD {
        return Err("MQTT payload exceeds 256 KiB".into());
    }
    state
        .request(
            &key(&window, &id)?,
            Action::Publish(topic, payload, service::qos(qos)?, retain),
        )
        .await
        .map(|_| ())
}
