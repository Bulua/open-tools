//! 本机 WebSocket / TLS 对端验证，不依赖公网 MQTT 服务器。
use super::*;
use crate::tools::network::mqtt_client::{config::ConnectionTransport, protocol};
use async_tungstenite::{
    tokio::accept_hdr_async,
    tungstenite::{
        handshake::server::{Request, Response},
        Message as WsMessage,
    },
};
use futures_util::StreamExt;
use rustls::pki_types::PrivatePkcs8KeyDer;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio_rustls::TlsAcceptor;

trait TestIo: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> TestIo for T {}

#[test]
fn transport_options_and_legacy_tls_are_preserved() {
    for version in [ProtocolVersion::V311, ProtocolVersion::V5] {
        for kind in [
            ConnectionTransport::Mqtt,
            ConnectionTransport::Mqtts,
            ConnectionTransport::Ws,
            ConnectionTransport::Wss,
        ] {
            let mut config = config(1883);
            config.protocol_version = version;
            config.transport = Some(kind);
            config.path = "/custom/mqtt?token=test".into();
            let (address, transport) = match config.options().unwrap() {
                protocol::Options::V311(options) => {
                    (options.broker_address().0, options.transport())
                }
                protocol::Options::V5(options) => (options.broker_address().0, options.transport()),
            };
            match kind {
                ConnectionTransport::Mqtt => assert!(matches!(transport, rumqttc::Transport::Tcp)),
                ConnectionTransport::Mqtts => {
                    assert!(matches!(transport, rumqttc::Transport::Tls(_)))
                }
                ConnectionTransport::Ws => {
                    assert!(matches!(transport, rumqttc::Transport::Ws));
                    assert_eq!(address, "ws://127.0.0.1:1883/custom/mqtt?token=test");
                }
                ConnectionTransport::Wss => {
                    assert!(matches!(transport, rumqttc::Transport::Wss(_)));
                    assert_eq!(address, "wss://127.0.0.1:1883/custom/mqtt?token=test");
                }
            }
        }
    }
    let old: Config = serde_json::from_value(serde_json::json!({"host":"localhost", "port":8883, "clientId":"legacy", "username":"", "password":"", "keepAlive":60, "cleanSession":true, "tls":true})).unwrap();
    let protocol::Options::V311(options) = old.options().unwrap() else {
        panic!("Wrong MQTT version");
    };
    assert!(matches!(options.transport(), rumqttc::Transport::Tls(_)));
    for path in [
        "",
        "mqtt",
        "/mqtt#fragment",
        "/mqtt bad",
        "/mqtt\r\nHeader: x",
        "/mqtt\\other",
    ] {
        let mut config = config(80);
        config.transport = Some(ConnectionTransport::Ws);
        config.path = path.into();
        assert!(config.options().is_err(), "{path:?}");
    }
    let mut config = config(8083);
    config.host = "::1".into();
    config.transport = Some(ConnectionTransport::Ws);
    let protocol::Options::V311(options) = config.options().unwrap() else {
        panic!("Wrong MQTT version");
    };
    assert_eq!(options.broker_address().0, "ws://[::1]:8083/mqtt");
}

#[tokio::test]
async fn websocket_and_secure_websocket_roundtrip_both_mqtt_versions() {
    for secure in [false, true] {
        for version in [ProtocolVersion::V311, ProtocolVersion::V5] {
            timeout(Duration::from_secs(8), roundtrip(secure, version))
                .await
                .expect("WebSocket roundtrip timed out");
        }
    }
}

