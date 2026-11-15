import { beforeEach, expect, it, vi } from "vitest";
import type { TextController } from "./controller";
import { textWorkspace } from "./workspace";
import { changeEncoding, closeFile, closeAllFiles, closeTabGroup } from "./useLargeFile";

const mocks = vi.hoisted(() => ({
  state: { id: "session-1", encoding: "auto", busy: false }, dirty: { value: false },
  reopen: vi.fn(), save: vi.fn(), message: vi.fn(), showError: vi.fn(), status: { value: "idle" },
}));
const controller = { state: mocks.state, dirty: mocks.dirty, reopen: mocks.reopen, save: mocks.save } as unknown as TextController;
vi.mock("@tauri-apps/plugin-dialog", () => ({ message: mocks.message }));
vi.mock("@/locales", () => ({ t: (key: string) => key }));
vi.mock("@/composables/toolLibrary", () => ({ recordToolUsage: vi.fn() }));
vi.mock("@/utils/errorToast", () => ({ showError: mocks.showError, showNotice: vi.fn() }));
vi.mock("@/composables/useUpdater", () => ({ useUpdater: () => ({ status: mocks.status }) }));
beforeEach(() => {
  textWorkspace.tabs.splice(0); vi.resetAllMocks(); Object.assign(mocks.state, { id: "session-1", encoding: "auto", busy: false });
  mocks.dirty.value = false; mocks.status.value = "idle";
});
it("未打开文件时仅设置下次打开的编码", async () => {
  mocks.state.id = "";
  expect(await changeEncoding(controller, "Gbk")).toBe(true); expect(mocks.state.encoding).toBe("Gbk");
  expect(mocks.reopen).not.toHaveBeenCalled();
});
it("无修改时直接用新编码读取，不弹出文件选择框", async () => {
  expect(await changeEncoding(controller, "Gbk")).toBe(true);
  expect(mocks.reopen).toHaveBeenCalledWith("Gbk"); expect(mocks.message).not.toHaveBeenCalled();
});
it("取消切换时保留原编码且不重新读取", async () => {
  mocks.dirty.value = true; mocks.message.mockResolvedValue("largeText.cancelChoice");
  expect(await changeEncoding(controller, "Gbk")).toBe(false);
  expect(mocks.state.encoding).toBe("auto"); expect(mocks.reopen).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it("选择保存时先用原编码保存，再用新编码重新读取", async () => {
  mocks.dirty.value = true; mocks.message.mockResolvedValue("largeText.saveChoice");
  expect(await changeEncoding(controller, "Gbk")).toBe(true);
  expect(mocks.save).toHaveBeenCalledOnce(); expect(mocks.reopen).toHaveBeenCalledWith("Gbk");
  expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.reopen.mock.invocationCallOrder[0]);
});
it("选择放弃时不保存原文件，直接尝试重新读取", async () => {
  mocks.dirty.value = true; mocks.message.mockResolvedValue("largeText.discardChoice");
  expect(await changeEncoding(controller, "Gbk")).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.reopen).toHaveBeenCalledWith("Gbk");
});
it("保存失败时终止切换", async () => {
  mocks.dirty.value = true; mocks.message.mockResolvedValue("largeText.saveChoice"); mocks.save.mockRejectedValue(new Error("disk full"));
  expect(await changeEncoding(controller, "Gbk")).toBe(false); expect(mocks.reopen).not.toHaveBeenCalled();
});
it("读取失败时显示错误并解除确认锁，可再次切换", async () => {
  mocks.reopen.mockRejectedValueOnce(new Error("decode failed"));
  expect(await changeEncoding(controller, "Gbk")).toBe(false); expect(mocks.showError).toHaveBeenCalled();
  expect(await changeEncoding(controller, "Utf16Le")).toBe(true);
});
it("已有操作或更新正在进行时拒绝切换", async () => {
  mocks.state.busy = true; expect(await changeEncoding(controller, "Gbk")).toBe(false);
  mocks.state.busy = false; mocks.status.value = "downloading"; expect(await changeEncoding(controller, "Gbk")).toBe(false);
  expect(mocks.reopen).not.toHaveBeenCalled();
});

