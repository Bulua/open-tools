// @vitest-environment jsdom
import { createApp, nextTick } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { i18n } from "@/locales";
import MqttClient from "./MqttWorkspace.vue";
import { cleanDraft, createDraft, useMqttTree, type SessionNode } from "./profiles";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => false), Channel: class { onmessage?: (event: unknown) => void } }));
vi.mock("@/components/common/AppSelect.vue", () => ({ default: {
  props: ["modelValue", "options"], emits: ["update:modelValue"],
  template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
} }));
vi.mock("@/components/common/TextPane.vue", () => ({ default: {
  props: ["modelValue", "label", "readonly"], emits: ["update:modelValue"],
  template: '<section><header><span>{{ label }}</span><slot name="actions" /></header><textarea :aria-label="label" :readonly="readonly" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></section>',
} }));
let dispose: (() => void) | undefined;
const session = (id: string, name: string): SessionNode => ({ id, name, kind: "session", parentId: null, draft: createDraft() });
beforeEach(() => {
  localStorage.clear(); useMqttTree().value = { nodes: [session("s1", "默认会话")], activeId: "s1" };
  vi.clearAllMocks(); vi.mocked(isTauri).mockReturnValue(false); vi.mocked(invoke).mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { dispose?.(); dispose = undefined; });
function mount() {
  const root = document.createElement("div"); document.body.append(root);
  const app = createApp(MqttClient).use(i18n); app.mount(root);
  dispose = () => { app.unmount(); root.remove(); };
  return root;
}
const button = (root: Element, text: string) => [...root.querySelectorAll("button")].find(b => b.textContent?.trim() === text)!;
const editor = (root: Element) => [...root.querySelectorAll<HTMLElement>("main > .mqtt")].find(el => el.style.display !== "none")!;
const field = (root: Element, text: string) => [...editor(root).querySelectorAll("label")].find(label => label.textContent?.startsWith(text))!.querySelector("input")!;
async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) { input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); await nextTick(); }
async function addPreset(root: Element) {
  editor(root).querySelector<HTMLButtonElement>(".subscription-add")!.click(); await nextTick();
  editor(root).querySelector('.subscription-dialog form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await nextTick();
}

async function openSend(root: Element) {
  if (editor(root).querySelector<HTMLElement>(".publish-panel")!.style.display === "none") {
    button(editor(root), "发送消息").click(); await nextTick();
  }
}
async function backToMessages(root: Element) {
  editor(root).querySelector<HTMLButtonElement>('[aria-label="返回消息"]')!.click(); await nextTick();
}

it("输入自动恢复，密码不写入存储且重新打开不自动连接", async () => {
  let root = mount();
  await type(field(root, "服务器"), "mqtt.example.com"); await type(field(root, "用户名"), "user"); await type(field(root, "密码"), "private-password");
  await openSend(root); await type(root.querySelector<HTMLTextAreaElement>(".publish-panel textarea")!, "draft payload");
  expect(localStorage.getItem("mqtt.workspace.v2")).not.toContain("private-password");
  dispose?.(); root = mount();
  expect(field(root, "服务器").value).toBe("mqtt.example.com"); expect(field(root, "用户名").value).toBe("user"); expect(field(root, "密码").value).toBe("");
  await openSend(root); expect(root.querySelector<HTMLTextAreaElement>(".publish-panel textarea")!.value).toBe("draft payload");
  expect(invoke).not.toHaveBeenCalled();
});

const row = (root: Element, name: string) => [...root.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(el => el.querySelector(".node-name")?.textContent === name)!;
async function context(target: Element) {
  target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100, clientY: 120 }));
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());
  await nextTick();
}
const action = async (root: Element, label: string) => {
  const direct = root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (direct) direct.click();
  else {
    await context(root.querySelector('[role="treeitem"][aria-selected="true"]')!);
    button(document.querySelector('[role="menu"]')!, label).click();
  }
  await nextTick();
};
async function rename(root: Element, name: string) {
  const input = root.querySelector<HTMLInputElement>('[aria-label="名称"]')!;
  await type(input, name); input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await nextTick();
}

