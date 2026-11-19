use super::super::config::{qos, valid_topic, ProtocolVersion};
use super::*;
use rumqttc::QoS;
use tauri::ipc::InvokeResponseBody;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

#[test]
fn topic_filters_follow_mqtt_levels() {
    for topic in ["a/+", "a/#", "#", "+/b", "/", " a "] {
        assert!(valid_topic(topic, true), "{topic}");
    }
    for topic in ["", "a+", "a/#/b", "a/##", "a\0b"] {
        assert!(!valid_topic(topic, true), "{topic}");
    }
    assert!(!valid_topic("a/+", false));
    assert!(!valid_topic(&"温".repeat(21846), false));
    assert!(valid_topic("a/b", false));
}

fn config(port: u16) -> Config {
    Config {
        host: "127.0.0.1".into(),
        port,
        client_id: "mqtt-test".into(),
        username: "".into(),
        password: "".into(),
        keep_alive: 5,
        clean_session: true,
        tls: false,
        transport: None,
        path: "/mqtt".into(),
        protocol_version: ProtocolVersion::V311,
        connect_timeout: 10,
        will_enabled: false,
        will_topic: String::new(),
        will_payload: String::new(),
        will_qos: 0,
        will_retain: false,
    }
}

fn channel() -> (Channel<Notice>, Arc<Mutex<Vec<serde_json::Value>>>) {
    let notices = Arc::new(Mutex::new(Vec::new()));
    let sink = notices.clone();
    let channel = Channel::new(move |body| {
        if let InvokeResponseBody::Json(json) = body {
            sink.lock()
                .unwrap()
                .push(serde_json::from_str(&json).unwrap());
        }
        Ok(())
    });
    (channel, notices)
}

// 使用本机协议对端验证真实套接字收发，不依赖公网或已有 MQTT 服务器。
async fn packet(socket: &mut TcpStream) -> (u8, Vec<u8>) {
    timeout(Duration::from_secs(5), async {
        let header = socket.read_u8().await.unwrap();
        let mut length = 0usize;
        let mut multiplier = 1;
        loop {
            let byte = socket.read_u8().await.unwrap();
            length += (byte as usize & 127) * multiplier;
            if byte & 128 == 0 {
                break;
            }
            multiplier *= 128;
        }
        let mut body = vec![0; length];
        socket.read_exact(&mut body).await.unwrap();
        (header, body)
    })
    .await
    .expect("MQTT peer timed out")
}

async fn until(socket: &mut TcpStream, kind: u8) -> (u8, Vec<u8>) {
    loop {
        let value = packet(socket).await;
        if value.0 >> 4 == kind {
            return value;
        }
        // 收到的 QoS 1 消息会触发客户端 PUBACK。
        assert_eq!(value.0 >> 4, 4);
    }
}

#[tokio::test]
async fn native_roundtrip_confirms_subscriptions_and_all_publish_qos() {
    roundtrip(ProtocolVersion::V311).await;
    roundtrip(ProtocolVersion::V5).await;
}

