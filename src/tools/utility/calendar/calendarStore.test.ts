// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("当天的节日和备注各提醒一次，之后保存的当天备注仍会提醒", async () => {
  vi.stubGlobal("navigator", { userAgent: "Windows" });
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 1, 12));
  let revision = 0;
  let wake: (() => void) | undefined;
  invoke.mockImplementation(async (command: string, args?: { delayMs: number; revision: number }) => {
    if (command === "calendar_wake") {
      revision++;
      wake?.();
    }
    if (command === "calendar_wait") {
      if (args?.revision === revision) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => wake?.(), args.delayMs);
          wake = () => {
            clearTimeout(timer);
            wake = undefined;
            resolve();
          };
        });
      }
      return revision;
    }
    return command === "calendar_read" ? null : undefined;
  });

  const { startCalendarReminders, saveCalendarNote } = await import("./calendarStore");
  const popups = () => invoke.mock.calls.filter(([command]) => command === "calendar_notify");
  const waits = () => invoke.mock.calls.filter(([command]) => command === "calendar_wait");
  const stop = startCalendarReminders();
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(popups()).toHaveLength(1);
    const idleWaits = waits().length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(waits()).toHaveLength(idleWaits);

    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(25_000);
    expect(popups()).toHaveLength(1);

    await saveCalendarNote("2026-01-01", { text: "周年", annual: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(popups()).toHaveLength(2);
    expect(popups()[1][1].body.split("\n").slice(1)).toEqual(["周年"]);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(popups()).toHaveLength(2);

    await saveCalendarNote("2026-01-01", { text: "定时纪念日", annual: true, reminderTime: "12:01:07" });
    await vi.advanceTimersByTimeAsync(6_999);
    expect(popups()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(popups()).toHaveLength(3);
    expect(popups()[2][1].body.split("\n").slice(1)).toEqual(["定时纪念日"]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(popups()).toHaveLength(3);
  } finally {
    stop();
  }
});
