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

export interface MqttTopicItem {
  topic: string;
  qos: QoS;
}

export type MqttSessionConfig = Omit<ConnectionConfig, "password">;

export interface MqttDraftDto {
  config: MqttSessionConfig;
  topics: MqttTopicItem[];
  subscriptionQos: QoS;
  publishTopic: string;
  publishQos: QoS;
  retain: boolean;
  payload: string;
  mode: "text" | "json" | "hex" | "base64";
}

export interface MqttFolderNode {
  id: string;
  parentId: string | null;
  name: string;
  kind: "folder";
  collapsed: boolean;
}

export interface MqttSessionNode {
  id: string;
  parentId: string | null;
  name: string;
  kind: "session";
  draft: MqttDraftDto;
}

export type MqttTreeNode = MqttFolderNode | MqttSessionNode;

export interface MqttWorkspace {
  nodes: MqttTreeNode[];
  activeId: string;
}