async fn roundtrip(version: ProtocolVersion) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut config = config(listener.local_addr().unwrap().port());
    config.protocol_version = version;
    let v5 = matches!(version, ProtocolVersion::V5);
    let broker = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let (header, body) = packet(&mut socket).await;
        assert_eq!(header, 0x10);
        assert_eq!(&body[..6], b"\0\x04MQTT");
        assert_eq!(body[6], if v5 { 5 } else { 4 });
        let connack: &[u8] = if v5 {
            &[0x20, 3, 0, 0, 0]
        } else {
            &[0x20, 2, 0, 0]
        };
        socket.write_all(connack).await.unwrap();
        let (header, body) = packet(&mut socket).await;
        assert_eq!(header, 0x82);
        assert_eq!(*body.last().unwrap(), 2);
        let mut suback = vec![0x90, if v5 { 4 } else { 3 }, body[0], body[1]];
        if v5 {
            suback.push(0);
        }
        suback.push(1);
        socket.write_all(&suback).await.unwrap();
        // 服务器发来一条保留的 QoS 1 消息。
        let mut publish = vec![
            0x33,
            if v5 { 12 } else { 11 },
            0,
            4,
            b't',
            b'e',
            b's',
            b't',
            0,
            99,
        ];
        if v5 {
            publish.push(0);
        }
        publish.extend_from_slice(b"abc");
        socket.write_all(&publish).await.unwrap();
        for qos in 0..=2 {
            let (header, body) = until(&mut socket, 3).await;
            assert_eq!((header >> 1) & 3, qos);
            assert_eq!(header & 1, 1);
            let topic_length = u16::from_be_bytes([body[0], body[1]]) as usize;
            let offset = topic_length + 2;
            assert_eq!(&body[2..offset], b"test");
            let payload_offset = offset + if qos > 0 { 2 } else { 0 } + usize::from(v5);
            assert_eq!(&body[payload_offset..], "你好".as_bytes());
            if qos > 0 {
                socket
                    .write_all(&[
                        if qos == 1 { 0x40 } else { 0x50 },
                        2,
                        body[offset],
                        body[offset + 1],
                    ])
                    .await
                    .unwrap();
                if qos == 2 {
                    let (header, ack) = until(&mut socket, 6).await;
                    assert_eq!(header, 0x62);
                    socket.write_all(&[0x70, 2, ack[0], ack[1]]).await.unwrap();
                }
            }
        }
        let (header, body) = until(&mut socket, 10).await;
        assert_eq!(header, 0xa2);
        let mut unsuback = vec![0xb0, if v5 { 4 } else { 2 }, body[0], body[1]];
        if v5 {
            // 没有匹配的订阅也是成功退订。
            unsuback.extend_from_slice(&[0, 0x11]);
        }
        socket.write_all(&unsuback).await.unwrap();
        assert_eq!(packet(&mut socket).await.0, 0xe0);
    });
    let (events, notices) = channel();
    let state = MqttState::default();
    state.connect("test".into(), config, events).await.unwrap();
    assert_eq!(
        state
            .request("test", Action::Subscribe("test/#".into(), QoS::ExactlyOnce))
            .await
            .unwrap(),
        Some(1)
    );
    for level in 0..=2 {
        state
            .request(
                "test",
                Action::Publish(
                    "test".into(),
                    "你好".as_bytes().to_vec(),
                    qos(level).unwrap(),
                    true,
                ),
            )
            .await
            .unwrap();
    }
    state
        .request("test", Action::Unsubscribe("test/#".into()))
        .await
        .unwrap();
    state.disconnect("test").unwrap();
    broker.await.unwrap();
    let notices = notices.lock().unwrap();
    assert!(notices.iter().any(|notice| notice["kind"] == "message"
        && notice["topic"] == "test"
        && notice["retain"] == true
        && notice["payload"] == serde_json::json!([97, 98, 99])));
}

#[tokio::test]
async fn mqtt5_reports_negative_acknowledgements() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut config = config(listener.local_addr().unwrap().port());
    config.protocol_version = ProtocolVersion::V5;
    let broker = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        packet(&mut socket).await;
        // 将发送配额设为 1，确认 QoS 1 被拒后仍可继续操作。
        socket
            .write_all(&[0x20, 6, 0, 0, 3, 0x21, 0, 1])
            .await
            .unwrap();
        let (_, sub) = until(&mut socket, 8).await;
        socket
            .write_all(&[0x90, 4, sub[0], sub[1], 0, 0x87])
            .await
            .unwrap();
        let (_, publish) = until(&mut socket, 3).await;
        socket
            .write_all(&[0x40, 4, publish[6], publish[7], 0x87, 0])
            .await
            .unwrap();
        let (_, unsub) = until(&mut socket, 10).await;
        socket
            .write_all(&[0xb0, 4, unsub[0], unsub[1], 0, 0x87])
            .await
            .unwrap();
        let (_, publish) = until(&mut socket, 3).await;
        socket
            .write_all(&[0x50, 4, publish[6], publish[7], 0x87, 0])
            .await
            .unwrap();
        // 保持套接字打开，直到客户端处理拒绝并主动结束连接。
        let mut byte = [0];
        let read = timeout(Duration::from_secs(5), socket.read(&mut byte))
            .await
            .expect("MQTT client did not close after PUBREC rejection")
            .unwrap();
        assert_eq!(read, 0);
    });
    let state = MqttState::default();
    state
        .connect("v5".into(), config, channel().0)
        .await
        .unwrap();
    let actions = [
        (
            Action::Subscribe("test/#".into(), QoS::AtMostOnce),
            "SUBACK",
        ),
        (
            Action::Publish("test".into(), vec![1], QoS::AtLeastOnce, false),
            "PUBACK",
        ),
        (Action::Unsubscribe("test/#".into()), "UNSUBACK"),
        (
            Action::Publish("test".into(), vec![2], QoS::ExactlyOnce, false),
            "PUBREC",
        ),
    ];
    for (action, packet) in actions {
        let error = state.request("v5", action).await.unwrap_err();
        assert!(
            error.contains(&format!("{packet}: NotAuthorized")),
            "{error}"
        );
    }
    broker.await.unwrap();
}

