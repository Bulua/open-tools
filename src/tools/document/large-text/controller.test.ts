import { ChangeSet } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import type { invoke } from "@tauri-apps/api/core";
import { createTextController } from "./controller";
import type { FileInfo, OpenedFile, TextBlock } from "./types";

const baseInfo: FileInfo = { path: "C:\\data\\large.txt", size: 10, encoding: "Utf8", newline: "CRLF", revision: 0, dirty: false, canUndo: false, canRedo: false, readonly: false, bom: 0 };
const baseBlock: TextBlock = { start: 0, end: 10, firstLine: 1, continuation: false, text: "original", revision: 0 };
function setup() {
  let info = { ...baseInfo }; let block = { ...baseBlock };
  const call = vi.fn(async (name: string, args?: Record<string, unknown>): Promise<unknown> => {
    if (name === "large_text_open") return { id: "session-1", info: { ...info }, block: { ...block } } satisfies OpenedFile;
    if (name === "large_text_edit") { info = { ...info, size: 12, revision: info.revision + 1, dirty: true, canUndo: true }; block = { ...block, text: String(args?.text), end: 12, revision: info.revision }; return { ...info }; }
    if (name === "large_text_read") return { ...block, start: Number(args?.start ?? 0) };
    if (name === "large_text_save") { info = { ...info, dirty: false }; return { info: { ...info }, backup: "C:\\data\\backup.bak" }; }
    return undefined;
  });
  return { call, controller: createTextController(call as typeof invoke) };
}

describe("大文本文件会话", () => {
  it("切换块前先将当前草稿和对应版本提交给原生端", async () => {
    const { call, controller: c } = setup(); await c.open(baseInfo.path, "auto"); c.changed("modified"); await c.page("next");
    const names = call.mock.calls.map(([name]) => name);
    expect(names).toEqual(["large_text_open", "large_text_pending", "large_text_edit", "large_text_read", "large_text_read"]);
    expect(call.mock.calls[2][1]).toEqual({ id: "session-1", revision: 0, start: 0, end: 10, text: "modified", changes: [{ from: 0, to: 8, text: "modified" }] });
    expect(call.mock.calls[4][1]).toEqual({ id: "session-1", revision: 1, start: 12 });
  });
  it("保存调用同一会话的原文件命令，保留备份信息", async () => {
    const { call, controller: c } = setup(); await c.open(baseInfo.path, "Utf8"); c.changed("modified"); await c.save();
    expect(call).toHaveBeenCalledWith("large_text_save", { id: "session-1", revision: 1 });
    expect(c.state.info?.path).toBe(baseInfo.path); expect(c.dirty.value).toBe(false); expect(c.state.backup).toBe("C:\\data\\backup.bak");
  });
  it("保存失败后保留修改，重试时不重复提交同一编辑", async () => {
    const { call, controller: c } = setup(); await c.open(baseInfo.path, "auto"); c.changed("modified");
    const real = call.getMockImplementation()!; let failed = false;
    call.mockImplementation(async (name, args) => { if (name === "large_text_save" && !failed) { failed = true; throw new Error("disk full"); } return real(name, args); });
    await expect(c.save()).rejects.toThrow("disk full");
    expect(c.state.draft).toBe("modified"); expect(c.dirty.value).toBe(true); expect(c.state.block?.end).toBe(12);
    await c.save(); expect(call.mock.calls.filter(([name]) => name === "large_text_edit")).toHaveLength(1);
  });
  it("块读取失败不会丢失已暂存文本或错误地沿用旧字节范围", async () => {
    const { call, controller: c } = setup(); await c.open(baseInfo.path, "auto"); c.changed("modified");
    const real = call.getMockImplementation()!; let fail = true;
    call.mockImplementation(async (name, args) => { if (name === "large_text_read" && fail) { fail = false; throw new Error("read failed"); } return real(name, args); });
    await expect(c.page("next")).rejects.toThrow("read failed");
    expect(c.state.draft).toBe("modified"); expect(c.state.block?.end).toBe(12);
    c.changed("another edit"); await c.save();
    const edits = call.mock.calls.filter(([name]) => name === "large_text_edit");
    expect(edits[1][1]).toMatchObject({ start: 0, end: 12, revision: 1, text: "another edit" });
  });
  it("长任务执行时仍可独立发送取消请求", async () => {
    const { call, controller: c } = setup(); await c.open(baseInfo.path, "auto");
    const real = call.getMockImplementation()!; let finish!: (value: unknown) => void;
    call.mockImplementation((name, args) => name === "large_text_search" ? new Promise((resolve) => { finish = resolve; }) : real(name, args));
    const searching = c.search("needle", 0); await vi.waitFor(() => expect(finish).toBeDefined());
    expect(c.state.busy).toBe(true); await c.cancel(); expect(call).toHaveBeenCalledWith("large_text_cancel", { id: "session-1" });
    finish({ found: null, block: null }); await searching; expect(c.state.busy).toBe(false);
  });
});