async fn roundtrip(secure: bool, version: ProtocolVersion) {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let certificate = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let der = certificate.cert.der().clone();
    let server_tls = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(
            vec![der.clone()],
            PrivatePkcs8KeyDer::from(certificate.signing_key.serialize_der()).into(),
        )
        .unwrap();
    let acceptor = TlsAcceptor::from(Arc::new(server_tls));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut config = config(listener.local_addr().unwrap().port());
    config.host = "localhost".into();
    config.path = "/custom/mqtt?token=test".into();
    config.transport = Some(if secure {
        ConnectionTransport::Wss
    } else {
        ConnectionTransport::Ws
    });
    config.protocol_version = version;
    let v5 = matches!(version, ProtocolVersion::V5);
    let broker = tokio::spawn(async move {
        let (tcp, _) = listener.accept().await.unwrap();
        let stream: Box<dyn TestIo> = if secure {
            Box::new(acceptor.accept(tcp).await.unwrap())
        } else {
            Box::new(tcp)
        };
        let mut socket = accept_hdr_async(stream, |request: &Request, mut response: Response| {
            assert_eq!(
                request.uri().path_and_query().unwrap().as_str(),
                "/custom/mqtt?token=test"
            );
            assert_eq!(request.headers()["Sec-WebSocket-Protocol"], "mqtt");
            response
                .headers_mut()
                .insert("Sec-WebSocket-Protocol", "mqtt".parse().unwrap());
            Ok(response)
        })
        .await
        .unwrap();
        let connect = socket.next().await.unwrap().unwrap().into_data();
        assert_eq!(connect[0], 0x10);
        assert_eq!(connect[8], if v5 { 5 } else { 4 });
        socket
            .send(WsMessage::Binary(
                if v5 {
                    vec![0x20, 3, 0, 0, 0]
                } else {
                    vec![0x20, 2, 0, 0]
                }
                .into(),
            ))
            .await
            .unwrap();
        let subscribe = socket.next().await.unwrap().unwrap().into_data();
        assert_eq!(subscribe[0], 0x82);
        let mut ack = vec![0x90, if v5 { 4 } else { 3 }, subscribe[2], subscribe[3]];
        if v5 {
            ack.push(0);
        }
        ack.push(0);
        socket.send(WsMessage::Binary(ack.into())).await.unwrap();
        let publish = socket.next().await.unwrap().unwrap().into_data();
        assert_eq!(publish[0], 0x30);
        assert!(publish.ends_with(&[255, 0, 128]));
        let mut incoming = vec![0x30, if v5 { 10 } else { 9 }, 0, 4, b't', b'e', b's', b't'];
        if v5 {
            incoming.push(0);
        }
        incoming.extend_from_slice(&[255, 0, 128]);
        socket
            .send(WsMessage::Binary(incoming.into()))
            .await
            .unwrap();
        let disconnect = socket.next().await.unwrap().unwrap().into_data();
        assert_eq!(disconnect[0], 0xe0);
    });
    let mut options = config.options().unwrap();
    if secure {
        // 只为本机对端信任测试证书；生产配置仍仅使用系统信任链。
        let mut roots = rustls::RootCertStore::empty();
        roots.add(der).unwrap();
        let tls = rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        match &mut options {
            protocol::Options::V311(options) => {
                options.set_transport(rumqttc::Transport::wss_with_config(tls.into()));
            }
            protocol::Options::V5(options) => {
                options.set_transport(rumqttc::Transport::wss_with_config(tls.into()));
            }
        }
    }
    let mut connection = protocol::Connection::new(options, Duration::from_secs(3));
    assert!(matches!(
        connection.poll().await.unwrap(),
        protocol::Event::Connected
    ));
    connection
        .submit(&Action::Subscribe("test".into(), QoS::AtMostOnce))
        .unwrap();
    loop {
        if matches!(
            connection.poll().await.unwrap(),
            protocol::Event::Subscribed(Ok(0))
        ) {
            break;
        }
    }
    connection
        .submit(&Action::Publish(
            "test".into(),
            vec![255, 0, 128],
            QoS::AtMostOnce,
            false,
        ))
        .unwrap();
    loop {
        if let protocol::Event::Message { topic, payload, .. } = connection.poll().await.unwrap() {
            assert_eq!(topic, "test");
            assert_eq!(payload, [255, 0, 128]);
            break;
        }
    }
    connection.disconnect();
    loop {
        if matches!(
            connection.poll().await,
            Ok(protocol::Event::Disconnected) | Err(_)
        ) {
            break;
        }
    }
    broker.await.unwrap();
}

#[tokio::test]
async fn secure_websocket_rejects_untrusted_certificates() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let certificate = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let tls = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(
            vec![certificate.cert.der().clone()],
            PrivatePkcs8KeyDer::from(certificate.signing_key.serialize_der()).into(),
        )
        .unwrap();
    let acceptor = TlsAcceptor::from(Arc::new(tls));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut config = config(listener.local_addr().unwrap().port());
    config.host = "localhost".into();
    config.transport = Some(ConnectionTransport::Wss);
    let broker = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        assert!(acceptor.accept(stream).await.is_err());
    });
    let result = timeout(
        Duration::from_secs(5),
        MqttState::default().connect("untrusted-wss".into(), config, channel().0),
    )
    .await
    .unwrap();
    assert!(result.is_err());
    timeout(Duration::from_secs(5), broker)
        .await
        .unwrap()
        .unwrap();
}
