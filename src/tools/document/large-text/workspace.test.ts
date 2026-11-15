import { expect, it, vi } from "vitest";
import type { invoke } from "@tauri-apps/api/core";
import { createTextWorkspace, MAX_TEXT_TABS } from "./workspace";

function setup() {
  let nextId = 1;
  const call = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === "large_text_open") return {
      id: `session-${nextId++}`,
      info: { path: String(args.path), size: 4, encoding: args.encoding === "auto" ? "Utf8" : args.encoding, newline: "LF", revision: 0, dirty: false, canUndo: false, canRedo: false, readonly: false, bom: 0 },
      block: { start: 0, end: 4, text: "text", firstLine: 1, continuation: false, revision: 0 },
    };
  });
  return { call, workspace: createTextWorkspace(call as typeof invoke) };
}
it("每个文件独立保存编码、草稿、查找及跳转输入，切换不关闭其他文件", async () => {
  const { call, workspace: w } = setup();
  const a = await w.open("C:\\a.txt", "Utf8"); const b = await w.open("C:\\b.txt", "Gbk");
  a.controller.changed("A draft"); a.controller.state.query = "needle A"; a.controller.state.lineInput = "100";
  b.controller.changed("B draft"); b.controller.state.query = "needle B"; b.controller.state.lineInput = "500";
  w.activate(a);
  expect(w.active.value).toBe(a); expect(a.controller.state.encoding).toBe("Utf8"); expect(a.controller.state.draft).toBe("A draft");
  w.activate(b);
  expect(b.controller.state.encoding).toBe("Gbk"); expect(b.controller.state.draft).toBe("B draft");
  expect(a.controller.state.query).toBe("needle A"); expect(b.controller.state.lineInput).toBe("500");
  expect(call.mock.calls.some(([name]) => name === "large_text_close")).toBe(false);
});
it("重新指定一个标签的编码不会影响其他标签", async () => {
  const { workspace: w } = setup();
  const a = await w.open("C:\\a.txt", "auto"); const b = await w.open("C:\\b.txt", "Gbk");
  b.controller.changed("keep B");
  await a.controller.reopen("Utf16Le");
  expect(a.controller.state.encoding).toBe("Utf16Le"); expect(b.controller.state.encoding).toBe("Gbk"); expect(b.controller.state.draft).toBe("keep B");
  expect(w.tabs[0]!.key).toBe(a.key);
});
it("重复打开已有 Windows 路径只激活原标签并保留修改", async () => {
  const { call, workspace: w } = setup();
  const a = await w.open("C:\\a.txt", "Utf8"); a.controller.changed("keep draft");
  const b = await w.open("C:/A.TXT", "Gbk");
  expect(b).toBe(a); expect(w.tabs).toHaveLength(1); expect(a.controller.state.encoding).toBe("Utf8"); expect(a.controller.state.draft).toBe("keep draft");
  expect(call.mock.calls.filter(([name]) => name === "large_text_open")).toHaveLength(1);
});
it("规范路径相同的候选会话会清理，并返回已有标签", async () => {
  const { call, workspace: w } = setup();
  const a = await w.open("C:\\a.txt", "Utf8");
  const real = call.getMockImplementation()!;
  call.mockImplementation(async (name, args) => name === "large_text_open" ? real(name, { ...args, path: "C:\\a.txt" }) : real(name, args));
  expect(await w.open("alias.txt", "Gbk")).toBe(a); expect(w.tabs).toHaveLength(1);
  expect(call).toHaveBeenCalledWith("large_text_close", { id: "session-2", discard: true });
});
it("打开失败不丢失已有标签，关闭一个标签只移除该标签", async () => {
  const { call, workspace: w } = setup();
  const a = await w.open("C:\\a.txt", "Utf8"); const b = await w.open("C:\\b.txt", "Gbk");
  call.mockRejectedValueOnce(new Error("decode failed"));
  await expect(w.open("C:\\c.txt", "Utf8")).rejects.toThrow("decode failed");
  expect(w.tabs).toHaveLength(2); expect(w.active.value).toBe(b); expect(w.opening.value).toBe(false);
  await b.controller.close(true); w.remove(b.controller);
  expect(w.active.value).toBe(a); expect(a.controller.state.id).toBe("session-1");
});
it("标签数量上限只阻止新文件，不影响切回已有文件", async () => {
  const { workspace: w } = setup();
  for (let n = 0; n < MAX_TEXT_TABS; n++) await w.open(`C:\\${n}.txt`, "auto");
  await expect(w.open("C:\\extra.txt", "auto")).rejects.toThrow("maximum 8 tabs");
  expect(await w.open("C:\\0.txt", "auto")).toBe(w.tabs[0]); expect(w.tabs).toHaveLength(MAX_TEXT_TABS);
});

it("Windows 长路径前缀不会导致同一文件出现两个标签", async () => {
  const { call, workspace: w } = setup();
  const real = call.getMockImplementation()!;
  call.mockImplementation(async (name, args) => name === "large_text_open" ? real(name, { ...args, path: "\\\\?\\C:\\a.txt" }) : real(name, args));
  const a = await w.open("C:\\a.txt", "Utf8");
  expect(await w.open("C:/a.txt", "Gbk")).toBe(a); expect(w.tabs).toHaveLength(1);
  expect(call.mock.calls.filter(([name]) => name === "large_text_open")).toHaveLength(1);
});