it("组合多次局部编辑，向后端保留原始块中未修改的间隔", async () => {
  const { call, controller: c } = setup(); await c.open(baseInfo.path, "auto");
  c.changed("Ariginal", ChangeSet.of({ from: 0, to: 1, insert: "A" }, 8));
  c.changed("AriginaL", ChangeSet.of({ from: 7, to: 8, insert: "L" }, 8));
  await c.save();
  expect(call.mock.calls.find(([name]) => name === "large_text_edit")?.[1]?.changes).toEqual([
    { from: 0, to: 1, text: "A" }, { from: 7, to: 8, text: "L" },
  ]);
});

it("切换编码先读取新会话，成功后关闭旧会话并显示新文本", async () => {
  const { call, controller: c } = setup(); await c.open(baseInfo.path, "auto");
  const file: OpenedFile = { id: "session-2", info: { ...baseInfo, encoding: "Gbk" }, block: { ...baseBlock, text: "正确的中文" } };
  call.mockImplementationOnce(async () => file);
  await c.reopen("Gbk");
  expect(call.mock.calls.slice(-2)).toEqual([
    ["large_text_open", { path: baseInfo.path, encoding: "Gbk" }],
    ["large_text_close", { id: "session-1", discard: true }],
  ]);
  expect(c.state.id).toBe("session-2"); expect(c.state.encoding).toBe("Gbk"); expect(c.state.draft).toBe("正确的中文");
});
it("新编码解码失败时保留旧会话、编码和未保存草稿", async () => {
  const { call, controller: c } = setup(); await c.open(baseInfo.path, "auto");
  c.changed("unsaved"); await Promise.resolve(); await Promise.resolve();
  const real = call.getMockImplementation()!;
  call.mockImplementation(async (name, args) => { if (name === "large_text_open") throw new Error("Invalid encoding"); return real(name, args); });
  await expect(c.reopen("Gbk")).rejects.toThrow("Invalid encoding");
  expect(c.state.id).toBe("session-1"); expect(c.state.encoding).toBe("auto"); expect(c.state.draft).toBe("unsaved"); expect(c.dirty.value).toBe(true);
  expect(call.mock.calls.some(([name]) => name === "large_text_close")).toBe(false);
});
it("关闭旧会话失败时清理候选会话并保留原会话", async () => {
  const { call, controller: c } = setup(); await c.open(baseInfo.path, "auto");
  call.mockImplementation(async (name, args) => {
    if (name === "large_text_open") return { id: "session-2", info: baseInfo, block: baseBlock };
    if (name === "large_text_close" && args?.id === "session-1") throw new Error("busy");
  });
  await expect(c.reopen("Gbk")).rejects.toThrow("busy");
  expect(c.state.id).toBe("session-1"); expect(c.state.encoding).toBe("auto");
  expect(call).toHaveBeenCalledWith("large_text_close", { id: "session-2", discard: true });
});
