// @vitest-environment jsdom
import { editorViewCtx, parserCtx, serializerCtx } from "@milkdown/core";
import { Selection } from "@milkdown/prose/state";
import { isInTable, selectedRect, TableMap } from "@milkdown/prose/tables";
import { createApp } from "vue";
import { compileStyle, parse as parseComponent } from "vue/compiler-sfc";
import { expect, test, vi } from "vitest";
import { i18n } from "@/locales";
import { makeNotebookEditor } from "./editor";
import Notebook from "./Notebook.vue";
import NotebookEditor from "./components/NotebookEditor.vue";
import editorComponentSource from "./components/NotebookEditor.vue?raw";
import { formatSelectedTable, runTableAction, selectTableCell, tableActionEnabled, tableMarkdown } from "./tables";

test("编辑器实际渲染的表格应用完整网格线和隔行底色", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const app = createApp(NotebookEditor, {
    id: "note", markdown: tableMarkdown(3, 2),
  }).use(i18n);
  app.mount(host);
  const stylesheet = document.head.appendChild(document.createElement("style"));
  try {
    await vi.waitFor(() => expect(host.querySelectorAll("tr")).toHaveLength(3));
    const filename = "NotebookEditor.vue";
    const { styles } = parseComponent(editorComponentSource, { filename }).descriptor;
    const id = "data-v-notebook-table-test";
    host.querySelector(".note-editor")!.setAttribute(id, "");
    stylesheet.textContent = compileStyle({ filename, id, source: styles.find(style => style.scoped)!.content, scoped: true }).code;
    const rules = Array.from(stylesheet.sheet!.cssRules).filter(rule => rule instanceof CSSStyleRule);
    const matches = (cell: Element, property: string, value: string) => rules.some(rule =>
      rule.style.getPropertyValue(property).trim() === value && cell.matches(rule.selectorText));
    for (const cell of host.querySelectorAll("th, td")) expect(matches(cell, "border", "1px solid var(--border)")).toBe(true);
    host.querySelectorAll("tr").forEach((row, index) => {
      for (const cell of row.cells) expect(matches(cell, "background", "var(--hover)")).toBe(index % 2 === 0);
    });
  } finally {
    app.unmount();
    host.remove();
    stylesheet.remove();
  }
});

test("按所选行列生成空表格，保存再读取后尺寸一致", async () => {
  const editor = await makeNotebookEditor(document.createElement("div"), "note", "", () => "笔记正文", vi.fn()).create();
  try {
    editor.action(ctx => {
      const parse = ctx.get(parserCtx);
      const serialize = ctx.get(serializerCtx);
      const sizes = [[1, 1], [1, 5], [4, 1], [2, 5], [6, 2]];
      for (const [rows, columns] of sizes) {
        const doc = parse(tableMarkdown(rows, columns));
        const table = doc.firstChild!;
        expect(table.type.name).toBe("table");
        expect(table.firstChild?.type.name).toBe("table_header_row");
        expect(table.textContent).toBe("");
        const { width, height, problems } = TableMap.get(table);
        expect([height, width, problems]).toEqual([rows, columns, null]);
        expect(parse(serialize(doc)).eq(doc)).toBe(true);
      }
    });
  } finally {
    await editor.destroy();
  }
});

test("增删行列和设置对齐后，Markdown 还能读回同一张表", async () => {
  const markdown = "| 甲 | 乙 |\n| --- | --- |\n| A1 | A2 |\n| B1 | B2 |";
  const editor = await makeNotebookEditor(document.createElement("div"), "note", markdown, () => "笔记正文", vi.fn()).create();
  try {
    editor.action(ctx => {
      const view = ctx.get(editorViewCtx);
      const table = () => view.state.doc.firstChild!;
      const cursor = (row: number, column: number) => {
        const cell = TableMap.get(table()).positionAt(row, column, table()) + 1;
        view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(cell + 1))));
      };
      cursor(1, 1);
      runTableAction(ctx, view, "tableRowBefore");
      expect(table().child(1).textContent).toBe("");
      runTableAction(ctx, view, "tableRowAfter");
      expect(table().childCount).toBe(5);
      cursor(1, 0);
      runTableAction(ctx, view, "tableDeleteRow");
      cursor(2, 0);
      runTableAction(ctx, view, "tableDeleteRow");
      cursor(0, 0);
      runTableAction(ctx, view, "tableDeleteRow");
      expect(table().firstChild?.type.name).toBe("table_header_row");
      expect(table().firstChild?.textContent).toBe("A1A2");

      cursor(0, 0);
      runTableAction(ctx, view, "tableColumnBefore");
      runTableAction(ctx, view, "tableColumnAfter");
      expect(TableMap.get(table()).width).toBe(4);
      cursor(1, 3);
      runTableAction(ctx, view, "tableDeleteColumn");
      expect(table().textContent).toBe("A1B1");
      cursor(1, 1);
      runTableAction(ctx, view, "tableAlignCenter");
      expect(table().child(0).child(1).attrs.alignment).toBe("center");
      expect(table().child(1).child(1).attrs.alignment).toBe("center");

      cursor(1, 0);
      runTableAction(ctx, view, "tableDeleteRow");
      expect(table().childCount).toBe(1);
      expect(tableActionEnabled(view, "tableDeleteRow")).toBe(false);
      const saved = ctx.get(serializerCtx)(view.state.doc);
      const reopened = ctx.get(parserCtx)(saved).firstChild!;
      expect(reopened.childCount).toBe(1);
      expect(reopened.firstChild?.child(1).attrs.alignment).toBe("center");
      expect(reopened.textContent).toBe("A1");
    });
  } finally {
    await editor.destroy();
  }
});

