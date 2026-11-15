// @vitest-environment jsdom
import { createApp, nextTick, type App } from "vue";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import { i18n } from "@/locales";
import { textWorkspace } from "./workspace";
import LargeTextEditor from "./LargeTextEditor.vue";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: native.invoke }));
// jsdom 不进行文本排版，为 CodeMirror 的几何读取提供空矩形。
beforeAll(() => {
  Object.defineProperties(Range.prototype, {
    getClientRects: { configurable: true, value: () => [] },
    getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
  });
});
let app: App | undefined;
let root: HTMLDivElement | undefined;
afterEach(async () => {
  app?.unmount(); root?.remove(); app = undefined;
  for (const tab of [...textWorkspace.tabs]) { await tab.controller.close(true); textWorkspace.remove(tab.controller); }
  vi.clearAllMocks();
});
async function mount() {
  let id = 1;
  native.invoke.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === "large_text_open") return {
      id: `file-${id++}`,
      info: { path: String(args.path), size: 12, encoding: args.encoding === "Gbk" ? "Gbk" : "Utf8", newline: "LF", revision: 0, dirty: false, canUndo: false, canRedo: false, readonly: false, bom: 0 },
      block: { start: 0, end: 12, firstLine: 1, continuation: false, text: "one\ntwo\ntext", revision: 0 },
    };
  });
  root = document.createElement("div"); document.body.append(root);
  app = createApp(LargeTextEditor).use(i18n); app.mount(root); await nextTick();
}
it("多个标签各自保留编码、查找词、滚动位置、选区与撤销历史", async () => {
  await mount();
  const a = await textWorkspace.open("C:\\a.txt", "Utf8"); await nextTick();
  const panelA = root!.querySelector<HTMLElement>(`#text-panel-${a.key}`)!;
  const viewA = EditorView.findFromDOM(panelA.querySelector<HTMLElement>(".cm-content")!)!;
  viewA.dispatch({ changes: { from: 0, to: 3, insert: "AAA" }, selection: { anchor: 4 } });
  a.controller.state.query = "needle A"; a.controller.state.lineInput = "100";
  viewA.scrollDOM.scrollTop = 42;
  const b = await textWorkspace.open("C:\\b.txt", "Gbk"); await nextTick();
  const panelB = root!.querySelector<HTMLElement>(`#text-panel-${b.key}`)!;
  const viewB = EditorView.findFromDOM(panelB.querySelector<HTMLElement>(".cm-content")!)!;
  viewB.dispatch({ changes: { from: 0, to: 3, insert: "BBB" } });
  b.controller.state.query = "needle B";
  expect(root!.querySelectorAll('[role="tab"]')).toHaveLength(2);
  expect(panelA.style.display).toBe("none"); expect(panelB.style.display).not.toBe("none");
  root!.querySelector<HTMLButtonElement>(`#text-tab-${a.key}`)!.click(); await nextTick();
  expect(panelA.style.display).not.toBe("none"); expect(panelB.style.display).toBe("none");
  expect(EditorView.findFromDOM(panelA.querySelector<HTMLElement>(".cm-content")!)).toBe(viewA);
  expect(viewA.scrollDOM.scrollTop).toBe(42); expect(viewA.state.selection.main.head).toBe(4);
  expect(a.controller.state.encoding).toBe("Utf8"); expect(b.controller.state.encoding).toBe("Gbk");
  expect(a.controller.state.query).toBe("needle A"); expect(b.controller.state.query).toBe("needle B");
  expect(undo(viewA)).toBe(true); expect(a.controller.state.draft).toBe("one\ntwo\ntext"); expect(b.controller.state.draft).toBe("BBB\ntwo\ntext");
  expect(native.invoke.mock.calls.some(([name]) => name === "large_text_close")).toBe(false);
});
it("隐藏标签不处理全局保存快捷键，Ctrl+S 只保存当前文件", async () => {
  await mount();
  const a = await textWorkspace.open("C:\\a.txt", "Utf8"); const b = await textWorkspace.open("C:\\b.txt", "Gbk"); await nextTick();
  const saveA = vi.spyOn(a.controller, "save").mockResolvedValue(); const saveB = vi.spyOn(b.controller, "save").mockResolvedValue();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(saveB).toHaveBeenCalledOnce()); expect(saveA).not.toHaveBeenCalled();
});

it("整个工具页面重新挂载后，各标签草稿、设置和本地撤销仍独立保留", async () => {
  await mount();
  const a = await textWorkspace.open("C:\\a.txt", "Utf8"); const b = await textWorkspace.open("C:\\b.txt", "Gbk"); await nextTick();
  const view = EditorView.findFromDOM(root!.querySelector<HTMLElement>(`#text-panel-${a.key} .cm-content`)!)!;
  view.dispatch({ changes: { from: 0, to: 3, insert: "AAA" } });
  a.controller.state.query = "needle A"; b.controller.state.query = "needle B";
  app!.unmount(); app = undefined;
  expect(a.controller.editorCache.value).toBeDefined();
  app = createApp(LargeTextEditor).use(i18n); app.mount(root!); await nextTick();
  textWorkspace.activate(a); await nextTick();
  const restored = EditorView.findFromDOM(root!.querySelector<HTMLElement>(`#text-panel-${a.key} .cm-content`)!)!;
  expect(restored.state.doc.toString()).toBe("AAA\ntwo\ntext");
  expect(a.controller.state.query).toBe("needle A"); expect(b.controller.state.query).toBe("needle B"); expect(b.controller.state.encoding).toBe("Gbk");
  expect(undo(restored)).toBe(true); expect(a.controller.state.draft).toBe("one\ntwo\ntext");
});

it("点击标签菜单可关闭右侧，边界侧选项禁用，并支持右键标签", async () => {
  await mount();
  const a = await textWorkspace.open("C:\\a.txt", "Utf8"); const b = await textWorkspace.open("C:\\b.txt", "Gbk"); const c = await textWorkspace.open("C:\\c.txt", "Utf8"); await nextTick();
  const firstMenu = root!.querySelector<HTMLButtonElement>('[aria-label="a.txt 的标签菜单"]')!;
  firstMenu.click(); await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());
  const items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  expect(items.map((button) => button.textContent)).toEqual(["关闭当前标签", "关闭左侧标签", "关闭右侧标签"]);
  expect(items[1]!.disabled).toBe(true); expect(items[2]!.disabled).toBe(false);
  items[2]!.click(); await vi.waitFor(() => expect(textWorkspace.tabs).toEqual([a]));
  expect(root!.querySelector(`#text-tab-${b.key}`)).toBeNull(); expect(root!.querySelector(`#text-tab-${c.key}`)).toBeNull();
  root!.querySelector<HTMLButtonElement>(`#text-tab-${a.key}`)!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());
  expect(Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).slice(1).every((button) => button.disabled)).toBe(true);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await nextTick();
  expect(document.querySelector('[role="menu"]')).toBeNull();
});
