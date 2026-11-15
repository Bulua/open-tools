import { expect, it, vi } from "vitest";
import type { invoke } from "@tauri-apps/api/core";
import { ChangeSet, Text } from "@codemirror/state";
import { createTextController } from "./controller";
import type { FileInfo, TextBlock } from "./types";

const BLOCK = 256 * 1024;
function setup() {
  let data = ["A", "B", "C", "D", "E"].map((letter) => letter.repeat(BLOCK)).join("");
  let info: FileInfo = { path: "C:\\scroll.txt", size: data.length, encoding: "Utf8", newline: "LF", revision: 0, dirty: false, canUndo: false, canRedo: false, readonly: false, bom: 0 };
  const block = (start: number, limit = data.length): TextBlock => {
    const end = Math.min(start + BLOCK, limit, data.length);
    return { start, end, text: data.slice(start, end), revision: info.revision, firstLine: 1, continuation: start > 0 };
  };
  const call = vi.fn(async (name: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    if (name === "large_text_open") return { id: "scroll-session", info: { ...info }, block: block(0) };
    if (name === "large_text_jump") return block(Number(args.line) === 1 ? 0 : 3 * BLOCK);
    if (name === "large_text_read") return block(Number(args.start), args.end === undefined ? undefined : Number(args.end));
    if (name === "large_text_save") { info = { ...info, dirty: false }; return { info: { ...info }, backup: "" }; }
    if (name === "large_text_edit") {
      data = data.slice(0, Number(args.start)) + String(args.text) + data.slice(Number(args.end));
      info = { ...info, size: data.length, revision: info.revision + 1, dirty: true, canUndo: true };
      return { ...info };
    }
  });
  return { call, controller: createTextController(call as typeof invoke), data: () => data };
}
it("连续向下接入内容并只保留三块，向上重新加载被移除内容", async () => {
  const { controller: c, data } = setup(); await c.open("C:\\scroll.txt", "auto");
  const shifts = [];
  for (let i = 0; i < 4; i++) {
    shifts.push(await c.scroll("next"));
    expect(c.state.draft).toBe(data().slice(c.state.block!.start, c.state.block!.end));
    expect(c.state.draft.length).toBeLessThanOrEqual(3 * BLOCK);
  }
  expect(shifts).toEqual([0, 0, -BLOCK, -BLOCK]);
  expect(c.state.block!.start).toBe(2 * BLOCK); expect(c.state.block!.end).toBe(5 * BLOCK);
  expect(await c.scroll("previous")).toBe(BLOCK);
  expect(c.state.draft).toBe(data().slice(BLOCK, 4 * BLOCK));
  expect(await c.scroll("previous")).toBe(BLOCK);
  expect(c.state.draft).toBe(data().slice(0, 3 * BLOCK));
});
it("文件开头和末尾停止请求，避免反复加载", async () => {
  const { call, controller: c } = setup(); await c.open("C:\\scroll.txt", "auto");
  expect(await c.scroll("previous")).toBe(0);
  expect(call.mock.calls.filter(([name]) => name === "large_text_read")).toHaveLength(0);
  for (let i = 0; i < 4; i++) await c.scroll("next");
  const reads = call.mock.calls.length;
  expect(await c.scroll("next")).toBe(0); expect(call.mock.calls.length).toBe(reads);
});
it("滚动前暂存修改，按新字节范围重建窗口且不保存原文件", async () => {
  const { call, controller: c, data } = setup(); await c.open("C:\\scroll.txt", "auto");
  await c.scroll("next"); await c.scroll("next");
  const delta = ChangeSet.of({ from: BLOCK + 1, to: BLOCK + 2, insert: "!!" }, c.state.draft.length);
  c.changed(delta.apply(Text.of([c.state.draft])).toString(), delta);
  await c.scroll("next");
  expect(data().slice(BLOCK, BLOCK + 4)).toBe("B!!B");
  expect(c.state.draft).toBe(data().slice(c.state.block!.start, c.state.block!.end));
  expect(c.state.draft.length).toBeLessThanOrEqual(3 * BLOCK);
  expect(c.dirty.value).toBe(true);
  expect(call.mock.calls.some(([name]) => name === "large_text_save")).toBe(false);
});
it("读取下一块失败时保留当前窗口和草稿，之后可重试", async () => {
  const { call, controller: c } = setup(); await c.open("C:\\scroll.txt", "auto");
  const original = c.state.draft;
  call.mockRejectedValueOnce(new Error("read failed"));
  await expect(c.scroll("next")).rejects.toThrow("read failed");
  expect(c.state.draft).toBe(original); expect(c.state.block!.start).toBe(0); expect(c.state.busy).toBe(false);
  await c.scroll("next"); expect(c.state.block!.end).toBe(2 * BLOCK);
});
it("加载期间拒绝重复请求", async () => {
  const { call, controller: c } = setup(); await c.open("C:\\scroll.txt", "auto");
  let complete!: (value: TextBlock) => void;
  call.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  const loading = c.scroll("next"); await vi.waitFor(() => expect(complete).toBeDefined());
  await expect(c.scroll("next")).rejects.toThrow("Another file operation");
  complete({ start: BLOCK, end: 2 * BLOCK, text: "B".repeat(BLOCK), firstLine: 1, continuation: true, revision: 0 });
  await loading;
  expect(c.state.draft.length).toBe(2 * BLOCK);
});

it("保存保留连续窗口和编辑器实例，避免跳回窗口第一块", async () => {
  const { call, controller: c } = setup(); await c.open("C:\\scroll.txt", "auto");
  await c.scroll("next"); await c.scroll("next");
  const original = c.state.draft;
  c.changed(original + "!", ChangeSet.of({ from: original.length, insert: "!" }, original.length));
  const generation = c.state.generation; const reads = call.mock.calls.filter(([name]) => name === "large_text_read").length;
  await c.save();
  expect(c.state.generation).toBe(generation); expect(c.state.draft).toBe(original + "!");
  expect(c.state.block!.end).toBe(3 * BLOCK + 1); expect(c.dirty.value).toBe(false);
  expect(call.mock.calls.filter(([name]) => name === "large_text_read")).toHaveLength(reads);
});


it("跳转只加载目标块，向上滚动才请求前文并连续加载到文件开头", async () => {
  const { controller: c, call, data } = setup(); await c.open("C:\\scroll.txt", "auto");
  await c.jump(10000);
  expect(c.state.block!.start).toBe(3 * BLOCK);
  expect(c.state.draft).toBe("D".repeat(BLOCK));
  expect(call.mock.calls.filter(([name]) => name === "large_text_read")).toHaveLength(0);
  expect(await c.scroll("previous")).toBe(BLOCK);
  expect(call).toHaveBeenCalledWith("large_text_read", { id: "scroll-session", revision: 0, start: 2 * BLOCK, end: 3 * BLOCK });
  expect(c.state.draft).toBe(data().slice(2 * BLOCK, 4 * BLOCK));
  expect(await c.scroll("previous")).toBe(BLOCK);
  expect(c.state.draft).toBe(data().slice(BLOCK, 4 * BLOCK));
  expect(await c.scroll("previous")).toBe(BLOCK);
  expect(c.state.block!.start).toBe(0);
  expect(c.state.draft).toBe(data().slice(0, 3 * BLOCK));
  expect(await c.scroll("previous")).toBe(0);
});
