// @vitest-environment jsdom
import { createApp, nextTick, reactive } from "vue";
import { expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import type { Folder, Node, Note } from "../notebook";
import NotebookDirectory from "./NotebookDirectory.vue";

it("空白处仅右键打开根目录新建菜单，项目菜单只操作目标项目", async () => {
  const active: Note = { id: "active", name: "当前笔记", kind: "note", markdown: "", parentId: null };
  const other: Note = { id: "other", name: "另一篇笔记", kind: "note", markdown: "", parentId: null };
  const folder = reactive<Folder>({ id: "folder", name: "目录", kind: "folder", parentId: null, collapsed: true });
  const child: Note = { id: "child", name: "目录中的笔记", kind: "note", markdown: "", parentId: folder.id };
  const onSelect = vi.fn();
  const onAdd = vi.fn();
  const onRename = vi.fn();
  const onDelete = vi.fn();
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp(NotebookDirectory, {
    nodes: [active, other, folder, child], selectedId: active.id, width: 250, onSelect, onAdd, onRename, onDelete,
    onToggle: (node: Node) => { if (node.kind === "folder") node.collapsed = !node.collapsed; },
  }).use(i18n);
  app.mount(root);

  const menuItems = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  const openMenu = async (target: HTMLElement) => {
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 80 }));
    await vi.waitFor(() => expect(menuItems()).toHaveLength(2));
  };

  try {
    const blank = root.querySelector<HTMLElement>("ul")!;
    blank.click();
    await nextTick();
    expect(menuItems()).toHaveLength(0);
    await openMenu(blank);
    expect(menuItems().map(item => item.textContent?.trim())).toEqual(["新建文件夹", "新建笔记"]);
    menuItems()[1].click();
    await nextTick();
    expect(onAdd).toHaveBeenCalledWith("note", true);

    const entry = root.querySelector<HTMLButtonElement>('[data-entry="other"]')!;
    await openMenu(entry);
    expect(menuItems().map(item => item.textContent?.trim())).toEqual(["重命名", "删除"]);
    menuItems()[1].click();
    await nextTick();
    expect(onDelete).toHaveBeenCalledWith(other);

    await openMenu(entry);
    menuItems()[0].click();
    await nextTick();
    const input = root.querySelector<HTMLInputElement>("input")!;
    input.value = "改完的名字";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await nextTick();
    expect(onRename).toHaveBeenCalledWith("other", "改完的名字");
    expect(onSelect).not.toHaveBeenCalled();

    const folderEntry = root.querySelector<HTMLButtonElement>('[data-entry="folder"]')!;
    folderEntry.click();
    await nextTick();
    expect(root.querySelector('[data-entry="child"]')).not.toBeNull();
    folderEntry.closest("li")?.click();
    await nextTick();
    expect(root.querySelector('[data-entry="child"]')).toBeNull();
  } finally {
    app.unmount();
    root.remove();
  }
});
