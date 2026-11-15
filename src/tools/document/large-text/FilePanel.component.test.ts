// @vitest-environment jsdom
import { createApp, h, nextTick, type App } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import { createTextController } from "./controller";
import FilePanel from "./components/FilePanel.vue";
const largeText = createTextController();

const native = vi.hoisted(() => ({ invoke: vi.fn(), message: vi.fn(), restore: vi.fn(), releaseBoundary: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: native.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ message: native.message }));
vi.mock("@/components/common/AppSelect.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({
    props: ["modelValue", "options"], emits: ["update:modelValue"],
    setup: (props, { emit }) => () => h("select", {
      value: props.modelValue, onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLSelectElement).value),
    }, props.options.map((option: { value: string; label: string }) => h("option", { value: option.value }, option.label))),
  }) };
});
vi.mock("./components/ChunkEditor.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({
    props: ["text", "firstLine", "readonly"], emits: ["boundary"],
    setup: (props, { emit, expose }) => {
      expose({ snapshot: () => ({ position: 0, offset: 0, left: 0, anchor: 0, head: 0 }), restore: native.restore, releaseBoundary: native.releaseBoundary, remeasure: () => {} });
      return () => h("div", { "data-text": props.text }, [h("button", { "data-scroll-next": "", onClick: () => emit("boundary", "next") })]);
    },
  }) };
});
let app: App | undefined; let root: HTMLDivElement | undefined;
afterEach(async () => {
  app?.unmount(); root?.remove(); app = undefined;
  largeText.state.busy = false;
  if (largeText.state.id) await largeText.close(true);
  vi.clearAllMocks();
});
async function mount() {
  native.invoke.mockImplementation(async (command: string) => {
    if (command === "large_text_open") return {
      id: "test-session", info: { path: "C:\\large.txt", size: 10, encoding: "Utf8", newline: "LF", revision: 0, dirty: false, canUndo: false, canRedo: false, readonly: false, bom: 0 },
      block: { start: 0, end: 10, firstLine: 1, continuation: false, text: "original", revision: 0 },
    };
    return undefined;
  });
  await largeText.open("C:\\large.txt", "auto");
  root = document.createElement("div"); document.body.append(root);
  app = createApp({ render: () => h(FilePanel, { controller: largeText, active: true }) }).use(i18n); app.mount(root); await nextTick();
}
it("忙碌时取消按钮仍然向原生端发送取消请求", async () => {
  await mount();
  largeText.state.busy = true;
  largeText.state.status = { busy: true, kind: "search", done: 0, total: 10, indexed: 10, indexTotal: 10, indexComplete: true, lines: 1, indexError: null };
  await nextTick();
  const cancel = Array.from(root!.querySelectorAll("button")).find((button) => button.textContent?.includes("取消操作"));
  expect(cancel?.disabled).toBe(false); cancel!.click(); await nextTick();
  expect(native.invoke).toHaveBeenCalledWith("large_text_cancel", { id: "test-session" });
});
it("界面被缓存淘汰后仍保留当前文本块的草稿和原生会话", async () => {
  await mount(); largeText.changed("unsaved draft"); await nextTick();
  app!.unmount(); app = undefined;
  expect(largeText.dirty.value).toBe(true); expect(largeText.state.draft).toBe("unsaved draft");
  expect(native.invoke.mock.calls.some(([name]) => name === "large_text_close")).toBe(false);
  app = createApp({ render: () => h(FilePanel, { controller: largeText, active: true }) }).use(i18n); app.mount(root!); await nextTick();
  expect(root!.querySelector('[data-text="unsaved draft"]')).not.toBeNull();
});

it("编码下拉框切换后自动重新读取当前路径并更新选项", async () => {
  await mount();
  const select = root!.querySelector("select")!;
  select.value = "Gbk"; select.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => expect(largeText.state.encoding).toBe("Gbk")); await nextTick();
  expect(native.invoke).toHaveBeenCalledWith("large_text_open", { path: "C:\\large.txt", encoding: "Gbk" });
  expect(select.value).toBe("Gbk"); expect(select.disabled).toBe(false);
});
it("编码切换提示选择取消后下拉框恢复且草稿保留", async () => {
  await mount(); largeText.changed("未保存内容");
  native.message.mockResolvedValue("取消");
  const select = root!.querySelector("select")!;
  select.value = "Gbk"; select.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => expect(native.message).toHaveBeenCalled());
  await vi.waitFor(() => expect(select.disabled).toBe(false));
  expect(select.value).toBe("auto"); expect(largeText.state.draft).toBe("未保存内容");
  expect(native.invoke.mock.calls.filter(([name]) => name === "large_text_open")).toHaveLength(1);
});

it("编辑器滚动边界接入下一块并恢复原可见位置", async () => {
  await mount(); largeText.state.info!.size = 20;
  const real = native.invoke.getMockImplementation()!;
  native.invoke.mockImplementation(async (name: string, args: unknown) => name === "large_text_read" ? {
    start: 10, end: 20, text: "next", revision: 0, firstLine: 2, continuation: false,
  } : real(name, args));
  root!.querySelector<HTMLButtonElement>("[data-scroll-next]")!.click();
  await vi.waitFor(() => expect(root!.querySelector('[data-text="originalnext"]')).not.toBeNull());
  await vi.waitFor(() => expect(native.restore).toHaveBeenCalledWith({ position: 0, offset: 0, left: 0, anchor: 0, head: 0 }, 0));
  expect(native.invoke).toHaveBeenCalledWith("large_text_read", { id: "test-session", revision: 0, start: 10 });
});

it("查找与行号输入按需展开，快捷键聚焦，收起时保留输入和草稿", async () => {
  await mount(); largeText.changed("keep draft");
  const generation = largeText.state.generation;
  expect(root!.querySelector('[aria-label="查找文本"]')).toBeNull(); expect(root!.querySelector('[aria-label="行号"]')).toBeNull();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true })); await nextTick(); await nextTick();
  const query = root!.querySelector<HTMLInputElement>('[aria-label="查找文本"]')!;
  expect(document.activeElement).toBe(query);
  query.value = "needle"; query.dispatchEvent(new Event("input", { bubbles: true }));
  query.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await nextTick();
  expect(root!.querySelector('[aria-label="查找文本"]')).toBeNull(); expect(largeText.state.query).toBe("needle");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", ctrlKey: true, bubbles: true, cancelable: true })); await nextTick(); await nextTick();
  expect(document.activeElement).toBe(root!.querySelector('[aria-label="行号"]'));
  expect(largeText.state.draft).toBe("keep draft"); expect(largeText.state.generation).toBe(generation);
  largeText.state.searchVisible = false; largeText.state.jumpVisible = false;
});
