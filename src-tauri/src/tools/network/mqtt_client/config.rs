//! MQTT 配置校验、TLS 信任链与遗嘱参数构建。
use super::protocol::Options;
use rumqttc::{v5, LastWill, MqttOptions, QoS, Transport};
use serde::Deserialize;
use std::time::Duration;

pub(super) const MAX_PAYLOAD: usize = 256 * 1024;
const MAX_PACKET_SIZE: usize = MAX_PAYLOAD + 65536;

#[derive(Clone, Copy, Default, Deserialize)]
pub(crate) enum ProtocolVersion {
    #[default]
    #[serde(rename = "3.1.1")]
    V311,
    #[serde(rename = "5.0")]
    V5,
}

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
    #[serde(default)]
    pub protocol_version: ProtocolVersion,
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout: u16,
    #[serde(default)]
    pub will_enabled: bool,
    #[serde(default)]
    pub will_topic: String,
    #[serde(default)]
    pub will_payload: String,
    #[serde(default)]
    pub will_qos: u8,
    #[serde(default)]
    pub will_retain: bool,
}

fn default_connect_timeout() -> u16 {
    10
}

impl Config {
    pub(super) fn options(self) -> Result<Options, String> {
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
        if !(1..=300).contains(&self.connect_timeout) {
            return Err("Connect timeout must be between 1 and 300 seconds".into());
        }
        if self.will_enabled
            && (!valid_topic(&self.will_topic, false)
                || self.will_payload.len() > u16::MAX as usize)
        {
            return Err(
                "Invalid Last-Will Topic or Last-Will Payload (maximum 65535 bytes)".into(),
            );
        }
        let will_qos = self.will_enabled.then(|| qos(self.will_qos)).transpose()?;
        let transport = if self.tls {
            tls_transport()?
        } else {
            Transport::tcp()
        };
        let keep_alive = Duration::from_secs(self.keep_alive.into());
        Ok(match self.protocol_version {
            ProtocolVersion::V311 => {
                let mut options = MqttOptions::new(self.client_id, self.host, self.port);
                options
                    .set_keep_alive(keep_alive)
                    .set_clean_session(self.clean_session)
                    .set_max_packet_size(MAX_PACKET_SIZE, MAX_PACKET_SIZE)
                    .set_transport(transport);
                if !self.username.is_empty() {
                    options.set_credentials(self.username, self.password);
                }
                if let Some(qos) = will_qos {
                    options.set_last_will(LastWill::new(
                        self.will_topic,
                        self.will_payload.into_bytes(),
                        qos,
                        self.will_retain,
                    ));
                }
                Options::V311(Box::new(options))
            }
            ProtocolVersion::V5 => {
                let mut options = v5::MqttOptions::new(self.client_id, self.host, self.port);
                // 关闭「清除会话」时，请求恢复旧会话并让新会话持续保留。
                let expiry = if self.clean_session { 0 } else { u32::MAX };
                options
                    .set_keep_alive(keep_alive)
                    .set_clean_start(self.clean_session)
                    .set_session_expiry_interval(Some(expiry))
                    .set_max_packet_size(Some(MAX_PACKET_SIZE as u32))
                    .set_connection_timeout(self.connect_timeout.into())
                    .set_transport(transport);
                if !self.username.is_empty() {
                    options.set_credentials(self.username, self.password);
                }
                if let Some(qos) = will_qos {
                    options.set_last_will(v5::mqttbytes::v5::LastWill::new(
                        self.will_topic,
                        self.will_payload.into_bytes(),
                        super::protocol::v5_qos(qos),
                        self.will_retain,
                        None,
                    ));
                }
                Options::V5(Box::new(options))
            }
        })
    }
}

fn tls_transport() -> Result<Transport, String> {
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
    Ok(Transport::tls_with_config(tls.into()))
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
