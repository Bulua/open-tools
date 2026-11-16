// @vitest-environment jsdom
import { createApp, nextTick } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import { exportEditedPdf } from "./pdfEditor";
import { saveFile } from "@/utils/saveFile";
import PdfEditor from "./PdfEditor.vue";
import { listSystemFonts, readSystemFont } from "./systemFonts";
import { renderPage } from "../shared/pdfjs";

vi.mock("./systemFonts", async (original) => ({
  ...await original<typeof import("./systemFonts")>(),
  listSystemFonts: vi.fn(async () => []),
  readSystemFont: vi.fn(),
}));

const bookmarks = vi.hoisted(() => ({ outline: vi.fn(), destination: vi.fn(), pageIndex: vi.fn() }));
const textBackend = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn(), fonts: vi.fn(), destroy: vi.fn() }));
vi.mock("@pdf-lib/fontkit", () => ({ default: { create: (bytes: Uint8Array) => ({ postscriptName: bytes[0] === 2 ? "TestFont" : "DefaultFont", characterSet: [65], ascent: 800, descent: -200, unitsPerEm: 1000, layout: (text: string) => ({ positions: [...text].map(() => ({ xAdvance: 600 })), glyphs: [...text].map(() => ({ advanceWidth: 600 })) }) }) } }));
vi.mock("./pdfTextClient", () => ({ createPdfTextClient: vi.fn(() => textBackend) }));
vi.mock("../shared/pdfjs", () => ({
  openPdf: vi.fn(async () => ({ numPages: 2, destroy: vi.fn(), getOutline: bookmarks.outline, getDestination: bookmarks.destination, getPageIndex: bookmarks.pageIndex, getPage: async () => ({ getViewport: () => ({ width: 600, height: 800, transform: [1, 0, 0, -1, 0, 800] }) }) })),
  renderPage: vi.fn(async () => "blob:page"),
}));
vi.mock("../shared/pdf", () => ({ loadPdf: vi.fn(async () => ({})) }));
vi.mock("./pdfEditor", async (original) => ({ ...await original<typeof import("./pdfEditor")>(), exportEditedPdf: vi.fn() }));
vi.mock("@/utils/saveFile", () => ({ saveFile: vi.fn(async () => true) }));
vi.mock("@/utils/errorToast", () => ({ showError: vi.fn() }));

let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  Object.defineProperty(Image.prototype, "decode", { configurable: true, value: vi.fn(async () => {}) });
  vi.mocked(listSystemFonts).mockResolvedValue([]);
  vi.mocked(readSystemFont).mockReset();
  bookmarks.outline.mockResolvedValue(null);
  bookmarks.destination.mockResolvedValue([{ num: 9, gen: 0 }]);
  bookmarks.pageIndex.mockResolvedValue(1);
  textBackend.read.mockResolvedValue([{ id: "0:0:0", page: 0, text: "原有文字", x: 40, y: 50, width: 100, height: 20, fontSize: 14, color: "#141413", supported: true }]);
  textBackend.fonts.mockResolvedValue([]);
  textBackend.remove.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("FontFace", class { load() { return Promise.resolve(this); } });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer })));
  Object.defineProperty(document, "fonts", { configurable: true, value: { add: vi.fn(), delete: vi.fn() } });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
  vi.mocked(exportEditedPdf).mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});
afterEach(() => { dispose?.(); dispose = undefined; vi.unstubAllGlobals(); });
const button = (root: Element, text: string) => [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;
const pointer = (target: Element, name: string, x: number, y: number) => {
  const event = new MouseEvent(name, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 }); target.dispatchEvent(event);
  return event;
};
async function mount() {
  const root = document.createElement("div"); document.body.append(root);
  const app = createApp(PdfEditor).use(i18n); app.mount(root);
  dispose = () => { app.unmount(); root.remove(); };
  const file = new File(["pdf"], "测试.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1, 2]).buffer });
  const input = root.querySelector<HTMLInputElement>('input[accept=".pdf"]')!;
  Object.defineProperty(input, "files", { value: [file] }); input.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(root.querySelector(".page-stage")).not.toBeNull());
  await vi.waitFor(() => expect(root.querySelector(".render-state")).toBeNull());
  return root;
}

