// @vitest-environment jsdom
import { createApp, nextTick } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { i18n } from "@/locales";
import { dismissToast, toasts } from "@/utils/errorToast";
import MqttWorkspace from "./MqttWorkspace.vue";
import { useMqttTree, type SessionNode } from "./workspace";
import { createDraft } from "./draft";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => false), Channel: class { onmessage?: (event: unknown) => void } }));
vi.mock("@/components/common/AppSelect.vue", () => ({ default: {
  props: ["modelValue", "options"], emits: ["update:modelValue"],
  template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
} }));
vi.mock("@/components/common/TextPane.vue", () => ({ default: {
  props: { modelValue: String, label: String, readonly: Boolean, hideHeader: Boolean }, emits: ["update:modelValue"],
  template: '<section><header v-if="!hideHeader"><span>{{ label }}</span><slot name="actions" /></header><textarea :aria-label="label" :readonly="readonly" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></section>',
} }));
let dispose: (() => void) | undefined;
const session = (id: string, name: string): SessionNode => ({ id, name, kind: "session", parentId: null, draft: createDraft() });
beforeEach(() => {
  for (const toast of [...toasts.value]) dismissToast(toast.id);
  localStorage.clear(); useMqttTree().value = { nodes: [session("s1", "默认会话")], activeId: "s1" };
  vi.clearAllMocks(); vi.mocked(isTauri).mockReturnValue(false); vi.mocked(invoke).mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { dispose?.(); dispose = undefined; for (const toast of [...toasts.value]) dismissToast(toast.id); });
function mount() {
  const root = document.createElement("div"); document.body.append(root);
  const app = createApp(MqttWorkspace).use(i18n); app.mount(root);
  dispose = () => { app.unmount(); root.remove(); };
  return root;
}
const button = (root: Element, text: string) => [...root.querySelectorAll("button")].find(b => b.textContent?.trim() === text)!;
const editor = (root: Element) => [...root.querySelectorAll<HTMLElement>("main > .mqtt")].find(el => el.style.display !== "none")!;
const field = (root: Element, text: string) => {
  const fields = editor(root).querySelector<HTMLElement>(".connection-fields");
  if (fields?.closest(".connection-details")?.getAttribute("aria-hidden") === "true") editor(root).querySelector<HTMLButtonElement>(".connection-toggle")!.click();
  return [...editor(root).querySelectorAll("label")].find(label => label.textContent?.startsWith(text))!.querySelector("input")!;
};
async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) { input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); await nextTick(); }
async function addPreset(root: Element) {
  editor(root).querySelector<HTMLButtonElement>(".subscription-add")!.click(); await nextTick();
  await type(editor(root).querySelector<HTMLInputElement>(".subscription-dialog input")!, "test/demo");
  editor(root).querySelector('.subscription-dialog form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await nextTick();
}

it("输入自动恢复，密码不写入存储且重新打开不自动连接", async () => {
  let root = mount();
  await type(field(root, "客户端 ID"), "mqtt.example.com"); await type(field(root, "用户名"), "user"); await type(field(root, "密码"), "private-password");
  await type(root.querySelector<HTMLTextAreaElement>(".publish-panel textarea")!, "draft payload");
  expect(localStorage.getItem("mqtt.workspace.v2")).not.toContain("private-password");
  dispose?.(); root = mount();
  expect(field(root, "客户端 ID").value).toBe("mqtt.example.com"); expect(field(root, "用户名").value).toBe("user"); expect(field(root, "密码").value).toBe("");
  expect(root.querySelector<HTMLTextAreaElement>(".publish-panel textarea")!.value).toBe("draft payload");
  expect(invoke).not.toHaveBeenCalled();
});

async function createConnection(root: Element, name: string) {
  await type(editor(root).querySelector<HTMLInputElement>(".connection-name input")!, name);
  button(editor(root), "连接").click(); await nextTick();
}

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
  await action(root, "添加连接"); await createConnection(root, "设备 A");
  const folder = useMqttTree().value.nodes.find(node => node.name === "实验室")!;
  expect(useMqttTree().value.nodes.find(node => node.name === "设备 A")?.parentId).toBe(folder.id);
  row(root, "实验室").querySelector<HTMLButtonElement>("button")!.click(); await nextTick();
  await vi.waitFor(() => expect(row(root, "设备 A")).toBeUndefined());
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
  const root = mount(); await type(field(root, "客户端 ID"), "first.example.com");
  await type(editor(root).querySelector<HTMLTextAreaElement>(".publish-panel textarea")!, "hello");
  row(root, "第二个会话").click(); await nextTick();
  expect(field(root, "客户端 ID").value).toBe((useMqttTree().value.nodes.find(node => node.id === "s2") as SessionNode).draft.config.clientId);
  await type(field(root, "客户端 ID"), "second.example.com");
  row(root, "默认会话").click(); await nextTick();
  expect(editor(root).querySelector<HTMLTextAreaElement>(".publish-panel textarea")!.value).toBe("hello");
  expect(field(root, "客户端 ID").value).toBe("first.example.com");
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


it("默认工作区常驻发送区，同页完成收发", async () => {
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
  expect(editor(root).querySelector<HTMLElement>(".publish-panel")!.style.display).not.toBe("none");
  await vi.waitFor(() => expect(editor(root).querySelector(".subscription-list")!.textContent).toContain("已订阅"));
  const sending = button(editor(root).querySelector(".publish-controls")!, "发送");
  await type(editor(root).querySelector<HTMLTextAreaElement>(".publish-panel textarea")!, "same-page test"); sending.click();
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("mqtt_publish", expect.anything()));
  await vi.waitFor(() => expect(editor(root).querySelector(".message-summary pre")?.textContent).toContain("same-page test"));
  const args = vi.mocked(invoke).mock.calls.find(([command]) => command === "mqtt_connect")![1] as { events: { onmessage: (event: unknown) => void } };
  args.events.onmessage({ kind: "message", topic: "test/demo", payload: [...new TextEncoder().encode("same-page test")], qos: 0, retain: false }); await nextTick();
  expect(editor(root).querySelectorAll(".message-log .message-summary")).toHaveLength(2);
  expect(editor(root).querySelector<HTMLTextAreaElement>(".publish-panel textarea")!.value).toBe("same-page test");
  expect(editor(root).querySelector(".subscription-list")!.textContent).toContain("已订阅");
});

