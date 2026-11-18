//! 将两个版本的客户端操作和协议事件转换为会话层使用的接口。
use rumqttc::{v5, Outgoing, QoS};
use std::time::Duration;
use v5::mqttbytes::{
    v5::{PubAckReason, PubCompReason, PubRecReason, SubscribeReasonCode, UnsubAckReason},
    QoS as V5Qos,
};

pub(super) enum Options {
    V311(Box<rumqttc::MqttOptions>),
    V5(Box<v5::MqttOptions>),
}

pub(super) enum Action {
    Subscribe(String, QoS),
    Unsubscribe(String),
    Publish(String, Vec<u8>, QoS, bool),
}

pub(super) enum Event {
    Connected,
    Disconnected,
    Message {
        topic: String,
        payload: Vec<u8>,
        qos: u8,
        retain: bool,
    },
    Subscribed(Result<u8, String>),
    Unsubscribed(Result<(), String>),
    Published(QoS, Result<(), String>),
    Other,
}

impl Event {
    pub(super) fn completion(self, action: &Action) -> Option<Result<Option<u8>, String>> {
        match (action, self) {
            (Action::Subscribe(..), Self::Subscribed(result)) => Some(result.map(Some)),
            (Action::Unsubscribe(..), Self::Unsubscribed(result)) => Some(result.map(|()| None)),
            (Action::Publish(_, _, qos, _), Self::Published(level, result)) if *qos == level => {
                Some(result.map(|()| None))
            }
            _ => None,
        }
    }
}

pub(super) enum Connection {
    V311(rumqttc::AsyncClient, Box<rumqttc::EventLoop>),
    V5(v5::AsyncClient, Box<v5::EventLoop>),
}

impl Connection {
    pub(super) fn new(options: Options, timeout: Duration) -> Self {
        match options {
            Options::V311(options) => {
                let (client, mut event_loop) = rumqttc::AsyncClient::new(*options, 16);
                event_loop
                    .network_options
                    .set_connection_timeout(timeout.as_secs());
                Self::V311(client, Box::new(event_loop))
            }
            Options::V5(options) => {
                let (client, event_loop) = v5::AsyncClient::new(*options, 16);
                Self::V5(client, Box::new(event_loop))
            }
        }
    }

    pub(super) fn submit(&self, action: &Action) -> Result<(), String> {
        match self {
            Self::V311(client, _) => match action {
                Action::Subscribe(topic, qos) => client.try_subscribe(topic, *qos),
                Action::Unsubscribe(topic) => client.try_unsubscribe(topic),
                Action::Publish(topic, payload, qos, retain) => {
                    client.try_publish(topic, *qos, *retain, payload.clone())
                }
            }
            .map_err(|error| error.to_string()),
            Self::V5(client, _) => match action {
                Action::Subscribe(topic, qos) => client.try_subscribe(topic, v5_qos(*qos)),
                Action::Unsubscribe(topic) => client.try_unsubscribe(topic),
                Action::Publish(topic, payload, qos, retain) => {
                    client.try_publish(topic, v5_qos(*qos), *retain, payload.clone())
                }
            }
            .map_err(|error| error.to_string()),
        }
    }

    pub(super) fn disconnect(&self) {
        match self {
            Self::V311(client, _) => {
                let _ = client.try_disconnect();
            }
            Self::V5(client, _) => {
                let _ = client.try_disconnect();
            }
        }
    }

    pub(super) async fn poll(&mut self) -> Result<Event, String> {
        match self {
            Self::V311(_, event_loop) => event_loop
                .poll()
                .await
                .map(event311)
                .map_err(|e| e.to_string()),
            Self::V5(_, event_loop) => event5(event_loop.poll().await.map_err(|e| e.to_string())?),
        }
    }
}

pub(super) fn v5_qos(qos: QoS) -> V5Qos {
    match qos {
        QoS::AtMostOnce => V5Qos::AtMostOnce,
        QoS::AtLeastOnce => V5Qos::AtLeastOnce,
        QoS::ExactlyOnce => V5Qos::ExactlyOnce,
    }
}

