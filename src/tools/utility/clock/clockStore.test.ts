// @vitest-environment jsdom
import { nextTick } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { alerts, countdowns, saveAlarm, startCountdownTicker, toggleAlarm } from "./clockStore";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
const notices = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined), error: vi.fn() }));
vi.mock("@/utils/desktopNotification", () => ({ notifyDesktop: notices.send }));
vi.mock("@/utils/errorToast", () => ({ showError: notices.error }));
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

it("持久保存闹钟，单次到期关闭、周重复排期、停用不提醒，编辑和重启可重新启用", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T08:59:59"));
  await startCountdownTicker();
  saveAlarm({ time: "09:00", weekdays: [] }, "单次");
  saveAlarm({ time: "09:00", weekdays: [1, 3] }, "重复");
  saveAlarm({ time: "09:00", weekdays: [1] }, "停用");
  const [once, weekly, disabled] = countdowns.value;
  toggleAlarm(disabled);
  await nextTick();
  expect(JSON.parse(localStorage.getItem("countdowns")!)).toHaveLength(3);
  await vi.advanceTimersByTimeAsync(1000);
  expect(alerts.value.map(a => a.title)).toEqual(["单次", "重复"]);
  expect(notices.send).toHaveBeenCalledTimes(2);
  expect(notices.send).toHaveBeenCalledWith("时钟提醒", "09:00 · 单次");
  expect(notices.send).toHaveBeenCalledWith("时钟提醒", "09:00 · 重复");
  await vi.advanceTimersByTimeAsync(1000);
  expect(notices.send).toHaveBeenCalledTimes(2);
  expect(countdowns.value.find(c => c.id === once.id)).toMatchObject({ done: true, enabled: false });
  expect(countdowns.value.find(c => c.id === weekly.id)?.target).toBe(new Date("2026-11-18T09:00:00").getTime());
  toggleAlarm(countdowns.value.find(c => c.id === once.id)!);
  expect(countdowns.value.find(c => c.id === once.id)).toMatchObject({ done: false, enabled: true, target: new Date("2026-11-17T09:00:00").getTime() });
  saveAlarm({ time: "10:00", weekdays: [2] }, "修改后", weekly.id);
  expect(countdowns.value).toHaveLength(3);
  expect(countdowns.value.find(c => c.id === weekly.id)?.title).toBe("修改后");
  expect(alerts.value.some(a => a.id === weekly.id)).toBe(false);
  notices.send.mockRejectedValueOnce(new Error("Toast unavailable"));
  saveAlarm({ time: "09:01", weekdays: [] }, "通知失败仍提醒");
  await vi.advanceTimersByTimeAsync(59000);
  expect(notices.error).toHaveBeenCalledWith(expect.any(Error), "无法发送桌面提醒");
  expect(alerts.value.some(a => a.title === "通知失败仍提醒")).toBe(true);
  expect(countdowns.value.find(c => c.title === "通知失败仍提醒")).toMatchObject({ done: true, enabled: false });
  expect(notices.send).toHaveBeenCalledTimes(3);
});