it("收起连接参数时保留订阅、消息和发送区域，再展开时保持输入", async () => {
  const root = mount(); await type(field(root, "客户端 ID"), "mqtt.example.com");
  const toggle = editor(root).querySelector<HTMLButtonElement>(".connection-toggle")!;
  toggle.click(); await nextTick();
  expect(editor(root).querySelector(".connection-details")!.getAttribute("aria-hidden")).toBe("true");
  expect(editor(root).querySelector(".connection-details")!.hasAttribute("inert")).toBe(true);
  expect(editor(root).querySelector(".subscriptions")).not.toBeNull();
  expect(editor(root).querySelector(".message-log")).not.toBeNull();
  expect(editor(root).querySelector(".publish-panel textarea")).not.toBeNull();
  toggle.click(); await nextTick();
  expect(editor(root).querySelector(".connection-details")!.getAttribute("aria-hidden")).toBe("false");
  expect(editor(root).querySelector(".connection-details")!.hasAttribute("inert")).toBe(false);
  expect(field(root, "客户端 ID").value).toBe("mqtt.example.com");
});

it("新增订阅使用弹框，校验无效主题并允许取消", async () => {
  const root = mount();
  expect(editor(root).querySelector(".subscriptions form")).toBeNull();
  editor(root).querySelector<HTMLButtonElement>(".subscription-add")!.click(); await nextTick();
  const dialog = editor(root).querySelector<HTMLDialogElement>(".subscription-dialog")!;
  expect(dialog.hasAttribute("open")).toBe(true);
  await type(dialog.querySelector("input")!, "bad/#/topic");
  expect(dialog.querySelector<HTMLButtonElement>(".primary")!.disabled).toBe(true);
  expect(dialog.textContent).not.toContain("请输入有效的主题");
  expect(dialog.querySelector("input")!.getAttribute("aria-invalid")).toBe("true");
  button(dialog, "取消").click(); await nextTick();
  expect(dialog.hasAttribute("open")).toBe(false);
  expect(useMqttTree().value.nodes.find(node => node.id === "s1")).toMatchObject({ draft: { topics: [] } });
});

