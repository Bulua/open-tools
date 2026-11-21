// @vitest-environment jsdom
import { editorViewCtx, parserCtx } from "@milkdown/core";
import { expect, test, vi } from "vitest";
import { insertNotebookBlock, makeNotebookEditor } from "./editor";
import type { ImageSizeTarget } from "./images";
import { savePastedImages } from "./storage";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async () => new ArrayBuffer(0),
}));
vi.mock("./storage", () => ({
  savePastedImages: vi.fn(),
}));

const reference = `assets/image-${"a".repeat(64)}.png`;

test("粘贴带图片的富文本时保留文字，并在 Markdown 中写入附件引用", async () => {
  vi.mocked(savePastedImages).mockImplementation(async (_, __, isCurrent, insert) => {
    await Promise.resolve();
    if (isCurrent()) insert([reference]);
  });
  const root = document.createElement("div");
  const onChange = vi.fn();
  const editor = await makeNotebookEditor(root, "note", "", () => "笔记正文", onChange).create();
  try {
    const data = "data:image/png;base64,iVBORw0KGgo=";
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: (type: string) => type === "text/html" ? `<p>截图 <img src="${data}" alt="说明"></p>` : "" },
    });
    editor.action(ctx => ctx.get(editorViewCtx).dom.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(savePastedImages).toHaveBeenCalledWith("note", [data], expect.any(Function), expect.any(Function));
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(`截图 ![说明](${reference} "说明")\n`));

    const file = new File(["image"], "screenshot.png", { type: "image/png" });
    const screenshot = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(screenshot, "clipboardData", { value: { files: [file], getData: () => "" } });
    editor.action(ctx => ctx.get(editorViewCtx).dom.dispatchEvent(screenshot));
    expect(screenshot.defaultPrevented).toBe(true);
    expect(savePastedImages).toHaveBeenLastCalledWith("note", [file], expect.any(Function), expect.any(Function));
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining(`![](${reference})`)));
  } finally {
    await editor.destroy();
  }
});

test("右键缩放的宽度随相对图片路径写入 Markdown，重新打开后仍可恢复默认", async () => {
  const root = document.createElement("div");
  const label = () => "笔记正文";
  const onChange = vi.fn<(markdown: string) => void>();
  let imageMenu: ImageSizeTarget | undefined;
  const open = (markdown: string) => makeNotebookEditor(
    root, "note", markdown, label, onChange, label, label, label,
    (_, target) => { imageMenu = target; },
  ).create();
  const image = () => root.querySelector("img[alt='示意']");
  const rightClick = () => image()?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

  const editor = await open(`![示意](${reference})`);
  try {
    expect(rightClick()).toBe(false);
    imageMenu?.resize(320);
    expect(image()?.getAttribute("width")).toBe("320");
    expect(onChange).toHaveBeenLastCalledWith(`<img src="${reference}" alt="示意" width="320">\n`);
  } finally {
    await editor.destroy();
  }

  const reopened = await open(onChange.mock.lastCall![0]);
  try {
    expect(image()?.getAttribute("width")).toBe("320");
    expect(rightClick()).toBe(false);
    expect(imageMenu?.width).toBe(320);
    imageMenu?.resize(null);
    expect(image()?.hasAttribute("width")).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(`![示意](${reference})\n`);
  } finally {
    await reopened.destroy();
  }
});

test("插入快捷内容时保留正文，表格后的块保持在顶层", async () => {
  const root = document.createElement("div");
  const editor = await makeNotebookEditor(root, "note", "已有正文", () => "笔记正文", vi.fn()).create();
  try {
    editor.action(ctx => {
      const view = ctx.get(editorViewCtx);
      const parse = ctx.get(parserCtx);
      const snippets = [
        "| 第 1 列 | 第 2 列 | 第 3 列 |\n| --- | --- | --- |\n|   |   |   |",
        "- [ ] 待办事项", "```\n\n```", "> 引用内容", "***",
      ];
      for (const snippet of snippets) insertNotebookBlock(view, parse(snippet).firstChild!);
      expect(view.state.doc.firstChild?.textContent).toBe("已有正文");
      const blocks: string[] = [];
      view.state.doc.forEach(block => blocks.push(block.type.name));
      expect(blocks).toEqual(["paragraph", "table", "bullet_list", "code_block", "blockquote", "hr", "paragraph"]);
      expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
    });
  } finally {
    await editor.destroy();
  }
});