function tab(key: number, dirty = true) {
  const state = { id: `file-${key}`, info: { path: `C:\\${key}.txt` }, busy: false };
  const controller = {
    state, dirty: { value: dirty }, save: vi.fn(), close: vi.fn(async () => { state.id = ""; }),
  } as unknown as TextController;
  const value = { key, controller }; textWorkspace.tabs.push(value); textWorkspace.activate(value); return value;
}
it("关闭指定标签只处理该文件，不影响其他草稿", async () => {
  const a = tab(1); const b = tab(2);
  mocks.message.mockResolvedValue("largeText.discardChoice");
  expect(await closeFile(a.controller)).toBe(true);
  expect(a.controller.close).toHaveBeenCalledWith(true); expect(b.controller.close).not.toHaveBeenCalled();
  expect(textWorkspace.tabs).toEqual([b]); expect(b.controller.dirty.value).toBe(true);
});
it("退出时逐个提示文件，取消第二个后不关闭任何标签", async () => {
  const a = tab(1); const b = tab(2);
  mocks.message.mockResolvedValueOnce("largeText.discardChoice").mockResolvedValueOnce("largeText.cancelChoice");
  expect(await closeAllFiles()).toBe(false);
  expect(a.controller.close).not.toHaveBeenCalled(); expect(b.controller.close).not.toHaveBeenCalled();
  expect(textWorkspace.tabs).toHaveLength(2);
  expect(mocks.message.mock.calls[0][0]).toContain("1.txt"); expect(mocks.message.mock.calls[1][0]).toContain("2.txt");
});
it("全部同意后保存各自会话，再关闭全部文件", async () => {
  const a = tab(1); const b = tab(2);
  mocks.message.mockResolvedValue("largeText.saveChoice");
  expect(await closeAllFiles()).toBe(true);
  expect(a.controller.save).toHaveBeenCalledOnce(); expect(b.controller.save).toHaveBeenCalledOnce();
  expect(a.controller.close).toHaveBeenCalledOnce(); expect(b.controller.close).toHaveBeenCalledOnce(); expect(textWorkspace.tabs).toHaveLength(0);
});
it("任一后台标签仍有任务时拒绝关闭全部文件", async () => {
  const a = tab(1, false); const b = tab(2, false); a.controller.state.busy = true;
  expect(await closeAllFiles()).toBe(false);
  expect(b.controller.close).not.toHaveBeenCalled(); expect(mocks.message).not.toHaveBeenCalled(); expect(textWorkspace.tabs).toHaveLength(2);
});

it("关闭左侧以菜单所在标签为基准，保留该标签和右侧文件", async () => {
  const a = tab(1); const b = tab(2); const anchor = tab(3); const right = tab(4);
  mocks.message.mockResolvedValue("largeText.discardChoice");
  expect(await closeTabGroup(anchor.key, "left")).toBe(true);
  expect(a.controller.close).toHaveBeenCalledOnce(); expect(b.controller.close).toHaveBeenCalledOnce();
  expect(anchor.controller.close).not.toHaveBeenCalled(); expect(right.controller.close).not.toHaveBeenCalled();
  expect(textWorkspace.tabs).toEqual([anchor, right]); expect(textWorkspace.active.value).toBe(right);
});
it("关闭右侧不包含菜单所在标签，被关闭的活动标签会切回基准标签", async () => {
  const a = tab(1, false); const anchor = tab(2, false); const right = tab(3, false);
  expect(await closeTabGroup(anchor.key, "right")).toBe(true);
  expect(textWorkspace.tabs).toEqual([a, anchor]); expect(right.controller.close).toHaveBeenCalledOnce();
  expect(textWorkspace.active.value).toBe(anchor);
});
it("批量关闭中途取消时保留所有目标标签及非目标文件", async () => {
  const anchor = tab(1); const b = tab(2); const c = tab(3);
  mocks.message.mockResolvedValueOnce("largeText.discardChoice").mockResolvedValueOnce("largeText.cancelChoice");
  expect(await closeTabGroup(anchor.key, "right")).toBe(false);
  expect(textWorkspace.tabs).toHaveLength(3); expect(anchor.controller.close).not.toHaveBeenCalled();
  expect(b.controller.close).not.toHaveBeenCalled(); expect(c.controller.close).not.toHaveBeenCalled();
});
it("目标文件有任务时不关闭任何标签；边界侧没有标签时直接返回", async () => {
  const anchor = tab(1, false); const busy = tab(2, false); busy.controller.state.busy = true;
  expect(await closeTabGroup(anchor.key, "right")).toBe(false);
  expect(anchor.controller.close).not.toHaveBeenCalled(); expect(busy.controller.close).not.toHaveBeenCalled();
  expect(await closeTabGroup(anchor.key, "left")).toBe(true); expect(textWorkspace.tabs).toHaveLength(2);
});
it("菜单关闭当前是关闭被点击的标签，不影响另一个活动标签", async () => {
  const a = tab(1, false); const b = tab(2, false);
  expect(await closeTabGroup(a.key, "current")).toBe(true);
  expect(a.controller.close).toHaveBeenCalledOnce(); expect(b.controller.close).not.toHaveBeenCalled();
  expect(textWorkspace.active.value).toBe(b);
});