#[tokio::test]
async fn rejected_subscriptions_and_network_loss_are_reported() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let broker = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        packet(&mut socket).await;
        socket.write_all(&[0x20, 2, 0, 0]).await.unwrap();
        let (_, body) = packet(&mut socket).await;
        socket
            .write_all(&[0x90, 3, body[0], body[1], 0x80])
            .await
            .unwrap();
        let _ = packet(&mut socket).await;
        // 不发 PUBACK 就关闭连接，发布必须返回失败。
    });
    let (events, notices) = channel();
    let state = MqttState::default();
    state
        .connect("reject".into(), config(port), events)
        .await
        .unwrap();
    assert!(state
        .request(
            "reject",
            Action::Subscribe("denied".into(), QoS::AtMostOnce)
        )
        .await
        .unwrap_err()
        .contains("rejected"));
    assert!(state
        .request(
            "reject",
            Action::Publish("test".into(), vec![1], QoS::AtLeastOnce, false)
        )
        .await
        .is_err());
    broker.await.unwrap();
    assert!(notices
        .lock()
        .unwrap()
        .iter()
        .any(|notice| notice["kind"] == "closed" && notice["error"].is_string()));
}

#[tokio::test]
async fn connecting_session_can_be_cancelled_without_connack() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let state = MqttState::default();
    let connection_state = state.clone();
    let connect = tokio::spawn(async move {
        connection_state
            .connect("cancel".into(), config(port), channel().0)
            .await
    });
    let (mut socket, _) = listener.accept().await.unwrap();
    packet(&mut socket).await;
    state.disconnect("cancel").unwrap();
    assert!(timeout(Duration::from_secs(2), connect)
        .await
        .unwrap()
        .unwrap()
        .is_err());
    assert!(state.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn connect_packet_contains_last_will() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut config = config(listener.local_addr().unwrap().port());
    config.will_enabled = true;
    config.will_topic = "devices/status".into();
    config.will_payload = "离线".into();
    config.will_qos = 1;
    config.will_retain = true;
    let broker = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let (_, body) = packet(&mut socket).await;
        assert_eq!(body[7], 0x2e);
        let mut offset = 10;
        let mut fields = Vec::new();
        for _ in 0..3 {
            let length = u16::from_be_bytes([body[offset], body[offset + 1]]) as usize;
            offset += 2;
            fields.push(body[offset..offset + length].to_vec());
            offset += length;
        }
        assert_eq!(fields[1], b"devices/status");
        assert_eq!(fields[2], "离线".as_bytes());
        socket.write_all(&[0x20, 2, 0, 0]).await.unwrap();
        until(&mut socket, 14).await;
    });
    let state = MqttState::default();
    state
        .connect("will".into(), config, channel().0)
        .await
        .unwrap();
    state.disconnect("will").unwrap();
    broker.await.unwrap();
}

#[tokio::test]
async fn configured_connect_timeout_stops_unresponsive_broker() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut config = config(listener.local_addr().unwrap().port());
    config.connect_timeout = 1;
    let broker = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        packet(&mut socket).await;
        tokio::time::sleep(Duration::from_secs(3)).await;
    });
    let result = timeout(
        Duration::from_secs(2),
        MqttState::default().connect("timeout".into(), config, channel().0),
    )
    .await
    .unwrap();
    assert!(result.is_err());
    broker.abort();
}

#[path = "websocket_tests.rs"]
mod websocket_tests;
