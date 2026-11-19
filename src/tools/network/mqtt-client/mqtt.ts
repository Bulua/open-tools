import type { PayloadFormat } from "./payload";

export const MAX_PAYLOAD = 256 * 1024;
export const MAX_MESSAGES = 200;
export const MAX_LOG_BYTES = 4 * 1024 * 1024;
export type QoS = 0 | 1 | 2;
export const MQTT_VERSIONS = [
  { value: "3.1.1", labelKey: "network.mqtt.version311" },
  { value: "5.0", labelKey: "network.mqtt.version50" },
] as const;
export const CONNECTION_TRANSPORTS = ["mqtt", "mqtts", "ws", "wss"] as const;
export type ConnectionTransport = (typeof CONNECTION_TRANSPORTS)[number];
export const DEFAULT_PORTS: Record<ConnectionTransport, number> = { mqtt: 1883, mqtts: 8883, ws: 80, wss: 443 };
export const isConnectionTransport = (value: unknown): value is ConnectionTransport => CONNECTION_TRANSPORTS.some(item => item === value);
export const isWebSocket = (transport: ConnectionTransport) => transport === "ws" || transport === "wss";
export const usesTls = (transport: ConnectionTransport) => transport === "mqtts" || transport === "wss";
export const validWebSocketPath = (path: string) => path.startsWith("/") && !/[\s\u0000-\u001f\u007f#\\]/.test(path);
export function connectionAddress(config: Pick<ConnectionConfig, "transport" | "host" | "port" | "path">): string {
  const host = config.host.includes(":") && !config.host.startsWith("[") ? `[${config.host}]` : config.host;
  return `${config.transport}://${host}:${config.port}${isWebSocket(config.transport) ? config.path : ""}`;
}
export type ProtocolVersion = (typeof MQTT_VERSIONS)[number]["value"];
export const DEFAULT_CONNECTION_OPTIONS = {
  transport: "mqtt" as ConnectionTransport, path: "/mqtt",
  protocolVersion: "3.1.1" as ProtocolVersion,
  connectTimeout: 10, autoReconnect: false, reconnectPeriod: 4000,
  willEnabled: false, willTopic: "", willPayload: "", willQos: 0 as QoS, willRetain: false,
};
export interface ConnectionConfig {
  host: string; port: number; clientId: string; username: string; password: string;
  keepAlive: number; cleanSession: boolean; tls: boolean;
  transport: ConnectionTransport; path: string;
  protocolVersion: ProtocolVersion;
  connectTimeout: number; autoReconnect: boolean; reconnectPeriod: number;
  willEnabled: boolean; willTopic: string; willPayload: string; willQos: QoS; willRetain: boolean;
}
export type ConnectionStatus = "disconnected" | "connecting" | "reconnecting" | "connected" | "disconnecting";
export interface PublishDraft {
  publishTopic: string; publishQos: QoS; retain: boolean; payload: string; mode: PayloadFormat;
}
export const createClientId = () => `open-tools-${crypto.randomUUID().slice(0, 8)}`;
export function createConnectionConfig(): ConnectionConfig {
  return { ...DEFAULT_CONNECTION_OPTIONS, host: "127.0.0.1", port: 1883, clientId: createClientId(), username: "", password: "", keepAlive: 60, cleanSession: true, tls: false };
}
export type MqttNotice =
  | { kind: "message"; topic: string; payload: number[]; qos: QoS; retain: boolean }
  | { kind: "closed"; error: string | null };
export interface SentPayload { format: PayloadFormat; payload: string; }
export interface Message {
  id: number; time: number; direction: "received" | "sent"; topic: string;
  payload: string; rawPayload: number[]; bytes: number; qos: QoS; retain: boolean; binary: boolean; sent?: SentPayload;
}

/** 不 trim 主题：空格在 MQTT 中是有效且有意义的字符。 */
export function validTopic(value: string, filter = false): boolean {
  if (!value || value.includes("\0") || new TextEncoder().encode(value).length > 65535 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return false;
  if (!filter) return !/[+#]/.test(value);
  const levels = value.split("/");
  return levels.every((part, i) => (!part.includes("+") || part === "+") && (!part.includes("#") || (part === "#" && i === levels.length - 1)));
}

/** 按 MQTT 层级规则匹配订阅，根通配符不匹配以 $ 开头的系统主题。 */
export function matchesTopic(filter: string, topic: string): boolean {
  if (!validTopic(filter, true) || !validTopic(topic)) return false;
  if (topic.startsWith("$") && (filter.startsWith("+") || filter.startsWith("#"))) return false;
  const pattern = filter.split("/");
  const levels = topic.split("/");
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "#") return true;
    if (i >= levels.length || (pattern[i] !== "+" && pattern[i] !== levels[i])) return false;
  }
  return pattern.length === levels.length;
}

export function validConfig(config: ConnectionConfig): boolean {
  return !!config.host.trim() && !/[\s/?#@\\\0]/.test(config.host.trim()) &&
    isConnectionTransport(config.transport) && (!isWebSocket(config.transport) || validWebSocketPath(config.path)) &&
    Number.isInteger(config.port) && config.port > 0 && config.port <= 65535 &&
    Number.isInteger(config.keepAlive) && config.keepAlive >= 5 && config.keepAlive <= 65535 &&
    !!config.clientId && [config.clientId, config.username, config.password].every(s => !s.includes("\0") && new TextEncoder().encode(s).length <= 65535) &&
    (!config.password || !!config.username) && validAdvancedConfig(config);
}

export function validAdvancedConfig(config: ConnectionConfig): boolean {
  return Number.isInteger(config.connectTimeout) && config.connectTimeout >= 1 && config.connectTimeout <= 300 &&
    (!config.autoReconnect || (Number.isInteger(config.reconnectPeriod) && config.reconnectPeriod >= 1000 && config.reconnectPeriod <= 3600000)) &&
    (!config.willEnabled || (validTopic(config.willTopic) && [0, 1, 2].includes(config.willQos) &&
      new TextEncoder().encode(config.willPayload).length <= 65535));
}

export function decodePayload(payload: number[]): { payload: string; binary: boolean } {
  const bytes = Uint8Array.from(payload);
  try { return { payload: new TextDecoder("utf-8", { fatal: true }).decode(bytes), binary: false }; }
  catch { return { payload: Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(" "), binary: true }; }
}

/** 同时限制条数和总字节，持续接收大消息时不会无限增长。 */
export function appendMessage(messages: Message[], message: Message): Message[] {
  const next = [...messages, message].slice(-MAX_MESSAGES);
  let bytes = next.reduce((total, item) => total + item.bytes, 0);
  while (bytes > MAX_LOG_BYTES && next.length > 1) bytes -= next.shift()!.bytes;
  return next;
}

export function displayPayload(payload: string, json: boolean): string {
  if (json) { try { return JSON.stringify(JSON.parse(payload), null, 2); } catch { /* 非 JSON 消息保留原文。 */ } }
  return payload;
}
