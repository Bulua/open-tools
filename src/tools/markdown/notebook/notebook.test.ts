import { expect, it } from "vitest";
import { directoryRows, moveEntry, readNotebook, subtree, type Notebook } from "./notebook";

const saved: Notebook = {
  version: 1, selectedId: "third",
  nodes: [
    { id: "first", kind: "folder", name: "项目", parentId: null, collapsed: true },
    { id: "second", kind: "folder", name: "记录", parentId: "first", collapsed: false },
    { id: "third", kind: "note", name: "笔记", parentId: "second", markdown: "# 标题\n\n**文字**\n" },
  ],
};

it("恢复目录和 Markdown 原文，折叠目录仍包含隐藏的后代", () => {
  const reopened = readNotebook(JSON.stringify(saved));
  expect(reopened).toEqual(saved);
  expect(directoryRows(reopened.nodes).map(row => row.node.id)).toEqual(["first"]);
  expect(subtree(reopened.nodes, "first")).toEqual(new Set(["first", "second", "third"]));
});

it("拒绝带有循环目录的存档", () => {
  const broken = { ...saved, nodes: [{ ...saved.nodes[0], parentId: "second" }, ...saved.nodes.slice(1)] };
  expect(() => readNotebook(JSON.stringify(broken))).toThrow("Invalid notebook hierarchy");
});

it("保留目录的后代和笔记正文，支持向文件夹、同层边缘及根目录拖放", () => {
  const notebook = readNotebook(JSON.stringify(saved));
  const rootNote = { id: "fourth", name: "另一篇", kind: "note" as const, parentId: null, markdown: "正文" };
  notebook.nodes.push(rootNote);

  expect(moveEntry(notebook, "first", { id: "second", position: "inside" })).toBe(false);
  expect(moveEntry(notebook, "first", { id: "third", position: "after" })).toBe(false);
  expect(moveEntry(notebook, "first", { id: "fourth", position: "inside" })).toBe(false);
  expect(moveEntry(notebook, "fourth", { id: "first", position: "before" })).toBe(true);
  expect(directoryRows(notebook.nodes).map(({ node }) => node.id)).toEqual(["fourth", "first"]);

  expect(moveEntry(notebook, "fourth", { id: "first", position: "inside" })).toBe(true);
  expect(directoryRows(notebook.nodes).map(({ node }) => node.id)).toEqual(["first", "second", "third", "fourth"]);
  expect(rootNote.parentId).toBe("first");

  expect(moveEntry(notebook, "second", null)).toBe(true);
  expect(directoryRows(notebook.nodes).map(({ node, depth }) => [node.id, depth])).toEqual([
    ["first", 0], ["fourth", 1], ["second", 0], ["third", 1],
  ]);
  expect(notebook.selectedId).toBe("third");
  expect(notebook.nodes.find(node => node.id === "third")).toEqual(saved.nodes[2]);
  expect(rootNote.markdown).toBe("正文");
});
