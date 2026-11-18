// @vitest-environment jsdom
import { createApp, h } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { showError } from "@/utils/errorToast";
import { useMqtt } from "./useMqtt";
import type { MqttNotice } from "./mqtt";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(), isTauri: vi.fn(() => true), Channel: class { onmessage?: (event: MqttNotice) => void; },
}));
vi.mock("@/utils/errorToast", () => ({ showError: vi.fn() }));
vi.mock("@/composables/toolLibrary", () => ({ recordToolUsage: vi.fn() }));

let dispose: (() => void) | undefined;
beforeEach(() => { vi.clearAllMocks(); vi.mocked(isTauri).mockReturnValue(true); vi.mocked(invoke).mockResolvedValue(undefined); });
afterEach(() => { dispose?.(); dispose = undefined; vi.useRealTimers(); });
function mount() {
  let mqtt!: ReturnType<typeof useMqtt>;
  const root = document.createElement("div");
  const app = createApp({ setup() { mqtt = useMqtt(); return () => h("div"); } });
  app.mount(root);
  dispose = () => app.unmount();
  return mqtt;
}
function connection(index = 0) {
  return vi.mocked(invoke).mock.calls.filter(([command]) => command === "mqtt_connect")[index][1] as { id: string; events: { onmessage: (event: MqttNotice) => void } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

it("订阅和发布收到确认后才更新列表，按 UTF-8 发送", async () => {
  const mqtt = mount(); await mqtt.connect();
  const ack = deferred<unknown>();
  vi.mocked(invoke).mockReturnValueOnce(ack.promise);
  const subscribing = mqtt.subscribe("test/+", 2);
  expect(mqtt.subscriptions.value).toEqual([]);
  ack.resolve(1); expect(await subscribing).toBe(true);
  expect(mqtt.subscriptions.value).toEqual([{ topic: "test/+", qos: 1 }]);
  const sent = deferred<unknown>(); vi.mocked(invoke).mockReturnValueOnce(sent.promise);
  const publishing = mqtt.publish("test/demo", "你好", 1, true);
  expect(mqtt.messages.value).toEqual([]);
  expect(invoke).toHaveBeenLastCalledWith("mqtt_publish", expect.objectContaining({ payload: [...new TextEncoder().encode("你好")], qos: 1, retain: true }));
  sent.resolve(undefined); await publishing;
  expect(mqtt.messages.value[0]).toMatchObject({ payload: "你好", direction: "sent", bytes: 6 });
  await mqtt.unsubscribe("test/+"); expect(mqtt.subscriptions.value).toEqual([]);
});

it("服务器拒绝订阅或发送失败时不伪造成功记录", async () => {
  const mqtt = mount(); await mqtt.connect();
  vi.mocked(invoke).mockRejectedValueOnce("Broker rejected the subscription");
  expect(await mqtt.subscribe("test/#", 0)).toBe(false);
  expect(mqtt.subscriptions.value).toEqual([]); expect(showError).toHaveBeenCalled();
  vi.mocked(invoke).mockRejectedValueOnce("Connection closed"); await mqtt.publish("test/demo", "data", 1, false);
  expect(mqtt.messages.value).toEqual([]); expect(mqtt.busy.value).toBe(false);
});

it("接收保留和二进制消息，断线后禁用操作", async () => {
  const mqtt = mount(); await mqtt.connect(); const { events } = connection();
  events.onmessage({ kind: "message", topic: "test/demo", payload: [255, 128], qos: 2, retain: true });
  expect(mqtt.messages.value[0]).toMatchObject({ payload: "ff 80", binary: true, retain: true });
  events.onmessage({ kind: "closed", error: "Network disconnected" });
  expect(mqtt.connected.value).toBe(false); expect(showError).toHaveBeenCalledExactlyOnceWith("Network disconnected");
  const calls = vi.mocked(invoke).mock.calls.length; await mqtt.publish("test/demo", "", 0, false);
  expect(invoke).toHaveBeenCalledTimes(calls);
});

it("连接中取消后，迟到的连接结果和消息不会恢复旧会话", async () => {
  const mqtt = mount(); const wait = deferred<unknown>(); vi.mocked(invoke).mockReturnValueOnce(wait.promise);
  const connecting = mqtt.connect(); const old = connection();
  await mqtt.disconnect(); wait.resolve(undefined); await connecting;
  expect(mqtt.status.value).toBe("disconnected");
  await mqtt.connect();
  old.events.onmessage({ kind: "closed", error: "old error" });
  old.events.onmessage({ kind: "message", topic: "old", payload: [], qos: 0, retain: false });
  expect(mqtt.connected.value).toBe(true); expect(mqtt.messages.value).toEqual([]);
});

it("关闭工具会话时释放原生连接", async () => {
  const mqtt = mount(); await mqtt.connect(); const { id, events } = connection();
  dispose?.(); dispose = undefined;
  expect(invoke).toHaveBeenLastCalledWith("mqtt_disconnect", { id });
  events.onmessage({ kind: "message", topic: "test", payload: [1], qos: 0, retain: false });
  expect(mqtt.messages.value).toEqual([]);
});

it("浏览器预览不调用原生连接", async () => {
  vi.mocked(isTauri).mockReturnValue(false); const mqtt = mount(); await mqtt.connect();
  expect(mqtt.supported).toBe(false); expect(invoke).not.toHaveBeenCalled();
});

it("手动连接后恢复预设主题，断开后保留预设以便下次复用", async () => {
  const mqtt = mount(); mqtt.topics.value = [{ topic: "devices/+", qos: 1 }, { topic: "test/#", qos: 2 }];
  vi.mocked(invoke).mockImplementation(async command => command === "mqtt_subscribe" ? 1 : undefined);
  await mqtt.connect();
  expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual(["mqtt_connect", "mqtt_subscribe", "mqtt_subscribe"]);
  expect(mqtt.subscriptions.value).toEqual([{ topic: "devices/+", qos: 1 }, { topic: "test/#", qos: 1 }]);
  await mqtt.disconnect();
  expect(mqtt.subscriptions.value).toEqual([]);
  expect(mqtt.topics.value).toEqual([{ topic: "devices/+", qos: 1 }, { topic: "test/#", qos: 2 }]);
});

it("恢复订阅失败时保留预设，显示错误并继续恢复其余主题", async () => {
  const mqtt = mount(); mqtt.topics.value = [{ topic: "denied", qos: 0 }, { topic: "allowed", qos: 1 }];
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "mqtt_subscribe" && (args as { topic: string }).topic === "denied") throw "Denied";
    return command === "mqtt_subscribe" ? 1 : undefined;
  });
  await mqtt.connect();
  expect(mqtt.connected.value).toBe(true); expect(mqtt.busy.value).toBe(false);
  expect(mqtt.subscriptions.value).toEqual([{ topic: "allowed", qos: 1 }]);
  expect(mqtt.topics.value).toHaveLength(2); expect(showError).toHaveBeenCalledWith("Denied");
});