it("添加和修改文字、移动和缩放，并将编辑数据交给导出函数", async () => {
  const root = await mount(), stage = root.querySelector(".page-stage")!;
  button(root, "文字").click(); await nextTick(); pointer(stage, "pointerdown", 20, 30); await nextTick();
  expect(root.querySelectorAll(".edit-object")).toHaveLength(1);
  const textarea = root.querySelector<HTMLTextAreaElement>("textarea")!;
  expect(textarea.closest(".page-stage")).not.toBeNull();
  expect(document.activeElement).toBe(textarea);
  expect(root.querySelector(".properties textarea")).toBeNull();
  textarea.focus(); textarea.value = "中文编辑"; textarea.dispatchEvent(new Event("input")); textarea.blur(); await nextTick();
  button(root, "选择").click(); await nextTick();
  const object = root.querySelector<HTMLElement>(".edit-object")!;
  pointer(object, "pointerdown", 20, 30); pointer(stage, "pointermove", 50, 70); pointer(stage, "pointerup", 50, 70); await nextTick();
  expect(object.style.left).toBe("50px"); expect(object.style.top).toBe("70px");
  pointer(root.querySelector(".resize-handle")!, "pointerdown", 270, 140); pointer(stage, "pointermove", 300, 160); pointer(stage, "pointerup", 300, 160); await nextTick();
  button(root, "导出 PDF").click();
  await vi.waitFor(() => expect(saveFile).toHaveBeenCalled());
  expect(vi.mocked(exportEditedPdf).mock.calls[0][2][0]).toMatchObject({ text: "中文编辑", x: 50, y: 70, width: 250, height: 48.8 });
  expect(saveFile).toHaveBeenCalledWith(expect.any(Uint8Array), "测试_已编辑.pdf");
});

it("在页面直接输入可整体撤销，双击可再次编辑，空白输入不生成对象", async () => {
  const root = await mount(), stage = root.querySelector(".page-stage")!;
  button(root, "文字").click(); await nextTick(); pointer(stage, "pointerdown", 20, 30); await nextTick();
  let textarea = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  textarea.value = "页面内输入"; textarea.dispatchEvent(new Event("input")); textarea.blur(); await nextTick();
  root.querySelector<HTMLButtonElement>('button[title="撤销（Ctrl+Z）"]')!.click(); await nextTick();
  expect(root.querySelectorAll(".edit-object")).toHaveLength(0);
  root.querySelector<HTMLButtonElement>('button[title="重做（Ctrl+Shift+Z）"]')!.click(); await nextTick();
  root.querySelector(".edit-object")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await nextTick();
  textarea = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  expect(textarea.value).toBe("页面内输入"); textarea.blur(); await nextTick();
  button(root, "文字").click(); await nextTick(); pointer(stage, "pointerdown", 80, 90); await nextTick();
  root.querySelector<HTMLTextAreaElement>(".inline-text")!.blur(); await nextTick();
  expect(root.querySelectorAll(".edit-object")).toHaveLength(1);
});

it("创建文字阻止鼠标默认焦点转移，并保持文字工具，完成一次真实点击后输入框仍可输入", async () => {
  const root = await mount(), stage = root.querySelector(".page-stage")!;
  button(root, "文字").click(); await nextTick();
  const down = pointer(stage, "pointerdown", 20, 30); await nextTick();
  expect(down.defaultPrevented).toBe(true);
  // 浏览器会在按下事件的默认阶段转移焦点；此前没有阻止时会触发 blur 并删除空框。
  if (!down.defaultPrevented) root.querySelector<HTMLButtonElement>('button[title="选择"]')!.focus();
  pointer(stage, "pointerup", 20, 30); stage.dispatchEvent(new MouseEvent("click", { bubbles: true })); await nextTick();
  const input = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  expect(document.activeElement).toBe(input);
  expect(button(root, "文字").classList.contains("primary")).toBe(true);
  input.value = "可以继续输入中文"; input.dispatchEvent(new Event("input"));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true })); await nextTick();
  expect(root.querySelector(".inline-text")).not.toBeNull();
  input.blur(); await nextTick();
  expect(root.querySelector(".text-object")?.textContent).toBe("可以继续输入中文");
});

it("修改原文时先移除旧文字，导出替换内容；撤销可恢复原文", async () => {
  const root = await mount();
  await vi.waitFor(() => expect(root.querySelector(".original-text-target")).not.toBeNull());
  expect(textBackend.read).toHaveBeenCalledWith(0);
  pointer(root.querySelector(".original-text-target")!, "pointerdown", 45, 55);
  await vi.waitFor(() => expect(root.querySelector<HTMLTextAreaElement>(".inline-text")?.value).toBe("原有文字"));
  expect(textBackend.remove).not.toHaveBeenCalled();
  expect(root.querySelector(".inline-text")?.classList.contains("original-pristine")).toBe(true);
  const input = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  input.value = "替换后的内容"; input.dispatchEvent(new Event("input")); input.blur(); await nextTick();
  await vi.waitFor(() => expect(textBackend.remove).toHaveBeenCalledWith(["0:0:0"]));
  button(root, "导出 PDF").click(); await vi.waitFor(() => expect(saveFile).toHaveBeenCalled());
  const call = vi.mocked(exportEditedPdf).mock.calls[0];
  expect(call[2][0]).toMatchObject({ text: "替换后的内容", originalId: "0:0:0", fontSize: 14 });
  expect(call[4]).toBe(true);
  await vi.waitFor(() => expect(button(root, "导出 PDF").disabled).toBe(false));
  root.querySelector<HTMLButtonElement>('button[title="撤销（Ctrl+Z）"]')!.click(); await nextTick();
  expect(root.querySelector(".edit-object")).toBeNull();
});