it("发送区精简标题和展开按钮，保留输入与发送参数", async () => {
  const root = mount();
  const panel = editor(root).querySelector(".publish-panel")!;
  expect(panel.querySelector(".payload header")).toBeNull();
  expect(panel.querySelector(".expand-send")).toBeNull();
  const content = Array.from({ length: 100 }, (_, i) => `message ${i}`).join("\n");
  await type(panel.querySelector<HTMLTextAreaElement>("textarea")!, content);
  const topic = panel.querySelector<HTMLInputElement>(".publish-topic")!;
  expect(topic.placeholder).toContain("Topic");
  await type(topic, "long/payload");
  const retain = panel.querySelector<HTMLInputElement>('.publish-controls input[type="checkbox"]')!;
  retain.checked = true; retain.dispatchEvent(new Event("change", { bubbles: true }));
  editor(root).querySelector<HTMLButtonElement>(".connection-toggle")!.click(); await nextTick();
  expect(panel.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(content);
  expect(topic.value).toBe("long/payload"); expect(retain.checked).toBe(true);
});

it("消息摘要选择详情，切换原始数据和 JSON，读取旧消息时不被新消息打断", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const root = mount(); button(editor(root), "连接").click();
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("mqtt_connect", expect.anything()));
  const args = vi.mocked(invoke).mock.calls.find(([command]) => command === "mqtt_connect")![1] as { events: { onmessage: (event: unknown) => void } };
  const receive = async (payload: string) => { args.events.onmessage({ kind: "message", topic: "data/test", payload: [...new TextEncoder().encode(payload)], qos: 1, retain: false }); await nextTick(); await nextTick(); };
  await receive('{"value":1}');
  expect(editor(root).querySelector(".message-summary pre")!.textContent).toBe('{\n  "value": 1\n}');
  editor(root).querySelector<HTMLButtonElement>(".message-summary")!.click(); await nextTick();
  button(editor(root), "原始数据").click(); await nextTick();
  expect(editor(root).querySelector<HTMLTextAreaElement>(".message-detail textarea")!.value).toBe('{"value":1}');
  await receive('{"value":2}');
  editor(root).querySelector<HTMLButtonElement>(".message-summary")!.click(); await nextTick();
  await receive('{"value":3}');
  expect(editor(root).querySelector<HTMLTextAreaElement>(".message-detail textarea")!.value).toBe('{"value":1}');
  expect(editor(root).querySelectorAll(".message-summary")).toHaveLength(3);
  editor(root).querySelector<HTMLButtonElement>('[aria-label="清空记录"]')!.click(); await nextTick();
  expect(editor(root).querySelectorAll(".message-summary")).toHaveLength(0);
  await vi.waitFor(() => expect(editor(root).querySelector(".message-detail textarea")).toBeNull());
});

it("订阅点击高亮并筛选，再次点击取消高亮并显示全部消息", async () => {
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
  expect(editor(root).querySelector(".all-subscriptions")).toBeNull();
  expect(editor(root).querySelector(".section-head")!.querySelectorAll("button")).toHaveLength(1);
  expect(editor(root).querySelectorAll(".subscription-filter.selected")).toHaveLength(1);
  expect(editor(root).querySelector('.subscription-filter.selected')!.getAttribute("aria-pressed")).toBe("true");
  await choose("other/data");
  expect(editor(root).querySelectorAll(".subscription-filter.selected")).toHaveLength(0);
  expect(editor(root).querySelectorAll(".message-summary")).toHaveLength(4);
});

