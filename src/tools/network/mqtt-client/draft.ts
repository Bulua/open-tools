import { isPayloadFormat } from "./payload";
import { DEFAULT_CONNECTION_OPTIONS, MAX_PAYLOAD, createConnectionConfig, isConnectionTransport, usesTls, validTopic, type ConnectionConfig, type PublishDraft, type QoS } from "./mqtt";

export interface MqttDraft extends PublishDraft {
  config: Omit<ConnectionConfig, "password">;
  topics: { topic: string; qos: QoS }[];
  subscriptionQos: QoS;
}
const isQos = (value: unknown): value is QoS => value === 0 || value === 1 || value === 2;

/** 逐字段读取，旧数据或被污染的存储不能把密码等额外字段重新写回磁盘。 */
export function cleanDraft(value: unknown): MqttDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<MqttDraft>;
  const c = draft.config;
  if (!c || typeof c.host !== "string" || typeof c.clientId !== "string" || typeof c.username !== "string" ||
    typeof c.port !== "number" || !Number.isFinite(c.port) || typeof c.keepAlive !== "number" || !Number.isFinite(c.keepAlive) ||
    typeof c.tls !== "boolean" || typeof c.cleanSession !== "boolean") return null;
  const topics = Array.isArray(draft.topics) ? draft.topics.filter(item => item && typeof item.topic === "string" && validTopic(item.topic, true) && isQos(item.qos)) : [];
  const transport = isConnectionTransport(c.transport) ? c.transport : c.tls ? "mqtts" : "mqtt";
  return {
    config: { host: c.host, port: c.port, clientId: c.clientId, username: c.username, keepAlive: c.keepAlive, tls: usesTls(transport), transport, path: typeof c.path === "string" ? c.path : "/mqtt", cleanSession: c.cleanSession,
      protocolVersion: c.protocolVersion === "5.0" ? c.protocolVersion : DEFAULT_CONNECTION_OPTIONS.protocolVersion,
      connectTimeout: typeof c.connectTimeout === "number" && Number.isFinite(c.connectTimeout) ? c.connectTimeout : DEFAULT_CONNECTION_OPTIONS.connectTimeout,
      autoReconnect: c.autoReconnect === true,
      reconnectPeriod: typeof c.reconnectPeriod === "number" && Number.isFinite(c.reconnectPeriod) ? c.reconnectPeriod : DEFAULT_CONNECTION_OPTIONS.reconnectPeriod,
      willEnabled: c.willEnabled === true, willTopic: typeof c.willTopic === "string" ? c.willTopic : "",
      willPayload: typeof c.willPayload === "string" && new TextEncoder().encode(c.willPayload).length <= 65535 ? c.willPayload : "",
      willQos: isQos(c.willQos) ? c.willQos : 0, willRetain: c.willRetain === true,
    },
    topics: [...new Map(topics.map(item => [item.topic, { topic: item.topic, qos: item.qos }])).values()],
    publishTopic: typeof draft.publishTopic === "string" ? draft.publishTopic : "test/demo",
    publishQos: isQos(draft.publishQos) ? draft.publishQos : 0,
    retain: draft.retain === true,
    payload: typeof draft.payload === "string" && new TextEncoder().encode(draft.payload).length <= MAX_PAYLOAD * (draft.mode === "hex" || draft.mode === "base64" ? 4 : 1) ? draft.payload : "",
    mode: isPayloadFormat(draft.mode) ? draft.mode : "text",
    subscriptionQos: isQos(draft.subscriptionQos) ? draft.subscriptionQos : 0,
  };
}

export function createDraft(): MqttDraft {
  return cleanDraft({
    config: createConnectionConfig(),
    topics: [], publishTopic: "test/demo", publishQos: 0, retain: false, payload: "", mode: "text", subscriptionQos: 0,
  })!;
}

