// @vitest-environment jsdom
import { createApp, nextTick, type App } from "vue";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import { i18n } from "@/locales";
import { textWorkspace } from "./workspace";
import LargeFileEditor from "./LargeFileEditor.vue";
import * as actions from "./useLargeFile";

const native = vi.hoisted(() => ({ invoke: vi.fn(), desktop: false, drop: undefined as ((event: { payload: { type: string; paths: string[] } }) => void) | undefined }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.desktop, invoke: native.invoke }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({ getCurrentWebviewWindow: () => ({ onDragDropEvent: async (handler: typeof native.drop) => { native.drop = handler; return () => { native.drop = undefined; }; } }) }));
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
  native.desktop = false; vi.restoreAllMocks(); vi.clearAllMocks();
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
  app = createApp(LargeFileEditor).use(i18n); app.mount(root); await nextTick();
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
  app = createApp(LargeFileEditor).use(i18n); app.mount(root!); await nextTick();
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


it("空白页面仅保留打开面板，点击、键盘和拖入文件使用自动识别编码", async () => {
  native.desktop = true;
  vi.spyOn(actions, "initializeLargeText").mockResolvedValue();
  const open = vi.spyOn(actions, "openFile").mockResolvedValue();
  await mount();
  await vi.waitFor(() => expect(native.drop).toBeDefined());
  expect(root!.querySelector(".workspace-toolbar")).toBeNull();
  expect(root!.querySelector(".default-encoding")).toBeNull();
  expect(root!.querySelector(".workspace-heading")).toBeNull();
  const panel = root!.querySelector<HTMLElement>('.empty[role="button"]')!;
  expect(panel.getAttribute("aria-disabled")).toBe("false");
  panel.click();
  expect(open).toHaveBeenLastCalledWith("auto");
  panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  expect(open).toHaveBeenCalledTimes(2);
  native.drop!({ payload: { type: "drop", paths: ["C:\\example.txt"] } });
  expect(open).toHaveBeenLastCalledWith("auto", ["C:\\example.txt"]);
});


it("多次跳转重建真实编辑器后仍能向上读取，不访问已销毁的编辑器状态", async () => {
  await mount();
  const tab = await textWorkspace.open("C:\\jump.txt", "Utf8"); await nextTick();
  tab.controller.state.info!.size = 500000;
  const implementation = native.invoke.getMockImplementation()!;
  const text = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join("\n");
  native.invoke.mockImplementation(async (name, args = {}) => {
    if (name === "large_text_jump") return { start: 100000, end: 200000, text, firstLine: Number(args.line), continuation: false, revision: 0 };
    if (name === "large_text_read") return { start: Number(args.start), end: Number(args.end), text: "previous\n", firstLine: 1, continuation: false, revision: 0 };
    return implementation(name, args);
  });
  for (const line of [5000, 10000, 20000]) {
    tab.controller.state.lineInput = String(line); tab.controller.state.jumpVisible = true; await nextTick();
    root!.querySelector(".jump-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(tab.controller.state.block!.firstLine).toBe(line));
    await nextTick();
    const view = EditorView.findFromDOM(root!.querySelector<HTMLElement>(".cm-content")!)!;
    expect(view.state.doc.toString()).toBe(text);
    view.scrollDOM.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(tab.controller.state.block!.start).toBe(0));
    await nextTick();
    expect(root!.querySelector(".cm-content")?.textContent).toContain("previous");
  }
});