it("订阅区支持键盘和拖拽调整宽度", async () => {
  const root = mount();
  const subscriptions = editor(root).querySelector<HTMLElement>('[aria-label="调整订阅区宽度"]')!;
  const initialSubscription = Number(subscriptions.getAttribute("aria-valuenow"));
  subscriptions.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await nextTick();
  expect(Number(subscriptions.getAttribute("aria-valuenow"))).toBe(initialSubscription + 10);
  Object.defineProperty(subscriptions.closest(".mqtt-split"), "clientWidth", { value: 800 });
  subscriptions.setPointerCapture = vi.fn(); subscriptions.hasPointerCapture = () => true; subscriptions.releasePointerCapture = vi.fn();
  const pointer = (type: string, x: number) => {
    const event = new MouseEvent(type, { clientX: x, button: 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: 2 }); subscriptions.dispatchEvent(event);
  };
  pointer("pointerdown", 180); pointer("pointermove", 250); pointer("pointerup", 250); await nextTick();
  expect(Number(subscriptions.getAttribute("aria-valuenow"))).toBe(initialSubscription + 80);
  pointer("pointerdown", 250); pointer("pointermove", -100); pointer("pointercancel", -100); await nextTick();
  expect(Number(subscriptions.getAttribute("aria-valuenow"))).toBe(initialSubscription + 80);
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
  expect([...document.querySelectorAll('[role="menuitem"]')].map(el => el.textContent?.trim())).toEqual(["新建文件夹", "添加连接"]);
  button(document.querySelector('[role="menu"]')!, "添加连接").click(); await nextTick(); await createConnection(root, "根会话");
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

it("添加连接先配置后创建，取消不保存，保留密码供首次连接使用", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const root = mount();
  expect(root.querySelector(".directory-head")!.textContent).toContain("连接");
  await action(root, "添加连接");
  expect(editor(root).classList.contains("creating")).toBe(true);
  expect(editor(root).querySelector(".workbench")).toBeNull();
  expect(useMqttTree().value.nodes).toHaveLength(1);
  await type(field(root, "服务器"), "new.example.com");
  button(editor(root), "取消").click(); await nextTick();
  expect(useMqttTree().value.nodes).toHaveLength(1);
  expect(editor(root).classList.contains("creating")).toBe(false);
  await action(root, "添加连接");
  await type(field(root, "用户名"), "tester");
  await type(field(root, "密码"), "temporary-secret");
  await type(field(root, "服务器"), "new.example.com");
  await type(editor(root).querySelector<HTMLInputElement>(".connection-name input")!, "   ");
  expect(button(editor(root), "连接").disabled).toBe(true);
  await createConnection(root, "传感器");
  expect(useMqttTree().value.nodes).toHaveLength(2);
  expect(editor(root).classList.contains("creating")).toBe(false);
  expect(editor(root).querySelector(".connection-toggle")!.textContent).toContain("传感器");
  expect(editor(root).querySelector<HTMLElement>(".publish-panel")!.style.display).not.toBe("none");
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("mqtt_connect", expect.objectContaining({ config: expect.objectContaining({ host: "new.example.com", password: "temporary-secret" }) })));
  expect(localStorage.getItem("mqtt.workspace.v2")).not.toContain("temporary-secret");
});

it.each(["mqtt_connect", "mqtt_subscribe", "mqtt_unsubscribe", "mqtt_publish", "mqtt_disconnect", "restore", "closed"])("MQTT 错误 %s 仅在顶部提示一次，页面不重复显示", async operation => {
  vi.mocked(isTauri).mockReturnValue(true);
  const error = `MQTT failure: ${operation}`;
  if (operation === "restore") (useMqttTree().value.nodes[0] as SessionNode).draft.topics = [{ topic: "test/demo", qos: 0 }];
  const root = mount();
  if (operation === "mqtt_connect") vi.mocked(invoke).mockRejectedValueOnce(error);
  if (operation === "restore") vi.mocked(invoke).mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
  button(editor(root), "连接").click();
  if (operation !== "mqtt_connect" && operation !== "restore") {
    await vi.waitFor(() => expect(editor(root).textContent).toContain("已连接"));
    if (operation === "closed") {
      const args = vi.mocked(invoke).mock.calls.find(([command]) => command === "mqtt_connect")![1] as { events: { onmessage: (event: unknown) => void } };
      args.events.onmessage({ kind: "closed", error });
    } else if (operation === "mqtt_subscribe") {
      vi.mocked(invoke).mockRejectedValueOnce(error);
      await addPreset(root);
    } else if (operation === "mqtt_unsubscribe") {
      vi.mocked(invoke).mockResolvedValueOnce(0);
      await addPreset(root);
      await vi.waitFor(() => expect(editor(root).querySelector(".subscription-list")!.textContent).toContain("已订阅"));
      vi.mocked(invoke).mockRejectedValueOnce(error);
      editor(root).querySelector<HTMLButtonElement>('[aria-label="移除主题"]')!.click();
    } else if (operation === "mqtt_publish") {
      vi.mocked(invoke).mockRejectedValueOnce(error);
      button(editor(root).querySelector(".publish-controls")!, "发送").click();
    } else {
      vi.mocked(invoke).mockRejectedValueOnce(error);
      button(editor(root), "断开").click();
    }
  }
  await vi.waitFor(() => expect(toasts.value.filter(toast => toast.message === error)).toHaveLength(1));
  expect(root.textContent).not.toContain(error);
});