it("原文未改字时也可通过手柄移动，导出和撤销保留原文字内容", async () => {
  const root = await mount(), stage = root.querySelector(".page-stage")!;
  await vi.waitFor(() => expect(root.querySelector(".original-text-target")).not.toBeNull());
  pointer(root.querySelector(".original-text-target")!, "pointerdown", 45, 55);
  await vi.waitFor(() => expect(root.querySelector(".inline-text")).not.toBeNull());
  expect(textBackend.remove).not.toHaveBeenCalled();
  pointer(root.querySelector(".move-handle")!, "pointerdown", 40, 30);
  pointer(stage, "pointermove", 80, 60); pointer(stage, "pointerup", 80, 60);
  await nextTick();
  expect(root.querySelector<HTMLElement>(".edit-object")?.style.left).toBe("80px");
  expect(root.querySelector<HTMLElement>(".edit-object")?.style.top).toBe("80px");
  button(root, "导出 PDF").click();
  await vi.waitFor(() => expect(exportEditedPdf).toHaveBeenCalled());
  expect(vi.mocked(exportEditedPdf).mock.calls[0][2][0]).toMatchObject({ text: "原有文字", originalId: "0:0:0", x: 80, y: 80 });
  await vi.waitFor(() => expect(button(root, "导出 PDF").disabled).toBe(false));
  root.querySelector<HTMLButtonElement>('button[title="撤销（Ctrl+Z）"]')!.click(); await nextTick();
  expect(root.querySelector(".edit-object")).toBeNull();
});

it("点击原文移动手柄但不拖动时不产生替换和撤销记录", async () => {
  const root = await mount(), stage = root.querySelector(".page-stage")!;
  await vi.waitFor(() => expect(root.querySelector(".original-text-target")).not.toBeNull());
  pointer(root.querySelector(".original-text-target")!, "pointerdown", 45, 55);
  await vi.waitFor(() => expect(root.querySelector(".inline-text")).not.toBeNull());
  pointer(root.querySelector(".move-handle")!, "pointerdown", 40, 30);
  pointer(stage, "pointerup", 40, 30); await nextTick();
  expect(root.querySelector(".edit-object")).toBeNull();
  expect(textBackend.remove).not.toHaveBeenCalled();
  expect(root.querySelector<HTMLButtonElement>('button[title="撤销（Ctrl+Z）"]')!.disabled).toBe(true);
});

it("原文背景更新等待新位图解码，保留旧图和输入焦点，不显示整页加载遮罩", async () => {
  const root = await mount();
  await vi.waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));
  await nextTick();
  await vi.waitFor(() => expect(root.querySelector(".original-text-target")).not.toBeNull());
  pointer(root.querySelector(".original-text-target")!, "pointerdown", 45, 55);
  await vi.waitFor(() => expect(root.querySelector(".inline-text")).not.toBeNull());
  let decode: (() => void) | undefined;
  vi.mocked(Image.prototype.decode).mockImplementationOnce(() => new Promise<void>((resolve) => { decode = resolve; }));
  vi.mocked(renderPage).mockResolvedValueOnce("blob:updated");
  const input = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  const background = root.querySelector<HTMLImageElement>(".page-background")!;
  const before = background.getAttribute("src");
  input.value = "原文输入修改"; input.dispatchEvent(new Event("input"));
  await vi.waitFor(() => expect(decode).toBeDefined());
  expect(root.querySelector(".render-state")).toBeNull();
  expect(root.querySelector(".page-background")).toBe(background);
  expect(background.getAttribute("src")).toBe(before);
  expect(input.classList.contains("original-pristine")).toBe(true);
  expect(document.activeElement).toBe(input);
  decode!();
  await vi.waitFor(() => expect(background.getAttribute("src")).toBe("blob:updated"));
  expect(input.classList.contains("original-pristine")).toBe(false);
  expect(root.querySelector(".inline-text")).toBe(input);
  expect(document.activeElement).toBe(input);
});

