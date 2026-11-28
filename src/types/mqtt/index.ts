/**
 * MQTT 客户端模块前后端通信类型定义。
 */

export type QoS = 0 | 1 | 2;
export type ConnectionTransport = "mqtt" | "mqtts" | "ws" | "wss";
export type ProtocolVersion = "3.1.1" | "5.0";
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "reconnecting"
  | "connected"
  | "disconnecting";

export interface ConnectionConfig {
  host: string;
  port: number;
  clientId: string;
  username: string;
  password: string;
  keepAlive: number;
  cleanSession: boolean;
  tls: boolean;
  transport: ConnectionTransport;
  path: string;
  protocolVersion: ProtocolVersion;
  connectTimeout: number;
  autoReconnect: boolean;
  reconnectPeriod: number;
  willEnabled: boolean;
  willTopic: string;
  willPayload: string;
  willQos: QoS;
  willRetain: boolean;
}

export type MqttNotice =
  | { kind: "message"; topic: string; payload: number[]; qos: QoS; retain: boolean }
  | { kind: "closed"; error: string | null };