it("连接命令和断线事件同时报告同一错误时，顶部合并为一条提示", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const error = "Connection refused";
  vi.mocked(invoke).mockImplementationOnce(async (_command, args) => {
    (args as { events: { onmessage: (event: unknown) => void } }).events.onmessage({ kind: "closed", error });
    throw error;
  });
  const root = mount(); button(editor(root), "连接").click();
  await vi.waitFor(() => expect(editor(root).textContent).toContain("未连接"));
  expect(toasts.value.filter(toast => toast.message === error)).toHaveLength(1);
  expect(root.textContent).not.toContain(error);
});

it("新建连接使用固定顶部连接操作，配置分段切换并将超时和遗嘱传到原生端", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const root = mount(); await action(root, "添加连接");
  const page = editor(root);
  expect(page.querySelector(".creation-heading .primary")!.textContent).toContain("连接");
  expect(page.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toContain("常规配置");
  const advanced = button(page, "高级配置");
  expect(advanced.getAttribute("aria-selected")).toBe("false");
  advanced.click(); await nextTick();
  await type(field(root, "连接超时"), "25");
  const auto = [...page.querySelectorAll(".config-row")].find(el => el.firstElementChild?.textContent === "自动重连")!.querySelector<HTMLInputElement>("input")!;
  auto.checked = true; auto.dispatchEvent(new Event("change", { bubbles: true })); await nextTick();
  await type(field(root, "重连间隔"), "6000");
  button(page, "遗嘱消息").click(); await nextTick();
  const enabled = [...page.querySelectorAll(".config-row")].find(el => el.firstElementChild?.textContent === "遗嘱消息")!.querySelector<HTMLInputElement>("input")!;
  enabled.checked = true; enabled.dispatchEvent(new Event("change", { bubbles: true })); await nextTick();
  await type(field(root, "遗嘱主题"), "device/status");
  await type(page.querySelector<HTMLTextAreaElement>(".will-fields textarea")!, "offline");
  await createConnection(root, "设备");
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("mqtt_connect", expect.objectContaining({ config: expect.objectContaining({ connectTimeout: 25, autoReconnect: true, reconnectPeriod: 6000, willEnabled: true, willTopic: "device/status", willPayload: "offline" }) })));
});

it("已有连接只显示六项紧凑配置，连接时锁定、断开后编辑并同步名称", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const root = mount();
  editor(root).querySelector<HTMLButtonElement>(".connection-toggle")!.click(); await nextTick();
  const summary = editor(root).querySelector(".compact-fields")!;
  expect(summary.querySelectorAll(":scope > label")).toHaveLength(6);
  expect([...summary.querySelectorAll(":scope > label > span:first-child")].map(el => el.textContent)).toEqual(["连接名称", "客户端 ID", "用户名", "密码", "保活间隔", "清除会话"]);
  expect(editor(root).querySelector(".config-section")).toBeNull();
  button(editor(root), "连接").click();
  await vi.waitFor(() => expect(editor(root).textContent).toContain("已连接"));
  for (const input of summary.querySelectorAll("input")) expect(input.matches(":disabled")).toBe(true);
  button(editor(root), "断开").click();
  await vi.waitFor(() => expect(editor(root).textContent).toContain("未连接"));
  for (const input of summary.querySelectorAll("input")) expect(input.matches(":disabled")).toBe(false);
  await type(summary.querySelector<HTMLInputElement>(".connection-name input")!, "新的连接名称");
  expect(row(root, "新的连接名称")).toBeDefined();
  expect(editor(root).querySelector(".connection-toggle")!.textContent).toContain("新的连接名称");
  expect(useMqttTree().value.nodes[0].name).toBe("新的连接名称");
});