it("关闭并重开文件后，旧文件迟到的渲染结果不会覆盖新文件背景", async () => {
  const root = await mount();
  await vi.waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2)); await nextTick();
  let finishOld: ((url: string) => void) | undefined;
  vi.mocked(renderPage).mockImplementationOnce(() => new Promise<string>((resolve) => { finishOld = resolve; }));
  root.querySelector<HTMLButtonElement>('button[title="放大"]')!.click();
  await vi.waitFor(() => expect(finishOld).toBeDefined());
  root.querySelector<HTMLButtonElement>('button[title="关闭当前文件"]')!.click(); await nextTick();
  expect(root.querySelector(".page-background")).toBeNull();
  const file = new File(["new"], "重新打开.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([3, 4]).buffer });
  const input = root.querySelector<HTMLInputElement>('input[accept=".pdf"]')!;
  Object.defineProperty(input, "files", { value: [file] }); input.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(root.querySelector(".page-stage")).not.toBeNull());
  finishOld!("blob:stale-file");
  await vi.waitFor(() => expect(root.querySelector<HTMLImageElement>(".page-background")?.getAttribute("src")).toBe("blob:page"));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:stale-file");
  expect(root.querySelector(".footer")?.textContent).toContain("重新打开.pdf");
});

it("输入长行只扩宽文本框，回车增加一行，保持显式换行交给导出", async () => {
  const root = await mount(), stage = root.querySelector(".page-stage")!;
  button(root, "文字").click(); await nextTick(); pointer(stage, "pointerdown", 20, 30); await nextTick();
  const input = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  expect(input.wrap).toBe("off");
  const initialHeight = root.querySelector<HTMLElement>(".edit-object")!.style.height;
  input.value = "A".repeat(30); input.dispatchEvent(new Event("input")); await nextTick();
  expect(parseFloat(root.querySelector<HTMLElement>(".edit-object")!.style.width)).toBeGreaterThan(220);
  expect(root.querySelector<HTMLElement>(".edit-object")!.style.height).toBe(initialHeight);
  input.value += "\nA"; input.dispatchEvent(new Event("input")); await nextTick();
  expect(parseFloat(root.querySelector<HTMLElement>(".edit-object")!.style.height)).toBe(45);
  input.blur(); await nextTick(); button(root, "导出 PDF").click();
  await vi.waitFor(() => expect(exportEditedPdf).toHaveBeenCalled());
  expect(vi.mocked(exportEditedPdf).mock.calls[0][2][0].text).toBe("A".repeat(30) + "\nA");
});

it("一次粘贴长文本在同一输入事件内扩宽输入框并清除内部滚动，保留光标位置", async () => {
  const root = await mount(), stage = root.querySelector(".page-stage")!;
  button(root, "文字").click(); await nextTick(); pointer(stage, "pointerdown", 20, 30); await nextTick();
  const input = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  input.value = "A".repeat(100); input.setSelectionRange(100, 100); input.scrollLeft = 200;
  input.dispatchEvent(new Event("input"));
  expect(parseFloat(input.style.width)).toBeGreaterThan(1000);
  expect(input.scrollLeft).toBe(0);
  await nextTick();
  expect(input.selectionStart).toBe(100); expect(input.selectionEnd).toBe(100);
  expect(input.scrollLeft).toBe(0);
  expect(root.querySelector(".format-messages")).toBeNull();
});

it("中文输入法组合期间按实际输入扩宽，不等待 v-model 提交，也不改写光标", async () => {
  const root = await mount(), stage = root.querySelector(".page-stage")!;
  button(root, "文字").click(); await nextTick(); pointer(stage, "pointerdown", 20, 30); await nextTick();
  const input = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  input.dispatchEvent(new CompositionEvent("compositionstart"));
  input.value = "中文".repeat(20); input.setSelectionRange(40, 40); input.scrollLeft = 100;
  input.dispatchEvent(new InputEvent("input", { isComposing: true, inputType: "insertCompositionText" }));
  expect(parseFloat(input.style.width)).toBeGreaterThan(400);
  expect(input.scrollLeft).toBe(0); expect(input.selectionStart).toBe(40);
  input.dispatchEvent(new CompositionEvent("compositionend")); await nextTick();
  expect(input.value).toBe("中文".repeat(20)); expect(input.selectionStart).toBe(40);
});

it("原文文字起点、字距及水平缩放同时用于输入光标排版和导出", async () => {
  textBackend.read.mockResolvedValue([{ id: "0:0:0", page: 0, text: "AV", x: 40, y: 50, originX: 42, width: 100, height: 20, fontSize: 14, characterSpacing: 0.8, horizontalScale: 0.85, color: "#141413", supported: true }]);
  const root = await mount();
  await vi.waitFor(() => expect(root.querySelector(".original-text-target")).not.toBeNull());
  pointer(root.querySelector(".original-text-target")!, "pointerdown", 45, 55);
  await vi.waitFor(() => expect(root.querySelector(".inline-text")).not.toBeNull());
  const input = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  expect(input.style.left).toBe("2px");
  expect(input.style.letterSpacing).toBe("0.8px");
  expect(input.style.transform).toBe("scaleX(0.85)");
  input.value = "AV A"; input.dispatchEvent(new Event("input")); input.blur(); await nextTick();
  button(root, "导出 PDF").click();
  await vi.waitFor(() => expect(exportEditedPdf).toHaveBeenCalled());
  expect(vi.mocked(exportEditedPdf).mock.calls[0][2][0]).toMatchObject({ textOriginX: 2, characterSpacing: 0.8, horizontalScale: 0.85 });
});