it("自动重连按间隔重试、恢复订阅，重复失败只提示一次", async () => {
  vi.useFakeTimers();
  const mqtt = mount(); mqtt.config.autoReconnect = true; mqtt.config.reconnectPeriod = 2000;
  mqtt.topics.value = [{ topic: "sensor/#", qos: 1 }];
  vi.mocked(invoke).mockImplementation(async command => command === "mqtt_subscribe" ? 1 : undefined);
  await mqtt.connect();
  connection().events.onmessage({ kind: "closed", error: "Network lost" });
  expect(mqtt.status.value).toBe("reconnecting");
  vi.mocked(invoke).mockRejectedValueOnce("Still offline");
  await vi.advanceTimersByTimeAsync(1999);
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "mqtt_connect")).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(mqtt.status.value).toBe("reconnecting");
  expect(showError).toHaveBeenCalledExactlyOnceWith("Network lost");
  await vi.advanceTimersByTimeAsync(2000);
  expect(mqtt.connected.value).toBe(true);
  expect(mqtt.subscriptions.value).toEqual([{ topic: "sensor/#", qos: 1 }]);
  expect(connection(2).id).not.toBe(connection().id);
  connection().events.onmessage({ kind: "closed", error: "Old event" });
  expect(mqtt.connected.value).toBe(true);
});

it.each(["disconnect", "dispose"])("等待重连时 %s 会取消定时器", async action => {
  vi.useFakeTimers();
  const mqtt = mount(); mqtt.config.autoReconnect = true;
  await mqtt.connect();
  connection().events.onmessage({ kind: "closed", error: "Offline" });
  if (action === "disconnect") { await mqtt.disconnect(); expect(mqtt.status.value).toBe("disconnected"); }
  else { dispose?.(); dispose = undefined; }
  await vi.advanceTimersByTimeAsync(12000);
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "mqtt_connect")).toHaveLength(1);
});

it("重连过程中手动断开，迟到结果不会恢复连接或再次重试", async () => {
  vi.useFakeTimers();
  const mqtt = mount(); mqtt.config.autoReconnect = true;
  await mqtt.connect();
  connection().events.onmessage({ kind: "closed", error: "Offline" });
  const wait = deferred<unknown>(); vi.mocked(invoke).mockReturnValueOnce(wait.promise);
  await vi.advanceTimersByTimeAsync(4000);
  expect(mqtt.status.value).toBe("connecting");
  await mqtt.disconnect();
  wait.resolve(undefined); await vi.advanceTimersByTimeAsync(10000);
  expect(mqtt.status.value).toBe("disconnected");
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "mqtt_connect")).toHaveLength(2);
});