test("右键菜单操作的是点击的单元格所在行", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const app = createApp(NotebookEditor, {
    id: "note", markdown: "| 表头 |\n| --- |\n| 保留 |\n| 删除 |",
  });
  app.use(i18n).mount(host);
  try {
    await vi.waitFor(() => expect(host.querySelectorAll("td")).toHaveLength(2));
    const target = host.querySelectorAll("td")[1];
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 32, clientY: 32 });
    expect(target.dispatchEvent(event)).toBe(false);
    const deleteRow = () => [...document.querySelectorAll<HTMLButtonElement>(".table-menu button")]
      .find(button => button.textContent?.trim() === "删除行");
    await vi.waitFor(() => expect(deleteRow()).toBeDefined());
    deleteRow()?.click();
    expect([...host.querySelectorAll("td")].map(cell => cell.textContent)).toEqual(["保留"]);
  } finally {
    app.unmount();
    host.remove();
  }
});

test("正文插表和表内调尺寸都可以直接点击网格", async () => {
  const key = "open-tools.notebook.v1";
  localStorage.setItem(key, JSON.stringify({
    version: 1, selectedId: "note",
    nodes: [{ id: "note", parentId: null, name: "笔记", kind: "note", markdown: "" }],
  }));
  const host = document.body.appendChild(document.createElement("div"));
  const app = createApp(Notebook).use(i18n);
  app.mount(host);
  try {
    await vi.waitFor(() => expect(host.querySelector(".ProseMirror")).not.toBeNull());
    host.querySelector<HTMLButtonElement>(".note-inserts button")!.click();
    const picker = () => document.querySelector<HTMLElement>(".table-picker");
    await vi.waitFor(() => expect(picker()).not.toBeNull());
    expect(host.querySelector("table")).toBeNull();
    picker()!.querySelector<HTMLButtonElement>('[data-rows="4"][data-columns="2"]')!.click();
    await vi.waitFor(() => expect(host.querySelectorAll("table tr")).toHaveLength(4));
    expect(host.querySelectorAll("table th")).toHaveLength(2);
    expect(host.querySelectorAll(".notebook-table-toolbar button")).toHaveLength(6);

    host.querySelector<HTMLButtonElement>('[data-table-tool="tableSize"]')!.click();
    const resize = () => document.querySelector<HTMLButtonElement>('.table-size-panel [data-rows="5"][data-columns="4"]');
    await vi.waitFor(() => expect(resize()).not.toBeNull());
    resize()!.click();
    await vi.waitFor(() => expect(host.querySelectorAll("table tr")).toHaveLength(5));
    expect(host.querySelectorAll("table th")).toHaveLength(4);
    expect(host.querySelector("table")?.textContent).toBe("");
  } finally {
    app.unmount();
    host.remove();
    localStorage.removeItem(key);
  }
});

test("Enter 移到同列下一行或跳出表格，Ctrl+Enter 在下方新增行并移到首列", async () => {
  const markdown = "| 甲 | 乙 | 丙 |\n| --- | --- | --- |\n| A1 | A2 | A3 |\n| B1 | B2 | B3 |";
  const editor = await makeNotebookEditor(document.createElement("div"), "note", markdown, () => "笔记正文", vi.fn()).create();
  try {
    editor.action(ctx => {
      const view = ctx.get(editorViewCtx);
      const enter = (ctrlKey = false) => view.dom.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", ctrlKey, bubbles: true, cancelable: true,
      }));
      selectTableCell(view, 0, 0, 1);
      expect(enter()).toBe(false);
      expect(selectedRect(view.state)).toMatchObject({ top: 1, left: 1 });
      expect(enter(true)).toBe(false);
      expect(selectedRect(view.state)).toMatchObject({ top: 2, left: 0 });
      expect(view.state.doc.firstChild?.child(2).textContent).toBe("");
      expect(view.state.doc.firstChild?.child(3).textContent).toBe("B1B2B3");
      selectTableCell(view, 0, 0, 2);
      expect(enter()).toBe(false);
      expect(isInTable(view.state)).toBe(false);
      expect(view.state.doc.lastChild?.type.name).toBe("paragraph");
      expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
      selectTableCell(view, 0, 3, 0);
      expect(enter()).toBe(false);
      expect(view.state.doc.childCount).toBe(2);
    });
  } finally {
    await editor.destroy();
  }
});