it("原文无法安全移除时不创建替换对象，扫描页显示无原文提示", async () => {
  const root = await mount(); textBackend.remove.mockRejectedValue(new Error("无法安全移除"));
  button(root, "修改原文").click(); await vi.waitFor(() => expect(root.querySelector(".original-text-target")).not.toBeNull());
  pointer(root.querySelector(".original-text-target")!, "pointerdown", 45, 55);
  await vi.waitFor(() => expect(root.querySelector(".inline-text")).not.toBeNull());
  const input = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  input.value = "替换"; input.dispatchEvent(new Event("input"));
  await vi.waitFor(() => expect(root.querySelector(".edit-object")).toBeNull());
  textBackend.read.mockResolvedValue([]);
  root.querySelector<HTMLButtonElement>('[data-page="1"]')!.click();
  await vi.waitFor(() => expect(textBackend.read).toHaveBeenCalledWith(1));
  await vi.waitFor(() => expect(root.querySelector(".original-text-target")).toBeNull());
  expect(root.querySelector(".format-messages")).toBeNull();
});

it("等待实际修改处理时切换工具，处理结束后不会抢回焦点", async () => {
  const root = await mount();
  let complete: ((data: Uint8Array) => void) | undefined;
  textBackend.remove.mockImplementationOnce(() => new Promise<Uint8Array>((resolve) => { complete = resolve; }));
  button(root, "修改原文").click(); await vi.waitFor(() => expect(root.querySelector(".original-text-target")).not.toBeNull());
  pointer(root.querySelector(".original-text-target")!, "pointerdown", 45, 55);
  await vi.waitFor(() => expect(root.querySelector(".inline-text")).not.toBeNull());
  const input = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  input.value = "已输入的修改"; input.dispatchEvent(new Event("input"));
  await vi.waitFor(() => expect(complete).toBeDefined());
  button(root, "选择").click(); complete!(new Uint8Array([37, 80, 68, 70]));
  await vi.waitFor(() => expect(root.querySelector(".render-state")).toBeNull());
  expect(root.querySelector(".inline-text")).toBeNull();
  expect(button(root, "选择").classList.contains("primary")).toBe(true);
});

it("签名模式连续写笔迹时没有选中框，切换选择模式后仍可选中调整", async () => {
  const root = await mount(), stage = root.querySelector(".page-stage")!;
  button(root, "手写签名").click(); await nextTick();
  for (const offset of [0, 20]) {
    pointer(stage, "pointerdown", 20 + offset, 30); pointer(stage, "pointermove", 50 + offset, 60); pointer(stage, "pointerup", 50 + offset, 60); await nextTick();
  }
  expect(root.querySelectorAll(".edit-object")).toHaveLength(2);
  expect(root.querySelector(".edit-object.selected")).toBeNull();
  expect(root.querySelector(".resize-handle")).toBeNull();
  button(root, "选择").click(); await nextTick();
  pointer(root.querySelector(".edit-object")!, "pointerdown", 25, 35); pointer(stage, "pointerup", 25, 35); await nextTick();
  expect(root.querySelector(".edit-object.selected")).not.toBeNull();
});

it("绘制前和选中后都可调整箭头头部大小，支持撤销并交给导出", async () => {
  const root = await mount(), stage = root.querySelector(".page-stage")!;
  button(root, "箭头").click(); await nextTick();
  let size = root.querySelector<HTMLInputElement>(".arrow-head-size")!;
  expect(size.value).toBe("24");
  size.value = "36"; size.dispatchEvent(new Event("input")); size.dispatchEvent(new Event("change"));
  pointer(stage, "pointerdown", 200, 200); pointer(stage, "pointermove", 400, 120); pointer(stage, "pointerup", 400, 120); await nextTick();
  const head = root.querySelectorAll(".edit-object polyline")[1];
  const before = head.getAttribute("points");
  size = root.querySelector<HTMLInputElement>(".arrow-head-size")!;
  expect(size.value).toBe("36");
  size.focus(); size.value = "48"; size.dispatchEvent(new Event("input")); size.dispatchEvent(new Event("change")); size.blur(); await nextTick();
  expect(head.getAttribute("points")).not.toBe(before);
  root.querySelector<HTMLButtonElement>('button[title="撤销（Ctrl+Z）"]')!.click(); await nextTick();
  expect(root.querySelectorAll(".edit-object polyline")[1].getAttribute("points")).toBe(before);
  button(root, "导出 PDF").click();
  await vi.waitFor(() => expect(exportEditedPdf).toHaveBeenCalled());
  expect(vi.mocked(exportEditedPdf).mock.calls[0][2][0]).toMatchObject({ kind: "arrow", arrowHeadSize: 36 });
});