it("新建文件夹和会话、重命名、折叠和递归删除", async () => {
  const root = mount();
  await action(root, "新建文件夹"); await rename(root, "实验室");
  await action(root, "新建会话"); await rename(root, "设备 A");
  const folder = useMqttTree().value.nodes.find(node => node.name === "实验室")!;
  expect(useMqttTree().value.nodes.find(node => node.name === "设备 A")?.parentId).toBe(folder.id);
  row(root, "实验室").querySelector<HTMLButtonElement>("button")!.click(); await nextTick();
  expect(row(root, "设备 A")).toBeUndefined();
  row(root, "实验室").querySelector<HTMLButtonElement>("button")!.click(); await nextTick();
  row(root, "设备 A").click(); await nextTick();
  await addPreset(root);
  expect(editor(root).textContent).toContain("待订阅");
  row(root, "实验室").click(); await nextTick(); await action(root, "删除");
  expect(root.querySelector('dialog[aria-label="删除"]')?.hasAttribute("open")).toBe(true);
  root.querySelector('dialog[aria-label="删除"] form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await nextTick();
  expect(useMqttTree().value.nodes.map(node => node.name)).toEqual(["默认会话"]);
  expect(invoke).not.toHaveBeenCalled();
});

it("切换会话保留各自的输入，单页布局没有冗余说明", async () => {
  useMqttTree().value.nodes.push(session("s2", "第二个会话"));
  const root = mount(); await type(field(root, "服务器"), "first.example.com");
  await openSend(root); await type(editor(root).querySelector<HTMLTextAreaElement>(".publish-panel textarea")!, "hello");
  row(root, "第二个会话").click(); await nextTick();
  expect(field(root, "服务器").value).toBe("127.0.0.1");
  await type(field(root, "服务器"), "second.example.com");
  row(root, "默认会话").click(); await nextTick();
  expect(editor(root).querySelector<HTMLTextAreaElement>(".publish-panel textarea")!.value).toBe("hello");
  expect(field(root, "服务器").value).toBe("first.example.com");
  expect(editor(root).textContent).not.toMatch(/每个标签|自动记住|密码不保存|TCP \/ TLS 连接需要/);
});

it("切换会话不释放连接，删除会话才断开并清除相应工作区", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  useMqttTree().value.nodes.push(session("s2", "第二个会话"));
  const root = mount(); button(editor(root), "连接").click();
  await vi.waitFor(() => expect(editor(root).textContent).toContain("已连接"));
  const args = vi.mocked(invoke).mock.calls.find(([command]) => command === "mqtt_connect")![1] as { id: string; events: { onmessage: (event: unknown) => void } };
  row(root, "第二个会话").click(); await nextTick();
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "mqtt_disconnect")).toHaveLength(0);
  args.events.onmessage({ kind: "message", topic: "test", payload: [65], qos: 0, retain: false }); await nextTick();
  row(root, "默认会话").click(); await nextTick(); expect(editor(root).textContent).toContain("test");
  await action(root, "删除");
  expect(invoke).toHaveBeenCalledWith("mqtt_disconnect", { id: args.id });
  expect(useMqttTree().value.activeId).toBe("s2");
});

it("拖拽支持加入文件夹、调整同级顺序和移回根目录", async () => {
  useMqttTree().value.nodes.push({ id: "f", name: "文件夹", kind: "folder", parentId: null, collapsed: false }, session("s2", "第二个会话"));
  const root = mount();
  function drag(source: HTMLElement, target: HTMLElement, y: number) {
    source.dispatchEvent(new Event("dragstart", { bubbles: true }));
    target.getBoundingClientRect = () => ({ top: 0, height: 40 }) as DOMRect;
    const over = new Event("dragover", { bubbles: true, cancelable: true }); Object.defineProperty(over, "clientY", { value: y }); target.dispatchEvent(over);
    target.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
  }
  drag(row(root, "默认会话"), row(root, "文件夹"), 20); await nextTick();
  expect(useMqttTree().value.nodes.find(node => node.id === "s1")?.parentId).toBe("f");
  drag(row(root, "第二个会话"), row(root, "文件夹"), 2); await nextTick();
  expect(useMqttTree().value.nodes.filter(node => node.parentId === null).map(node => node.id)).toEqual(["s2", "f"]);
  drag(row(root, "默认会话"), root.querySelector<HTMLElement>(".directory-tree")!, 20); await nextTick();
  expect(useMqttTree().value.nodes.find(node => node.id === "s1")?.parentId).toBeNull();
});

it("持久化时白名单读取，忽略旧密码、消息和损坏的预设", () => {
  const draft = cleanDraft({ config: { host: "localhost", port: 1883, clientId: "id", username: "", password: "secret", keepAlive: 60, tls: false, cleanSession: true }, topics: [{ topic: "a/#/b", qos: 0 }, { topic: "a/+", qos: 1 }, { topic: "a/+", qos: 2 }, null], payload: "", messages: ["secret"] });
  expect(draft?.topics).toEqual([{ topic: "a/+", qos: 2 }]);
  expect(JSON.stringify(draft)).not.toContain("secret"); expect(cleanDraft({ config: {} })).toBeNull();
});

