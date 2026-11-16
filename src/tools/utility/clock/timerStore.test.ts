// @vitest-environment jsdom
import { nextTick } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { alerts, countdowns, removeCountdown, restart, startCountdownTicker, togglePause, addCountdown } from "./clockStore";
import { i18n } from "@/locales";
import { countdownTitle } from "./reminders";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
const notices = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/utils/desktopNotification", () => ({ notifyDesktop: notices.send }));

afterEach(() => { vi.useRealTimers(); localStorage.clear(); (i18n.global.locale as unknown as { value: string }).value = "zh-CN"; });

it("恢复保存的计时器，暂停期间不提醒，继续后仅提醒一次，重启及删除清理提醒", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T09:00:00"));
  localStorage.setItem("countdowns", JSON.stringify([
    { id: "tea", title: "泡茶", target: Date.now() + 5000, createdAt: Date.now(), duration: 5000, done: false, repeat: "none" },
  ]));
  await startCountdownTicker();
  expect(countdowns.value[0].duration).toBe(5000);
  await vi.advanceTimersByTimeAsync(2000);
  togglePause(countdowns.value[0]);
  await vi.advanceTimersByTimeAsync(10000);
  expect(alerts.value).toHaveLength(0);
  expect(countdowns.value[0].pausedRemaining).toBe(3000);
  togglePause(countdowns.value[0]);
  await vi.advanceTimersByTimeAsync(3000);
  expect(alerts.value.map(item => item.title)).toEqual(["泡茶"]);
  expect(countdowns.value[0].done).toBe(true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(notices.send).toHaveBeenCalledTimes(1);
  restart(countdowns.value[0]);
  expect(alerts.value).toHaveLength(0);
  await nextTick();
  expect(JSON.parse(localStorage.getItem("countdowns")!)[0]).toMatchObject({ duration: 5000, done: false });
  await vi.advanceTimersByTimeAsync(5000);
  expect(notices.send).toHaveBeenCalledTimes(2);
  removeCountdown("tea");
  expect(alerts.value).toHaveLength(0);
  expect(countdowns.value).toHaveLength(0);
  addCountdown({ title: "", defaultTitle: true, duration: 5000, target: Date.now() + 5000, repeat: "none" });
  (i18n.global.locale as unknown as { value: string }).value = "en";
  await vi.advanceTimersByTimeAsync(5000);
  expect(notices.send).toHaveBeenLastCalledWith("Clock reminder", "09:00 · 00:05 timer");
  expect(countdownTitle(alerts.value[0])).toBe("00:05 timer");
  (i18n.global.locale as unknown as { value: string }).value = "ja";
  expect(countdownTitle(alerts.value[0])).toBe("00:05 タイマー");
});