fn outgoing(event: Outgoing) -> Event {
    match event {
        Outgoing::Publish(0) => Event::Published(QoS::AtMostOnce, Ok(())),
        Outgoing::Disconnect => Event::Disconnected,
        _ => Event::Other,
    }
}

fn event311(event: rumqttc::Event) -> Event {
    use rumqttc::{
        Event::{Incoming, Outgoing},
        Incoming as Packet,
    };
    match event {
        Outgoing(event) => outgoing(event),
        Incoming(Packet::ConnAck(_)) => Event::Connected,
        Incoming(Packet::Publish(packet)) => Event::Message {
            topic: packet.topic,
            payload: packet.payload.to_vec(),
            qos: packet.qos as u8,
            retain: packet.retain,
        },
        Incoming(Packet::SubAck(ack)) => Event::Subscribed(match ack.return_codes.first() {
            Some(rumqttc::SubscribeReasonCode::Success(qos)) => Ok(*qos as u8),
            _ => Err("Broker rejected the subscription".into()),
        }),
        Incoming(Packet::UnsubAck(_)) => Event::Unsubscribed(Ok(())),
        Incoming(Packet::PubAck(_)) => Event::Published(QoS::AtLeastOnce, Ok(())),
        Incoming(Packet::PubComp(_)) => Event::Published(QoS::ExactlyOnce, Ok(())),
        _ => Event::Other,
    }
}

fn event5(event: v5::Event) -> Result<Event, String> {
    use v5::{
        Event::{Incoming, Outgoing},
        Incoming as Packet,
    };
    Ok(match event {
        Outgoing(event) => outgoing(event),
        Incoming(Packet::ConnAck(_)) => Event::Connected,
        Incoming(Packet::Publish(packet)) => Event::Message {
            topic: String::from_utf8(packet.topic.to_vec())
                .map_err(|_| "Invalid MQTT topic encoding")?,
            payload: packet.payload.to_vec(),
            qos: packet.qos as u8,
            retain: packet.retain,
        },
        Incoming(Packet::SubAck(ack)) => Event::Subscribed(match ack.return_codes.first() {
            Some(SubscribeReasonCode::Success(qos)) => Ok(*qos as u8),
            Some(reason) => Err(format!(
                "Broker rejected the subscription (SUBACK: {reason:?})"
            )),
            None => Err("Broker sent SUBACK without a reason code".into()),
        }),
        Incoming(Packet::UnsubAck(ack)) => Event::Unsubscribed(match ack.reasons.first() {
            Some(UnsubAckReason::Success | UnsubAckReason::NoSubscriptionExisted) => Ok(()),
            Some(reason) => Err(format!(
                "Broker rejected the unsubscribe request (UNSUBACK: {reason:?})"
            )),
            None => Err("Broker sent UNSUBACK without a reason code".into()),
        }),
        Incoming(Packet::PubAck(ack)) => Event::Published(
            QoS::AtLeastOnce,
            match ack.reason {
                PubAckReason::Success | PubAckReason::NoMatchingSubscribers => Ok(()),
                reason => Err(format!(
                    "Broker rejected the publish request (PUBACK: {reason:?})"
                )),
            },
        ),
        // 当前库在 QoS 2 失败时不会释放发送配额，结束连接以免后续请求卡住。
        Incoming(Packet::PubRec(ack))
            if !matches!(
                ack.reason,
                PubRecReason::Success | PubRecReason::NoMatchingSubscribers
            ) =>
        {
            return Err(format!(
                "Broker rejected the publish request (PUBREC: {:?})",
                ack.reason
            ));
        }
        Incoming(Packet::PubComp(ack)) if ack.reason != PubCompReason::Success => {
            return Err(format!(
                "Broker rejected the publish request (PUBCOMP: {:?})",
                ack.reason
            ));
        }
        Incoming(Packet::PubComp(_)) => Event::Published(QoS::ExactlyOnce, Ok(())),
        _ => Event::Other,
    })
}
