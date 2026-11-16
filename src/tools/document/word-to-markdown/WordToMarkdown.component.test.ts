// @vitest-environment jsdom
import { createApp, nextTick } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { saveFile } from "@/utils/saveFile";
import { showError } from "@/utils/errorToast";
import { i18n } from "@/locales";
import WordToMarkdown from "./WordToMarkdown.vue";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
vi.mock("@/utils/saveFile", () => ({ saveFile: vi.fn(async () => true) }));
vi.mock("@/utils/errorToast", () => ({ showError: vi.fn() }));
vi.mock("@/composables/toolLibrary", () => ({ recordToolUsage: vi.fn() }));
vi.mock("@/components/common/TextPane.vue", () => ({ default: { props: ["modelValue", "label"], template: '<textarea :value="modelValue" readonly />' } }));
vi.mock("@/components/common/ProcessingMascot.vue", () => ({ default: { template: '<div role="status" />' } }));

let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockResolvedValue(zipSync({ "测试.md": strToU8("# 标题\n\n![图片](assets/image-001.png)"), "assets/image-001.png": new Uint8Array([1, 2, 3]) }).buffer);
});
afterEach(() => { dispose?.(); dispose = undefined; });
function mount() {
  const root = document.createElement("div"); document.body.append(root);
  const app = createApp(WordToMarkdown).use(i18n); app.mount(root);
  dispose = () => { app.unmount(); root.remove(); };
  return root;
}
function upload(root: Element, name = "测试.docx", size?: number) {
  const file = new File(["word data"], name);
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([80, 75]).buffer });
  const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new Event("change"));
}
const button = (root: Element, text: string) => [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;

it("上传后通过二进制 IPC 转换，查看 Markdown，并下载原 ZIP", async () => {
  const root = mount(); upload(root);
  await vi.waitFor(() => expect(root.querySelector("textarea")?.value).toContain("assets/image-001.png"));
  const [command, body, options] = vi.mocked(invoke).mock.calls[0];
  expect(command).toBe("word_to_markdown"); expect(body).toEqual(new Uint8Array([80, 75]));
  expect(options?.headers).toMatchObject({ "x-file-ext": "docx", "x-file-name": btoa(String.fromCharCode(...new TextEncoder().encode("测试.docx"))) });
  button(root, "下载 ZIP").click();
  await vi.waitFor(() => expect(saveFile).toHaveBeenCalledWith(expect.any(Uint8Array), "测试.zip"));
  expect(invoke).toHaveBeenCalledTimes(1);
});

it("转换失败显示统一错误，允许重新尝试 DOCX 转换", async () => {
  vi.mocked(invoke).mockRejectedValueOnce("Invalid DOCX file");
  const root = mount(); upload(root, "文档.DOCX");
  await vi.waitFor(() => expect(showError).toHaveBeenCalledWith("Invalid DOCX file", "Word 转换失败"));
  expect(button(root, "下载").disabled).toBe(true);
  button(root, "重新转换").click();
  await vi.waitFor(() => expect(root.querySelector("textarea")).not.toBeNull());
  expect(vi.mocked(invoke).mock.calls[1][2]?.headers).toMatchObject({ "x-file-ext": "docx" });
});

it("没有图片时下载原始 Markdown，保留中文、表格与公式", async () => {
  const content = "# 中文标题\n\n| 列 |\n| --- |\n| 内容 |\n\n$$\nx^2\n$$\n";
  const bytes = strToU8(content);
  vi.mocked(invoke).mockResolvedValueOnce(zipSync({ "纯文字.md": bytes }).buffer);
  const root = mount(); upload(root, "纯文字.docx");
  await vi.waitFor(() => expect(root.querySelector("textarea")?.value).toBe(content));
  expect(button(root, "下载 Markdown").disabled).toBe(false);
  button(root, "下载 Markdown").click();
  await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
  const [saved, name] = vi.mocked(saveFile).mock.calls[0];
  expect(name).toBe("纯文字.md");
  expect([...saved]).toEqual([...bytes]);
});

it("更换文件后重新判断图片，不沿用上一份文档的导出格式", async () => {
  const root = mount(); upload(root);
  await vi.waitFor(() => expect(button(root, "下载 ZIP")).toBeDefined());
  const bytes = strToU8("无图片");
  vi.mocked(invoke).mockResolvedValueOnce(zipSync({ "空图片.md": bytes }).buffer);
  upload(root, "空图片.docx");
  await vi.waitFor(() => expect(button(root, "下载 Markdown")).toBeDefined());
  button(root, "下载 Markdown").click();
  await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
  const [saved, name] = vi.mocked(saveFile).mock.calls[0];
  expect(name).toBe("空图片.md");
  expect([...saved]).toEqual([...bytes]);
  await nextTick();
  upload(root);
  await vi.waitFor(() => expect(button(root, "下载 ZIP")).toBeDefined());
});

it("文件选择器仅接受 DOCX，上传 DOC 不调用原生转换", async () => {
  const root = mount();
  expect(root.querySelector("input")?.accept).toBe(".docx");
  upload(root, "旧文档.doc"); await nextTick();
  expect(invoke).not.toHaveBeenCalled();
});

it("超大文件在读取前拦截，保留已有结果；取消保存可以再次下载", async () => {
  const root = mount(); upload(root);
  await vi.waitFor(() => expect(root.querySelector("textarea")).not.toBeNull());
  upload(root, "太大.docx", 64 * 1024 * 1024 + 1); await nextTick();
  expect(root.textContent).toContain("文件不能超过 64 MB"); expect(invoke).toHaveBeenCalledTimes(1);
  vi.mocked(saveFile).mockResolvedValueOnce(false);
  button(root, "下载 ZIP").click();
  await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1)); await nextTick();
  expect(button(root, "下载 ZIP").disabled).toBe(false);
});

it("浏览器中说明需要桌面版，不调用原生转换", () => {
  vi.mocked(isTauri).mockReturnValue(false);
  const root = mount();
  expect(root.textContent).toContain("请使用桌面版进行本地 Word 转换");
  expect(root.querySelector('input[type="file"]')).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
});
