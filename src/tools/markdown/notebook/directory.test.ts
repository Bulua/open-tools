// @vitest-environment jsdom
import { createApp } from "vue";
import { expect, test, vi } from "vitest";
import { i18n } from "@/locales";
import Notebook from "./Notebook.vue";
import type { Notebook as NotebookData } from "./notebook";

let stored: string | null = null;
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (command: string, args?: { data: string }) => {
    if (command === "notebook_read") return stored;
    if (command === "notebook_write" && args) { stored = args.data; return; }
    throw new Error(command);
  },
}));

test("从目录空白和折叠文件夹右键新建笔记，自动编号并聚焦行内名称", async () => {
  stored = JSON.stringify({
    version: 1, selectedId: null,
    nodes: [
      { id: "folder", parentId: null, name: "工作", kind: "folder", collapsed: true },
      { id: "root-note", parentId: null, name: "未命名笔记.md", kind: "note", markdown: "" },
      { id: "folder-note", parentId: "folder", name: "Draft.MD", kind: "note", markdown: "" },
    ],
  });
  const host = document.body.appendChild(document.createElement("div"));
  const app = createApp(Notebook).use(i18n);
  app.mount(host);
  const saved = () => JSON.parse(stored!) as NotebookData;
  const input = () => host.querySelector<HTMLInputElement>(".rename-input");

  async function create(origin: Element) {
    origin.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const item = () => [...document.querySelectorAll<HTMLButtonElement>(".directory-menu:not([inert]):not(.pop-leave-active) button")]
      .find(button => button.textContent?.trim() === "新建笔记");
    await vi.waitFor(() => expect(item()).toBeDefined());
    item()!.click();
    await vi.waitFor(() => {
      expect(input()).not.toBeNull();
      expect(document.activeElement).toBe(input());
    });
    expect(input()?.selectionStart).toBe(0);
    expect(input()?.selectionEnd).toBe(input()?.value.length);
    expect(host.querySelector("dialog[open]")).toBeNull();
  }

  try {
    await vi.waitFor(() => expect(host.querySelector(".directory-list")).not.toBeNull());
    expect(host.querySelector(".notice button")).toBeNull();
    await create(host.querySelector(".directory-list")!);
    expect(input()?.value).toBe("未命名笔记 (2)");
    await vi.waitFor(() => expect(saved().nodes.find(node => node.id === saved().selectedId)?.parentId).toBeNull());

    await create(host.querySelector('[data-entry="folder"]')!);
    expect(input()?.value).toBe("未命名笔记");
    input()!.value = "draft.md";
    input()!.dispatchEvent(new Event("input", { bubbles: true }));
    input()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(saved().nodes.find(node => node.id === saved().selectedId)).toMatchObject({
      parentId: "folder", name: "draft (2).md",
    }));
    expect(saved().nodes.find(node => node.id === "folder")).toMatchObject({ collapsed: false });
  } finally {
    app.unmount();
    host.remove();
  }
});