it("默认界面不固定显示发送区，切换发送面板后完成收发", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockImplementation(async command => command === "mqtt_subscribe" ? 0 : undefined);
  const root = mount();
  expect(editor(root).querySelector('[role="tablist"]')).toBeNull();
  expect(editor(root).querySelector(".connection-fields")).not.toBeNull();
  expect(editor(root).querySelector(".subscriptions")).not.toBeNull();
  expect(editor(root).querySelector(".message-log")).not.toBeNull();
  expect(editor(root).querySelector(".publish-panel textarea")).not.toBeNull();
  await addPreset(root);
  button(editor(root), "连接").click();
  await vi.waitFor(() => expect(editor(root).querySelector(".message-log")).not.toBeNull());
  expect(editor(root).querySelector('[role="tabpanel"]')).toBeNull();
  expect(editor(root).querySelector(".publish-panel textarea")).not.toBeNull();
  expect(editor(root).querySelector<HTMLElement>(".publish-panel")!.style.display).toBe("none");
  await openSend(root);
  const sending = button(editor(root).querySelector(".publish-controls")!, "发送");
  await type(editor(root).querySelector<HTMLTextAreaElement>(".publish-panel textarea")!, "same-page test"); sending.click();
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("mqtt_publish", expect.anything()));
  await backToMessages(root);
  await vi.waitFor(() => expect(editor(root).querySelector<HTMLTextAreaElement>(".message-detail textarea")?.value).toContain("same-page test"));
  const args = vi.mocked(invoke).mock.calls.find(([command]) => command === "mqtt_connect")![1] as { events: { onmessage: (event: unknown) => void } };
  args.events.onmessage({ kind: "message", topic: "test/demo", payload: [...new TextEncoder().encode("same-page test")], qos: 0, retain: false }); await nextTick();
  expect(editor(root).querySelectorAll(".message-log .message-summary")).toHaveLength(2);
  expect(editor(root).querySelector<HTMLTextAreaElement>(".publish-panel textarea")!.value).toBe("same-page test");
  expect(editor(root).querySelector(".subscription-list")!.textContent).toContain("已订阅");
});

it("收起连接参数时保留订阅、消息和发送区域，再展开时保持输入", async () => {
  const root = mount(); await type(field(root, "服务器"), "mqtt.example.com");
  const toggle = editor(root).querySelector<HTMLButtonElement>(".connection-toggle")!;
  toggle.click(); await nextTick();
  expect(editor(root).querySelector<HTMLElement>(".connection-fields")!.style.display).toBe("none");
  expect(editor(root).querySelector(".subscriptions")).not.toBeNull();
  expect(editor(root).querySelector(".message-log")).not.toBeNull();
  expect(editor(root).querySelector(".publish-panel textarea")).not.toBeNull();
  toggle.click(); await nextTick(); expect(field(root, "服务器").value).toBe("mqtt.example.com");
});

it("新增订阅使用弹框，校验无效主题并允许取消", async () => {
  const root = mount();
  expect(editor(root).querySelector(".subscriptions form")).toBeNull();
  editor(root).querySelector<HTMLButtonElement>(".subscription-add")!.click(); await nextTick();
  const dialog = editor(root).querySelector<HTMLDialogElement>(".subscription-dialog")!;
  expect(dialog.hasAttribute("open")).toBe(true);
  await type(dialog.querySelector("input")!, "bad/#/topic");
  expect(dialog.querySelector<HTMLButtonElement>(".primary")!.disabled).toBe(true);
  expect(dialog.textContent).toContain("请输入有效的主题");
  button(dialog, "取消").click(); await nextTick();
  expect(dialog.hasAttribute("open")).toBe(false);
  expect(useMqttTree().value.nodes.find(node => node.id === "s1")).toMatchObject({ draft: { topics: [] } });
});

it("发送大编辑界面与消息界面切换时保留长文本和发送参数", async () => {
  const root = mount();
  const content = Array.from({ length: 100 }, (_, i) => `message ${i}`).join("\n");
  await openSend(root);
  await type(editor(root).querySelector<HTMLTextAreaElement>(".publish-panel textarea")!, content);
  const topic = editor(root).querySelector<HTMLInputElement>(".publish-topic")!;
  await type(topic, "long/payload");
  const retain = editor(root).querySelector<HTMLInputElement>('.publish-controls input[type="checkbox"]')!;
  retain.checked = true; retain.dispatchEvent(new Event("change", { bubbles: true }));
  await backToMessages(root);
  expect(editor(root).querySelector<HTMLElement>(".publish-panel")!.style.display).toBe("none");
  await openSend(root);
  expect(editor(root).classList.contains("send-expanded")).toBe(true);
  expect(editor(root).querySelector<HTMLElement>(".connection")!.style.display).toBe("none");
  expect(editor(root).querySelector<HTMLTextAreaElement>(".publish-panel textarea")!.value).toBe(content);
  editor(root).querySelector<HTMLButtonElement>('[aria-label="返回消息"]')!.click(); await nextTick();
  expect(editor(root).classList.contains("send-expanded")).toBe(false);
  expect(topic.value).toBe("long/payload"); expect(retain.checked).toBe(true);
  expect(editor(root).querySelector<HTMLTextAreaElement>(".publish-panel textarea")!.value).toBe(content);
});

