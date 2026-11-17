import { describe, expect, it } from "vitest";
import { appendMessage, decodePayload, displayPayload, matchesTopic, MAX_LOG_BYTES, validConfig, validTopic, type ConnectionConfig, type Message } from "./mqtt";

describe("MQTT 输入与消息记录", () => {
  it("按订阅主题筛选消息，支持多层通配符和系统主题规则", () => {
    for (const [filter, topic] of [["a/+", "a/b"], ["a/+", "a/"], ["a/#", "a"], ["a/#", "a/b/c"], ["#", "a/b"], ["$SYS/#", "$SYS/status"]]) expect(matchesTopic(filter, topic), `${filter}: ${topic}`).toBe(true);
    for (const [filter, topic] of [["a/+", "a"], ["a/+", "a/b/c"], ["a/b", "a/B"], ["#", "$SYS/status"], ["+/status", "$SYS/status"], ["a/#/b", "a/b"], ["a", "a/"]]) expect(matchesTopic(filter, topic), `${filter}: ${topic}`).toBe(false);
  });
  it("区分订阅过滤器和发送主题，保留空格与空层级", () => {
    for (const topic of ["test/+", "test/#", "+/status", "#", "/", " test "]) expect(validTopic(topic, true), topic).toBe(true);
    for (const topic of ["", "test+", "a/#/b", "a/++", "a\0b", "\ud800", "温".repeat(21846)]) expect(validTopic(topic, true), topic).toBe(false);
    expect(validTopic("test/+", false)).toBe(false);
    expect(validTopic("test/#", false)).toBe(false);
    expect(validTopic(" test/ ", false)).toBe(true);
  });
  it("校验端口、保活范围和密码与用户名的关联", () => {
    const config: ConnectionConfig = { host: "127.0.0.1", port: 1883, clientId: "test", username: "", password: "", keepAlive: 60, cleanSession: true, tls: false };
    expect(validConfig(config)).toBe(true);
    for (const patch of [{ port: 0 }, { port: 65536 }, { keepAlive: 1 }, { port: 1.5 }, { host: "mqtt://localhost" }, { clientId: "" }, { password: "secret" }]) expect(validConfig({ ...config, ...patch })).toBe(false);
    expect(validConfig({ ...config, host: "::1", password: "secret", username: "user" })).toBe(true);
  });
  it("按 UTF-8 接收文本，无效编码显示十六进制而不破坏原始字节", () => {
    expect(decodePayload([...new TextEncoder().encode("你好")])).toEqual({ payload: "你好", binary: false });
    expect(decodePayload([255, 0, 128])).toEqual({ payload: "ff 00 80", binary: true });
    expect(decodePayload([])).toEqual({ payload: "", binary: false });
    expect(displayPayload('{"a":1}', true)).toBe('{\n  "a": 1\n}');
    expect(displayPayload("plain text", true)).toBe("plain text");
  });
  it("长期收消息时同时限制条数和字节，不修改已有数组", () => {
    const message = (id: number, bytes = 1): Message => ({ id, bytes, time: 0, direction: "received", topic: "test", payload: "x", qos: 0, retain: false, binary: false });
    let messages: Message[] = [];
    for (let i = 0; i < 205; i++) messages = appendMessage(messages, message(i));
    expect(messages).toHaveLength(200);
    expect(messages[0].id).toBe(5);
    const previous = [message(1, MAX_LOG_BYTES / 2), message(2, MAX_LOG_BYTES / 2)];
    expect(appendMessage(previous, message(3, 1)).map(m => m.id)).toEqual([2, 3]);
    expect(previous).toHaveLength(2);
  });
});
