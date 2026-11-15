import { expect, it, vi } from "vitest";
import { clipboardShortcut, groupClipboardHistory, registerClipboardShortcut } from "./clipboardHistory";

const native = vi.hoisted(() => ({ register: vi.fn(), unregister: vi.fn() }));
vi.mock("@tauri-apps/plugin-global-shortcut", () => native);

it("按本地日期和小时归档并保留各组的倒序", () => {
  const entries = [
    { id: 3, preview: "新记录", copiedAt: new Date(2026, 10, 10, 0, 10).getTime() },
    { id: 2, preview: "旧记录", copiedAt: new Date(2026, 10, 9, 23, 50).getTime() },
    { id: 1, preview: "旧记录", copiedAt: new Date(2026, 10, 9, 12, 30).getTime() },
    { id: 0, preview: "同一小时的记录", copiedAt: new Date(2026, 10, 9, 12, 20).getTime() },
  ];
  expect(groupClipboardHistory(entries).map(({ date, hours }) => ({
    day: date.getDate(),
    hours: hours.map(({ hour, entries }) => [hour, entries.map(({ id }) => id)]),
  }))).toEqual([{ day: 10, hours: [[0, [3]]] }, { day: 9, hours: [[23, [2]], [12, [1, 0]]] }]);
});

it("保存自定义快捷键，注册冲突时保留已有组合", async () => {
  await registerClipboardShortcut();
  await registerClipboardShortcut("Ctrl+Shift+J");
  expect(native.unregister).toHaveBeenCalledWith("Ctrl+Alt+V");
  expect(clipboardShortcut.value).toBe("Ctrl+Shift+J");

  native.register.mockRejectedValueOnce(new Error("occupied"));
  await expect(registerClipboardShortcut("Ctrl+Shift+K")).rejects.toThrow("occupied");
  expect(native.unregister).not.toHaveBeenCalledWith("Ctrl+Shift+J");
  expect(clipboardShortcut.value).toBe("Ctrl+Shift+J");
});