it("消息摘要选择详情，切换原始数据和 JSON，读取旧消息时不被新消息打断", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const root = mount(); button(editor(root), "连接").click();
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("mqtt_connect", expect.anything()));
  const args = vi.mocked(invoke).mock.calls.find(([command]) => command === "mqtt_connect")![1] as { events: { onmessage: (event: unknown) => void } };
  const receive = async (payload: string) => { args.events.onmessage({ kind: "message", topic: "data/test", payload: [...new TextEncoder().encode(payload)], qos: 1, retain: false }); await nextTick(); await nextTick(); };
  await receive('{"value":1}');
  expect(editor(root).querySelector<HTMLTextAreaElement>(".message-detail textarea")!.value).toBe('{\n  "value": 1\n}');
  button(editor(root), "原始数据").click(); await nextTick();
  expect(editor(root).querySelector<HTMLTextAreaElement>(".message-detail textarea")!.value).toBe('{"value":1}');
  await receive('{"value":2}');
  editor(root).querySelector<HTMLButtonElement>(".message-summary")!.click(); await nextTick();
  await receive('{"value":3}');
  expect(editor(root).querySelector<HTMLTextAreaElement>(".message-detail textarea")!.value).toBe('{"value":1}');
  expect(editor(root).querySelectorAll(".message-summary")).toHaveLength(3);
  editor(root).querySelector<HTMLButtonElement>('[aria-label="清空记录"]')!.click(); await nextTick();
  expect(editor(root).querySelectorAll(".message-summary")).toHaveLength(0);
  expect(editor(root).querySelector(".message-detail textarea")).toBeNull();
});

it("点击不同订阅筛选匹配消息，切回全部不会丢失记录", async () => {
  const node = useMqttTree().value.nodes.find(node => node.id === "s1") as SessionNode;
  node.draft.topics = [{ topic: "room/+/temperature", qos: 0 }, { topic: "room/#", qos: 0 }, { topic: "other/data", qos: 0 }];
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockImplementation(async command => command === "mqtt_subscribe" ? 0 : undefined);
  const root = mount(); button(editor(root), "连接").click();
  await vi.waitFor(() => expect(editor(root).querySelector(".subscription-list")!.textContent).toContain("已订阅"));
  const args = vi.mocked(invoke).mock.calls.find(([command]) => command === "mqtt_connect")![1] as { events: { onmessage: (event: unknown) => void } };
  for (const topic of ["room/a/temperature", "room/b/temperature", "room/a/humidity", "other/data"]) args.events.onmessage({ kind: "message", topic, payload: [65], qos: 0, retain: false });
  await nextTick(); await nextTick();
  expect(editor(root).querySelectorAll(".message-summary")).toHaveLength(4);
  const choose = async (topic: string) => {
    [...editor(root).querySelectorAll<HTMLButtonElement>(".subscription-filter")].find(el => el.querySelector("code")?.textContent === topic)!.click(); await nextTick(); await nextTick();
  };
  await choose("room/+/temperature"); expect(editor(root).querySelectorAll(".message-summary")).toHaveLength(2);
  await choose("room/#"); expect(editor(root).querySelectorAll(".message-summary")).toHaveLength(3);
  await choose("other/data"); expect(editor(root).querySelectorAll(".message-summary")).toHaveLength(1);
  expect(editor(root).querySelector(".message-summary code")!.textContent).toBe("other/data");
  button(editor(root), "全部订阅").click(); await nextTick(); await nextTick();
  expect(editor(root).querySelectorAll(".message-summary")).toHaveLength(4);
});