it("新建连接的顶部独立于下方滚动表单", async () => {
  const root = mount(); await action(root, "添加连接");
  const header = editor(root).querySelector(".creation-heading")!;
  const scroll = editor(root).querySelector(".creation-scroll")!;
  expect(header.parentElement).toBe(scroll.parentElement);
  expect(scroll.contains(header)).toBe(false);
  expect(scroll.querySelector(".general-section")).not.toBeNull();
  expect(header.querySelector("p")).toBeNull();
  expect(header.querySelector(".primary")!.textContent).toContain("连接");
});

it("无效连接配置仅禁用连接操作，不在页面底部显示整段告警", async () => {
  const root = mount(); await action(root, "添加连接");
  await type(field(root, "服务器"), "");
  const page = editor(root);
  expect(button(page, "连接").disabled).toBe(true);
  expect(page.querySelector(".validation")).toBeNull();
  expect(page.textContent).not.toContain("请检查服务器");
  button(page, "高级配置").click(); await nextTick();
  await type(field(root, "连接超时"), "0");
  expect(button(page, "连接").disabled).toBe(true);
  expect(page.textContent).not.toContain("连接超时应为");
  expect(toasts.value).toHaveLength(0);
});

it("发送主题无效时不在编辑器底部显示告警，继续阻止发送", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const root = mount(); button(editor(root), "连接").click();
  await vi.waitFor(() => expect(editor(root).textContent).toContain("已连接"));
  await type(editor(root).querySelector<HTMLInputElement>(".publish-topic")!, "bad/#");
  expect(button(editor(root).querySelector(".publish-controls")!, "发送").disabled).toBe(true);
  expect(editor(root).querySelector(".publish-error")).toBeNull();
  expect(editor(root).textContent).not.toContain("发送主题不能为空");
});

it("新建连接名称为空，每次添加订阅从空主题开始", async () => {
  const root = mount(); await action(root, "添加连接");
  expect(editor(root).querySelector<HTMLInputElement>(".connection-name input")!.value).toBe("");
  expect(button(editor(root), "连接").disabled).toBe(true);
  await createConnection(root, "自定义连接");
  const open = async () => { editor(root).querySelector<HTMLButtonElement>(".subscription-add")!.click(); await nextTick(); await nextTick(); };
  await open();
  expect(editor(root).querySelector<HTMLInputElement>(".subscription-dialog input")!.value).toBe("");
  await type(editor(root).querySelector<HTMLInputElement>(".subscription-dialog input")!, "custom/topic");
  button(editor(root).querySelector(".subscription-dialog")!, "取消").click(); await nextTick();
  await open();
  expect(editor(root).querySelector<HTMLInputElement>(".subscription-dialog input")!.value).toBe("");
});

it("订阅弹窗保留内容直到关闭动画结束，切换连接会立即取消动画", async () => {
  const root = mount();
  useMqttTree().value.nodes.push(session("s2", "第二连接"));
  editor(root).querySelector<HTMLButtonElement>(".subscription-add")!.click(); await nextTick(); await nextTick();
  const dialog = editor(root).querySelector<HTMLDialogElement>(".subscription-dialog")!;
  await type(dialog.querySelector("input")!, "device/status");
  let finish!: () => void;
  const cancel = vi.fn();
  dialog.animate = vi.fn(() => ({ finished: new Promise<void>(resolve => { finish = resolve; }), cancel }) as unknown as Animation);
  button(dialog, "取消").click(); await nextTick();
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector<HTMLInputElement>("input")!.value).toBe("device/status");
  expect(dialog.querySelector("form")!.hasAttribute("inert")).toBe(true);
  finish(); await nextTick(); await nextTick();
  expect(dialog.open).toBe(false);
  editor(root).querySelector<HTMLButtonElement>(".subscription-add")!.click(); await nextTick(); await nextTick();
  button(dialog, "取消").click(); await nextTick();
  row(root, "第二连接").click(); await nextTick();
  expect(dialog.open).toBe(false);
  expect(cancel).toHaveBeenCalled();
});