it("Ctrl 加滚轮缩放编辑页面并阻止浏览器缩放，普通滚轮保留滚动", async () => {
  const root = await mount(), canvas = root.querySelector(".canvas-scroll")!, stage = root.querySelector<HTMLElement>(".page-stage")!;
  const wheel = new WheelEvent("wheel", { deltaY: -120, ctrlKey: true, bubbles: true, cancelable: true, clientX: 100, clientY: 100 });
  canvas.dispatchEvent(wheel); await nextTick();
  expect(wheel.defaultPrevented).toBe(true);
  expect(parseFloat(stage.style.width)).toBeGreaterThan(600);
  const width = stage.style.width;
  const normal = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }); canvas.dispatchEvent(normal); await nextTick();
  expect(normal.defaultPrevented).toBe(false); expect(stage.style.width).toBe(width);
  await vi.waitFor(() => expect(root.querySelector(".render-state")).toBeNull());
  canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 100000, ctrlKey: true, bubbles: true, cancelable: true })); await nextTick();
  expect(stage.style.width).toBe("150px");
});

it("无目录的 PDF 不显示目录选项，有目录时可切换并跳转", async () => {
  let root = await mount();
  expect(root.querySelector(".navigation-tabs")).toBeNull(); dispose?.(); dispose = undefined;
  bookmarks.outline.mockResolvedValue([{ title: "第二章", dest: "chapter2", items: [{ title: "第一节", dest: [1], items: [] }] }]);
  root = await mount();
  expect(root.querySelector(".navigation-tabs")).not.toBeNull();
  button(root, "目录").click(); await nextTick();
  expect(root.querySelectorAll(".outline-entry")).toHaveLength(2);
  button(root, "第二章").click();
  await vi.waitFor(() => expect(root.querySelector(".footer")?.textContent).toContain("第 2 / 2 页"));
  button(root, "缩略图").click(); await nextTick();
  expect(root.querySelectorAll(".page-thumb")).toHaveLength(2);
});

it("图形支持撤销、重做和跨页编辑，Delete 只删除选中的新增对象", async () => {
  const root = await mount(), stage = root.querySelector(".page-stage")!;
  button(root, "矩形").click(); await nextTick();
  pointer(stage, "pointerdown", 30, 40); pointer(stage, "pointermove", 170, 110); pointer(stage, "pointerup", 170, 110); await nextTick();
  expect(root.querySelectorAll(".edit-object")).toHaveLength(1);
  root.querySelector<HTMLButtonElement>('button[title="撤销（Ctrl+Z）"]')!.click(); await nextTick();
  expect(root.querySelectorAll(".edit-object")).toHaveLength(0);
  root.querySelector<HTMLButtonElement>('button[title="重做（Ctrl+Shift+Z）"]')!.click(); await nextTick();
  expect(root.querySelectorAll(".edit-object")).toHaveLength(1);
  root.querySelector<HTMLButtonElement>('[data-page="1"]')!.click(); await nextTick();
  expect(root.querySelectorAll('[data-document-page="1"] .edit-object')).toHaveLength(0);
  root.querySelector<HTMLButtonElement>('[data-page="0"]')!.click(); await vi.waitFor(() => expect(root.querySelector(".render-state")).toBeNull());
  pointer(root.querySelector(".edit-object")!, "pointerdown", 40, 50); pointer(stage, "pointerup", 40, 50); await nextTick();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })); await nextTick();
  expect(root.querySelectorAll(".edit-object")).toHaveLength(0);
});


it("文字工具下用独立手柄移动文字，框内空白处仍能新增文字", async () => {
  const root = await mount(), stage = root.querySelector(".page-stage")!;
  button(root, "文字").click(); await nextTick();
  pointer(stage, "pointerdown", 200, 200); await nextTick();
  const input = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  input.value = "移动文字"; input.dispatchEvent(new Event("input")); input.blur(); await nextTick();
  const item = root.querySelector<HTMLElement>(".edit-object")!;
  expect(item.classList.contains("text-kind")).toBe(true);
  pointer(root.querySelector(".move-handle")!, "pointerdown", 200, 180);
  pointer(stage, "pointermove", 240, 230); pointer(stage, "pointerup", 240, 230); await nextTick();
  expect(item.style.left).toBe("240px"); expect(item.style.top).toBe("250px");
  expect(button(root, "文字").classList.contains("primary")).toBe(true);
  // 空白区域通过文字容器命中页面，而文字内容和手柄有各自的点击区域。
  pointer(stage, "pointerdown", 400, 260); await nextTick();
  expect(root.querySelectorAll(".edit-object")).toHaveLength(2);
  expect(document.activeElement).toBe(root.querySelector(".inline-text"));
});

