// @vitest-environment jsdom
import { editorViewCtx, serializerCtx } from "@milkdown/core";
import { expect, it } from "vitest";
import { makeNotebookEditor } from "./editor";

it("Markdown 输入规则在正文原位排版，并同步输出可保存的源码", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  let markdown = "";
  const editor = makeNotebookEditor(root, "", () => "笔记", value => { markdown = value; });
  try {
    await editor.create();
    const view = editor.action(ctx => ctx.get(editorViewCtx));
    for (const character of "# 标题 **加粗**") {
      const { from, to } = view.state.selection;
      const insert = () => view.state.tr.insertText(character);
      const consumed = view.someProp("handleTextInput", handler =>
        handler(view, from, to, character, insert));
      if (!consumed) view.dispatch(insert());
    }
    expect(root.querySelector("h1")?.textContent).toBe("标题 加粗");
    expect(root.querySelector("h1 strong")?.textContent).toBe("加粗");
    expect(markdown.trim()).toBe("# 标题 **加粗**");
  } finally {
    if (editor.status === "Created") await editor.destroy();
    root.remove();
  }
});

it("渲染现有 Markdown 的表格和任务，并把勾选变化立即保存回源码", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const source = "- [ ] 待办\n\n| 名称 | 数值 |\n| --- | --- |\n| 温度 | 24 |";
  let markdown: string | undefined;
  const editor = makeNotebookEditor(root, source, () => "笔记", value => { markdown = value; });
  try {
    await editor.create();
    expect(markdown).toBeUndefined();
    expect(root.querySelector("table td")?.textContent).toBe("温度");
    const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    checkbox.click();
    expect(markdown).toMatch(/\[x\] 待办/i);
  } finally {
    if (editor.status === "Created") await editor.destroy();
    root.remove();
  }
});

it("呈现 Markdown 扩展并在编辑后保留可移植的源码", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const source = [
    "---", "title: 示例", "---", "",
    "[TOC]", "", "# 标题一", "", "## 标题二", "",
    "==高亮 **加粗**== H~2~O x^2^ ~~删除~~ \\^原文^，以及 $a^2+b^2=c^2$[^note]。",
    "", "$$", String.raw`\frac{1}{2}`, "$$", "",
    "~~~js", "const n = 42;", "~~~", "",
    "[^note]: 脚注正文",
  ].join("\n");
  let saved = "";
  const editor = makeNotebookEditor(root, source, () => "笔记", markdown => { saved = markdown; });
  try {
    await editor.create();
    expect(root.querySelector("mark strong, strong mark")?.textContent, root.querySelector("p")?.innerHTML).toBe("加粗");
    expect(root.querySelector("sub")?.textContent).toBe("2");
    expect(root.querySelector("sup:not([data-type])")?.textContent).toBe("2");
    expect(root.querySelector("del,s")?.textContent).toBe("删除");
    expect(root.querySelector(".math-inline .katex")).not.toBeNull();
    expect(root.querySelector(".math-block .katex-display")).not.toBeNull();
    expect(root.querySelector("pre[data-frontmatter]")?.textContent).toBe("title: 示例");
    expect(root.querySelector("pre[data-language=js] .hljs-keyword")?.textContent).toBe("const");
    expect(root.querySelector("dl[data-type=footnote_definition] dd")?.textContent).toBe("脚注正文");
    expect(Array.from(root.querySelectorAll("nav a"), link => link.textContent)).toEqual(["标题一", "标题二"]);

    const formula = root.querySelector(".math-inline")!;
    formula.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = formula.querySelector("input")!;
    input.value = "x^3";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(saved).toContain("$x^3$");
    expect(saved).toContain("H~2~O");
    expect(saved).toContain("x^2^");
    expect(saved).toContain("==高亮 **加粗**==");
    expect(saved).toContain("[^note]: 脚注正文");
    expect(saved).toContain("[TOC]");
    expect(saved).toMatch(/^---\ntitle: 示例\n---/);
    const roundTrip = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
    expect(roundTrip).toBe(saved);
  } finally {
    if (editor.status === "Created") await editor.destroy();
    root.remove();
  }
});