it("已有主题订阅失败时保留弹窗和输入，不误判为成功", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  (useMqttTree().value.nodes[0] as SessionNode).draft.topics = [{ topic: "test/demo", qos: 0 }];
  vi.mocked(invoke).mockImplementation(async command => command === "mqtt_subscribe" ? 0 : undefined);
  const root = mount(); button(editor(root), "连接").click();
  await vi.waitFor(() => expect(editor(root).querySelector(".subscription-list")!.textContent).toContain("已订阅"));
  vi.mocked(invoke).mockRejectedValueOnce("Subscription denied");
  await addPreset(root);
  await vi.waitFor(() => expect(toasts.value.some(toast => toast.message === "Subscription denied")).toBe(true));
  const dialog = editor(root).querySelector<HTMLDialogElement>(".subscription-dialog")!;
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector<HTMLInputElement>("input")!.value).toBe("test/demo");
  expect((useMqttTree().value.nodes[0] as SessionNode).draft.topics).toEqual([{ topic: "test/demo", qos: 0 }]);
});

it("独立发送面板校验 JSON，修正后发送并保存编辑参数", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const root = mount(); button(editor(root), "连接").click();
  await vi.waitFor(() => expect(editor(root).textContent).toContain("已连接"));
  const panel = editor(root).querySelector(".publish-panel")!;
  const mode = panel.querySelector<HTMLSelectElement>(".mode-select")!;
  mode.value = "json"; mode.dispatchEvent(new Event("change", { bubbles: true })); await nextTick();
  await type(panel.querySelector<HTMLTextAreaElement>("textarea")!, "{");
  expect(button(panel, "发送").disabled).toBe(true);
  await type(panel.querySelector<HTMLTextAreaElement>("textarea")!, '{"value":1}');
  expect(button(panel, "发送").disabled).toBe(false);
  button(panel, "发送").click();
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("mqtt_publish", expect.objectContaining({ topic: "test/demo" })));
  expect((useMqttTree().value.nodes[0] as SessionNode).draft).toMatchObject({ mode: "json", payload: '{"value":1}' });
});

it("旧订阅确认迟到时，不关闭用户重新打开的输入面板", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const root = mount(); button(editor(root), "连接").click();
  await vi.waitFor(() => expect(editor(root).textContent).toContain("已连接"));
  let confirm!: (value: number) => void;
  vi.mocked(invoke).mockReturnValueOnce(new Promise<number>(resolve => { confirm = resolve; }));
  await addPreset(root);
  const dialog = editor(root).querySelector<HTMLDialogElement>(".subscription-dialog")!;
  button(dialog, "取消").click(); await nextTick();
  editor(root).querySelector<HTMLButtonElement>(".subscription-add")!.click(); await nextTick(); await nextTick();
  await type(dialog.querySelector<HTMLInputElement>("input")!, "next/topic");
  confirm(0);
  await vi.waitFor(() => expect(editor(root).querySelector(".subscription-list")!.textContent).toContain("已订阅"));
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector<HTMLInputElement>("input")!.value).toBe("next/topic");
});

it("三组配置通过分段面板切换，保留输入并支持键盘导航", async () => {
  const root = mount(); await action(root, "添加连接");
  const page = editor(root);
  const tabs = page.querySelector<HTMLElement>('[role="tablist"]')!;
  const selected = () => tabs.querySelector('[aria-selected="true"]')!;
  expect(tabs.querySelectorAll('[role="tab"]')).toHaveLength(3);
  expect(selected().textContent).toContain("常规配置");
  await type(page.querySelector<HTMLInputElement>(".connection-name input")!, "设备连接");
  const general = page.querySelector<HTMLElement>(".general-section")!;
  button(tabs, "高级配置").click(); await nextTick();
  expect(general.style.display).toBe("none");
  await type(field(root, "连接超时"), "30");
  button(tabs, "遗嘱消息").click(); await nextTick();
  expect(page.querySelectorAll('.config-section.current')).toHaveLength(1);
  tabs.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); await nextTick();
  expect(selected().textContent).toContain("高级配置");
  expect(field(root, "连接超时").value).toBe("30");
  tabs.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); await nextTick();
  expect(general.style.display).not.toBe("none");
  expect(page.querySelector<HTMLInputElement>(".connection-name input")!.value).toBe("设备连接");
  expect(general.getAttribute("aria-labelledby")).toBe(selected().id);
  expect(page.querySelector(".section-toggle")).toBeNull();
});
