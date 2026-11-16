// @vitest-environment jsdom
import { createApp, nextTick } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import PdfPages from "./PdfPages.vue";

vi.mock("../shared/pdf", () => ({ loadPdf: vi.fn(async () => ({})) }));
vi.mock("../shared/pdfjs", () => ({
  openPdf: vi.fn(async () => ({ numPages: 3, destroy: vi.fn() })),
  renderPage: vi.fn(async () => "blob:page"),
}));

let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { dispose?.(); dispose = undefined; vi.unstubAllGlobals(); });

async function mount() {
  const actions = document.createElement("div"); actions.id = "tool-actions"; document.body.append(actions);
  const root = document.createElement("div"); document.body.append(root);
  const app = createApp(PdfPages).use(i18n); app.mount(root);
  dispose = () => { app.unmount(); root.remove(); actions.remove(); };
  const file = new File(["pdf"], "页面.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1]).buffer });
  const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file] }); input.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(root.querySelectorAll("figure.page")).toHaveLength(3));
  return { root, pages: [...root.querySelectorAll<HTMLElement>("figure.page")] };
}

it("普通点击独立切换页面选中状态，复选框操作不会影响其他页面", async () => {
  const { root, pages } = await mount();
  pages[0].click(); pages[1].click(); await nextTick();
  expect(root.querySelectorAll("figure.on")).toHaveLength(2);
  pages[0].click(); await nextTick();
  expect(pages[0].classList.contains("on")).toBe(false);
  expect(pages[1].classList.contains("on")).toBe(true);
  pages[2].querySelector<HTMLInputElement>(".pick")!.click(); await nextTick();
  expect(pages[1].classList.contains("on")).toBe(true);
  expect(pages[2].classList.contains("on")).toBe(true);
  pages[2].querySelector<HTMLInputElement>(".pick")!.click(); await nextTick();
  expect(root.querySelectorAll("figure.on")).toHaveLength(1);
});

it("Shift 追加连续范围，Ctrl 点击仍只切换当前页面", async () => {
  const { root, pages } = await mount();
  pages[0].click();
  pages[2].dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true })); await nextTick();
  expect(root.querySelectorAll("figure.on")).toHaveLength(3);
  pages[1].dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true })); await nextTick();
  expect(pages[0].classList.contains("on")).toBe(true);
  expect(pages[1].classList.contains("on")).toBe(false);
  expect(pages[2].classList.contains("on")).toBe(true);
});
