export const MAX_PAYLOAD = 256 * 1024;
export const MAX_MESSAGES = 200;
export const MAX_LOG_BYTES = 4 * 1024 * 1024;
export type QoS = 0 | 1 | 2;
export interface ConnectionConfig {
  host: string; port: number; clientId: string; username: string; password: string;
  keepAlive: number; cleanSession: boolean; tls: boolean;
}
export type MqttNotice =
  | { kind: "message"; topic: string; payload: number[]; qos: QoS; retain: boolean }
  | { kind: "closed"; error: string | null };
export interface Message {
  id: number; time: number; direction: "received" | "sent"; topic: string;
  payload: string; bytes: number; qos: QoS; retain: boolean; binary: boolean;
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
  return !!config.host.trim() && !/[\s/?#\0]/.test(config.host.trim()) &&
    Number.isInteger(config.port) && config.port > 0 && config.port <= 65535 &&
    Number.isInteger(config.keepAlive) && config.keepAlive >= 5 && config.keepAlive <= 65535 &&
    !!config.clientId && [config.clientId, config.username, config.password].every(s => !s.includes("\0") && new TextEncoder().encode(s).length <= 65535) &&
    (!config.password || !!config.username);
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