it("左侧栏可拖动调整宽度，支持键盘和取消拖动", async () => {
  const root = await mount(), handle = root.querySelector(".navigation-resizer")!;
  const sidebar = root.querySelector<HTMLElement>(".thumbnails")!;
  pointer(handle, "pointerdown", 170, 50); pointer(handle, "pointermove", 250, 50); pointer(handle, "pointerup", 250, 50); await nextTick();
  expect(sidebar.style.flexBasis).toBe("250px");
  handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await nextTick();
  expect(sidebar.style.flexBasis).toBe("260px");
  pointer(handle, "pointerdown", 260, 50); pointer(handle, "pointermove", 1000, 50); await nextTick();
  expect(sidebar.style.flexBasis).toBe("420px");
  pointer(handle, "pointercancel", 1000, 50); await nextTick();
  expect(sidebar.style.flexBasis).toBe("260px");
});


it("连续页面随滚动切换当前页，右侧不再显示属性栏", async () => {
  const root = await mount(), container = root.querySelector<HTMLElement>(".canvas-scroll")!;
  const stages = [...root.querySelectorAll<HTMLElement>(".page-stage")];
  expect(stages).toHaveLength(2);
  expect(root.querySelector(".properties")).toBeNull();
  expect(root.querySelector(".format-toolbar")).not.toBeNull();
  vi.spyOn(container, "getBoundingClientRect").mockImplementation(() => ({ top: 0, bottom: 900, left: 0, right: 900, width: 900, height: 900 } as DOMRect));
  stages.forEach((element, index) => {
    Object.defineProperty(element, "offsetTop", { configurable: true, value: 24 + index * 824 });
    vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => ({ top: 24 + index * 824 - container.scrollTop, bottom: 824 + index * 824 - container.scrollTop, left: 0, right: 600, width: 600, height: 800 } as DOMRect));
  });
  container.scrollTop = 800; container.dispatchEvent(new Event("scroll"));
  await vi.waitFor(() => expect(root.querySelector(".footer")?.textContent).toContain("第 2 / 2 页"));
  expect(textBackend.read).toHaveBeenCalledWith(1);
  expect(root.querySelector('[data-page="1"]')?.classList.contains("active")).toBe(true);
  expect(root.querySelector('[data-page="1"]')?.getAttribute("aria-current")).toBe("page");
  expect(root.querySelector('[data-page="0"]')?.classList.contains("active")).toBe(false);
  button(root, "文字").click(); await nextTick();
  pointer(stages[1], "pointerdown", 150, 150); await nextTick();
  expect(stages[1].querySelector(".inline-text")).not.toBeNull();
  root.querySelector<HTMLTextAreaElement>(".inline-text")!.blur(); await nextTick();
  root.querySelector<HTMLButtonElement>('[data-page="0"]')!.click(); await nextTick();
  expect(container.scrollTop).toBe(0);
});

it("点击原文但没有修改时保留原始显示，离开后不生成替换或撤销记录", async () => {
  const root = await mount();
  await vi.waitFor(() => expect(root.querySelector(".original-text-target")).not.toBeNull());
  pointer(root.querySelector(".original-text-target")!, "pointerdown", 45, 55);
  await nextTick();
  expect(root.querySelector(".inline-text")?.classList.contains("original-pristine")).toBe(true);
  root.querySelector<HTMLTextAreaElement>(".inline-text")!.blur(); await nextTick();
  expect(textBackend.remove).not.toHaveBeenCalled();
  expect(root.querySelector(".edit-object")).toBeNull();
  expect(root.querySelector<HTMLButtonElement>('button[title="撤销（Ctrl+Z）"]')!.disabled).toBe(true);
  button(root, "导出 PDF").click(); await vi.waitFor(() => expect(saveFile).toHaveBeenCalled());
  expect(vi.mocked(exportEditedPdf).mock.calls[0][2]).toEqual([]);
});


it("复用原文嵌入字体，缺字时保留字体选择且不增加顶部提示行", async () => {
  textBackend.read.mockResolvedValue([{ id: "0:0:0", page: 0, text: "A", x: 40, y: 50, width: 12, height: 20, fontSize: 14, fontName: "TestFont", baseline: 66, color: "#141413", supported: true }]);
  textBackend.fonts.mockResolvedValue([{ name: "TestFont", bytes: new Uint8Array([2]) }]);
  const root = await mount();
  await vi.waitFor(() => expect(root.querySelector(".original-text-target")).not.toBeNull());
  pointer(root.querySelector(".original-text-target")!, "pointerdown", 45, 55);
  await vi.waitFor(() => expect(root.querySelector(".inline-text")).not.toBeNull());
  const input = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  expect(input.style.fontFamily).toContain("embedded");
  expect(root.querySelector(".format-toolbar")?.textContent).not.toContain("当前原文字体不可复用");
  input.value = "AB"; input.dispatchEvent(new Event("input")); await nextTick();
  expect(input.style.fontFamily).toContain("embedded");
  expect(root.querySelector(".format-messages")).toBeNull();
});