test("工具栏只在选中的表格上方显示，删除按钮直接删除选中的表格", async () => {
  const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [new DOMRect(0, 0, 1, 16)] });
  const host = document.body.appendChild(document.createElement("div"));
  const app = createApp(NotebookEditor, {
    id: "note", markdown: "| 保留 |\n| --- |\n\n| 删除 |\n| --- |",
  }).use(i18n);
  app.mount(host);
  try {
    await vi.waitFor(() => expect(host.querySelectorAll("table")).toHaveLength(2));
    const toolbar = () => host.querySelector(".notebook-table-toolbar-anchor");
    expect(toolbar()).toBeNull();
    const select = (index: number) => host.querySelectorAll("th")[index].dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, clientX: 40, clientY: 40,
    }));
    select(0);
    expect(toolbar()?.nextElementSibling?.querySelector("th")?.textContent).toBe("保留");
    select(1);
    expect(host.querySelectorAll(".notebook-table-toolbar-anchor")).toHaveLength(1);
    expect(toolbar()?.nextElementSibling?.querySelector("th")?.textContent).toBe("删除");
    await vi.waitFor(() => expect(document.querySelector(".table-menu")).not.toBeNull());
    host.querySelector<HTMLButtonElement>('[data-table-tool="tableDelete"]')!.click();
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect([...host.querySelectorAll("table th")].map(cell => cell.textContent)).toEqual(["保留"]);

    select(0);
    expect(toolbar()).not.toBeNull();
    host.querySelector(".ProseMirror")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(toolbar()).toBeNull();
  } finally {
    app.unmount();
    host.remove();
    if (rangeRects) Object.defineProperty(Range.prototype, "getClientRects", rangeRects);
    else Reflect.deleteProperty(Range.prototype, "getClientRects");
    scrollBy.mockRestore();
  }
});

test("只格式化选中的嵌套表格，保留其他内容和引用前缀", async () => {
  const markdown = "文字  原样\n\n|不变|\n|---|\n\n> |甲|乙|\n> |---|---|\n> |A|B|\n";
  const editor = await makeNotebookEditor(document.createElement("div"), "note", markdown, () => "笔记正文", vi.fn()).create();
  try {
    editor.action(ctx => {
      const view = ctx.get(editorViewCtx);
      const tables: number[] = [];
      view.state.doc.descendants((node, pos) => { if (node.type.name === "table") tables.push(pos); });
      selectTableCell(view, tables[1]);
      const formatted = formatSelectedTable(ctx, view, markdown);
      expect(formatted).toMatch(/^文字  原样\n\n\|不变\|\n\|---\|\n\n> \| 甲\s+\| 乙\s+\|\n> \|/);
      expect(ctx.get(parserCtx)(formatted).eq(view.state.doc)).toBe(true);
    });
  } finally {
    await editor.destroy();
  }
});

test("移动行列后光标跟随原单元格，并保留表头", async () => {
  const markdown = "| 甲 | 乙 |\n| --- | --- |\n| A1 | A2 |\n| B1 | B2 |";
  const editor = await makeNotebookEditor(document.createElement("div"), "note", markdown, () => "笔记正文", vi.fn()).create();
  try {
    editor.action(ctx => {
      const view = ctx.get(editorViewCtx);
      selectTableCell(view, 0, 1, 0);
      runTableAction(ctx, view, "tableMoveDown");
      expect(selectedRect(view.state)).toMatchObject({ top: 2, left: 0 });
      expect(view.state.selection.$from.parent.textContent).toBe("A1");
      runTableAction(ctx, view, "tableMoveRight");
      expect(selectedRect(view.state)).toMatchObject({ top: 2, left: 1 });
      expect(view.state.selection.$from.parent.textContent).toBe("A1");
      expect(view.state.doc.firstChild?.firstChild?.textContent).toBe("乙甲");
    });
  } finally {
    await editor.destroy();
  }
});
