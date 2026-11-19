import { expect, it } from "vitest";
import { cleanDraft, createDraft } from "./draft";

it("持久化时白名单读取，忽略旧密码、消息和损坏的预设", () => {
  const draft = cleanDraft({ config: { host: "localhost", port: 1883, clientId: "id", username: "", password: "secret", keepAlive: 60, tls: false, cleanSession: true }, topics: [{ topic: "a/#/b", qos: 0 }, { topic: "a/+", qos: 1 }, { topic: "a/+", qos: 2 }, null], payload: "", messages: ["secret"] });
  expect(draft?.topics).toEqual([{ topic: "a/+", qos: 2 }]);
  expect(JSON.stringify(draft)).not.toContain("secret"); expect(cleanDraft({ config: {} })).toBeNull();
});

it("旧连接补齐高级默认值，新配置持久化仍剔除密码和额外遗嘱字段", () => {
  const draft = createDraft();
  const old = { ...draft, config: { host: "localhost", port: 1883, clientId: "old", username: "", keepAlive: 60, cleanSession: true, tls: false } };
  expect(cleanDraft(old)?.config).toMatchObject({ protocolVersion: "3.1.1", connectTimeout: 10, autoReconnect: false, reconnectPeriod: 4000, willEnabled: false });
  Object.assign(draft.config, { protocolVersion: "5.0", connectTimeout: 20, autoReconnect: true, reconnectPeriod: 5000, willEnabled: true, willTopic: "device/status", willPayload: "offline", willQos: 1, willRetain: true, password: "secret", extra: "hidden" });
  const saved = cleanDraft(draft)!;
  expect(saved.config).toMatchObject({ protocolVersion: "5.0", connectTimeout: 20, reconnectPeriod: 5000, willTopic: "device/status", willPayload: "offline", willQos: 1 });
  expect(JSON.stringify(saved)).not.toContain("secret"); expect(JSON.stringify(saved)).not.toContain("hidden");
});

it("未提交的订阅主题不再进入持久化草稿，旧字段读取时自动忽略", () => {
  const saved = cleanDraft({ ...createDraft(), filterTopic: "temporary/topic" })!;
  expect(saved).not.toHaveProperty("filterTopic");
  expect(JSON.stringify(saved)).not.toContain("temporary/topic");
});


it("保存并恢复四种发送格式，兼容旧文本草稿，较长的编码字符串不被清空", () => {
  for (const mode of ["text", "json", "base64", "hex"] as const) {
    const payload = mode === "hex" ? "ff ".repeat(256 * 1024) : mode === "base64" ? "/w==" : "原有草稿";
    const restored = cleanDraft(JSON.parse(JSON.stringify({ ...createDraft(), mode, payload })))!;
    expect(restored.mode).toBe(mode);
    expect(restored.payload).toBe(payload);
  }
  expect(cleanDraft({ ...createDraft(), mode: undefined })?.mode).toBe("text");
  expect(cleanDraft({ ...createDraft(), mode: "unknown" })?.mode).toBe("text");
});


it("旧 TLS 配置迁移为对应协议，新 WebSocket 协议和 Path 独立持久化", () => {
  for (const tls of [false, true]) {
    const draft = createDraft();
    const config = { ...draft.config, tls, transport: undefined, path: undefined };
    expect(cleanDraft({ ...draft, config })?.config).toMatchObject({ transport: tls ? "mqtts" : "mqtt", tls, path: "/mqtt" });
  }
  for (const transport of ["mqtt", "mqtts", "ws", "wss"] as const) {
    const draft = createDraft();
    const restored = cleanDraft({ ...draft, config: { ...draft.config, transport, tls: false, path: "/custom/mqtt?token=test" } });
    expect(restored?.config).toMatchObject({ transport, tls: transport === "mqtts" || transport === "wss", path: "/custom/mqtt?token=test" });
  }
});