it("订阅区和消息摘要分别支持宽度调整", async () => {
  const root = mount();
  const subscriptions = editor(root).querySelector<HTMLElement>('[aria-label="调整订阅区宽度"]')!;
  const summaries = editor(root).querySelector<HTMLElement>('[aria-label="调整消息摘要宽度"]')!;
  const initialSummary = summaries.getAttribute("aria-valuenow");
  const initialSubscription = Number(subscriptions.getAttribute("aria-valuenow"));
  subscriptions.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await nextTick();
  expect(Number(subscriptions.getAttribute("aria-valuenow"))).toBe(initialSubscription + 10);
  expect(summaries.getAttribute("aria-valuenow")).toBe(initialSummary);
  Object.defineProperty(subscriptions.closest(".mqtt-split"), "clientWidth", { value: 800 });
  subscriptions.setPointerCapture = vi.fn(); subscriptions.hasPointerCapture = () => true; subscriptions.releasePointerCapture = vi.fn();
  const pointer = (type: string, x: number) => {
    const event = new MouseEvent(type, { clientX: x, button: 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: 2 }); subscriptions.dispatchEvent(event);
  };
  pointer("pointerdown", 180); pointer("pointermove", 250); pointer("pointerup", 250); await nextTick();
  expect(Number(subscriptions.getAttribute("aria-valuenow"))).toBe(250);
  pointer("pointerdown", 250); pointer("pointermove", -100); pointer("pointercancel", -100); await nextTick();
  expect(Number(subscriptions.getAttribute("aria-valuenow"))).toBe(250);
});

it("右键操作命中目标会话，顶部只保留两个新建按钮", async () => {
  useMqttTree().value.nodes.push(session("s2", "第二个会话"));
  const root = mount();
  expect(root.querySelectorAll(".directory-head button")).toHaveLength(2);
  expect(root.querySelector(".directory-actions")).toBeNull();
  await context(row(root, "第二个会话"));
  expect([...document.querySelectorAll('[role="menuitem"]')].map(el => el.textContent?.trim())).toEqual(["重命名", "删除"]);
  expect(root.querySelector('dialog[aria-label="移动到"]')).toBeNull();
  expect(useMqttTree().value.activeId).toBe("s1");
  button(document.querySelector('[role="menu"]')!, "重命名").click(); await nextTick(); await rename(root, "测试会话");
  expect(useMqttTree().value.nodes.find(node => node.id === "s2")?.name).toBe("测试会话");
  await context(row(root, "测试会话"));
  button(document.querySelector('[role="menu"]')!, "删除").click(); await nextTick();
  expect(useMqttTree().value.nodes.map(node => node.id)).toEqual(["s1"]);
});

it("目录空白处右键新建到根目录，菜单支持 Escape 和点击外部关闭", async () => {
  const root = mount(); await action(root, "新建文件夹"); await rename(root, "已选文件夹");
  await context(root.querySelector(".directory-tree")!);
  expect([...document.querySelectorAll('[role="menuitem"]')].map(el => el.textContent?.trim())).toEqual(["新建文件夹", "新建会话"]);
  button(document.querySelector('[role="menu"]')!, "新建会话").click(); await nextTick(); await rename(root, "根会话");
  expect(useMqttTree().value.nodes.find(node => node.name === "根会话")?.parentId).toBeNull();
  await context(row(root, "根会话"));
  document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await nextTick();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await context(row(root, "根会话"));
  document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); await nextTick();
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("拖拽分隔线调整宽度，取消恢复原宽度，并记住最终宽度", async () => {
  let root = mount();
  Object.defineProperty(root.querySelector(".mqtt-workspace"), "clientWidth", { value: 1000 });
  const separator = root.querySelector<HTMLElement>('[role="separator"]')!;
  separator.setPointerCapture = vi.fn(); separator.hasPointerCapture = () => true; separator.releasePointerCapture = vi.fn();
  const pointer = (type: string, x: number) => {
    const event = new MouseEvent(type, { clientX: x, button: 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: 1 }); separator.dispatchEvent(event);
  };
  pointer("pointerdown", 280); pointer("pointermove", 440); pointer("pointerup", 440); await nextTick();
  expect(root.querySelector<HTMLElement>(".directory")!.style.flexBasis).toBe("440px");
  pointer("pointerdown", 440); pointer("pointermove", 50); pointer("pointercancel", 50); await nextTick();
  expect(root.querySelector<HTMLElement>(".directory")!.style.flexBasis).toBe("440px");
  dispose?.(); root = mount();
  expect(root.querySelector<HTMLElement>(".directory")!.style.flexBasis).toBe("440px");
  const restored = root.querySelector<HTMLElement>('[role="separator"]')!;
  restored.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await nextTick();
  expect(root.querySelector<HTMLElement>(".directory")!.style.flexBasis).toBe("450px");
  restored.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await nextTick();
  expect(root.querySelector<HTMLElement>(".directory")!.style.flexBasis).toBe("280px");
});