it("原文字体通过别名匹配完整本机字体，并优先于嵌入子集", async () => {
  vi.mocked(listSystemFonts).mockResolvedValue([{ id: 7, family: "测试字体", name: "测试字体", aliases: ["TestFont", "测试字体"], bold: true, italic: false }]);
  vi.mocked(readSystemFont).mockResolvedValue(new Uint8Array([2]));
  textBackend.read.mockResolvedValue([{ id: "0:0:0", page: 0, text: "A", x: 40, y: 50, width: 12, height: 20, fontSize: 14, fontName: "ABCDEF+TestFont", bold: true, color: "#141413", supported: true }]);
  textBackend.fonts.mockResolvedValue([{ name: "TestFont", bytes: new Uint8Array([2]) }]);
  const root = await mount();
  await vi.waitFor(() => expect(root.querySelector(".original-text-target")).not.toBeNull());
  pointer(root.querySelector(".original-text-target")!, "pointerdown", 45, 55);
  await vi.waitFor(() => expect(root.querySelector<HTMLTextAreaElement>(".inline-text")?.style.fontFamily).toContain("system:7"));
  expect(readSystemFont).toHaveBeenCalledWith(7);
  expect(root.querySelector(".format-messages")).toBeNull();
  expect(root.querySelector(".format-toolbar")?.textContent).not.toContain("未找到可用的同款");
});

it("本机同款字体读取失败时仍可使用可用的嵌入字体", async () => {
  vi.mocked(listSystemFonts).mockResolvedValue([{ id: 7, family: "TestFont", name: "TestFont", aliases: ["TestFont"], bold: false, italic: false }]);
  vi.mocked(readSystemFont).mockRejectedValue(new Error("This font does not permit editable subset embedding"));
  textBackend.read.mockResolvedValue([{ id: "0:0:0", page: 0, text: "A", x: 40, y: 50, width: 12, height: 20, fontSize: 14, fontName: "TestFont", color: "#141413", supported: true }]);
  textBackend.fonts.mockResolvedValue([{ name: "TestFont", bytes: new Uint8Array([2]) }]);
  const root = await mount();
  await vi.waitFor(() => expect(root.querySelector(".original-text-target")).not.toBeNull());
  pointer(root.querySelector(".original-text-target")!, "pointerdown", 45, 55);
  await vi.waitFor(() => expect(root.querySelector<HTMLTextAreaElement>(".inline-text")?.style.fontFamily).toContain("embedded"));
});

it("从下拉框手动选择本机字体，导出使用已读取的相同字体数据", async () => {
  vi.mocked(listSystemFonts).mockResolvedValue([{ id: 8, family: "本机测试", name: "本机测试", aliases: ["TestFont"], bold: false, italic: false }]);
  vi.mocked(readSystemFont).mockResolvedValue(new Uint8Array([2]));
  const root = await mount();
  button(root, "文字").click(); await nextTick();
  pointer(root.querySelector(".page-stage")!, "pointerdown", 20, 30); await nextTick();
  const input = root.querySelector<HTMLTextAreaElement>(".inline-text")!;
  input.value = "A"; input.dispatchEvent(new Event("input"));
  root.querySelector<HTMLButtonElement>(".select-trigger")!.click(); await nextTick();
  const option = [...document.querySelectorAll<HTMLElement>(".select-menu .option")].find((node) => node.textContent?.includes("本机测试"))!;
  option.click();
  await vi.waitFor(() => expect(root.querySelector(".select-trigger")?.textContent).toContain("本机测试"));
  expect(readSystemFont).toHaveBeenCalledWith(8);
  input.blur(); await nextTick();
  button(root, "导出 PDF").click();
  await vi.waitFor(() => expect(exportEditedPdf).toHaveBeenCalled());
  const args = vi.mocked(exportEditedPdf).mock.calls[0];
  expect(args[2][0].fontId).toBe("system:8");
  expect(args[3]["system:8"]).toEqual(new Uint8Array([2]));
});


it("选中未修改的原文也能直接删除，撤销恢复原始文字", async () => {
  const root = await mount();
  await vi.waitFor(() => expect(root.querySelector(".original-text-target")).not.toBeNull());
  pointer(root.querySelector(".original-text-target")!, "pointerdown", 45, 55); await nextTick();
  button(root, "删除对象").click();
  await vi.waitFor(() => expect(textBackend.remove).toHaveBeenCalledWith(["0:0:0"]));
  root.querySelector<HTMLButtonElement>('button[title="撤销（Ctrl+Z）"]')!.click(); await nextTick();
  expect(root.querySelector(".edit-object")).toBeNull();
  expect(root.querySelector(".original-text-target")).not.toBeNull();
});
