// @vitest-environment jsdom
import { nextTick } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { countdowns, saveAlarm, startCountdownTicker } from "./clockStore";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: native.invoke }));
afterEach(() => { vi.useRealTimers(); });
const flush = async () => { await nextTick(); for (let i = 0; i < 8; i++) await Promise.resolve(); };

it("继续读取原有提醒，连续编辑时串行写入同一数据文件，最终保存最新状态", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T08:00:00"));
  let releaseFirst: (() => void) | undefined;
  const saved: string[] = [];
  native.invoke.mockImplementation((command: string, args?: { data: string }) => {
    if (command === "countdown_read") return Promise.resolve(JSON.stringify([
      { id: "legacy", title: "旧提醒", target: new Date("2099-01-01").getTime(), createdAt: 1, done: false, repeat: "none" },
    ]));
    if (command === "countdown_write") {
      saved.push(args!.data);
      if (saved.length === 1) return new Promise<void>(resolve => { releaseFirst = resolve; });
      return Promise.resolve();
    }
  });
  await startCountdownTicker();
  expect(countdowns.value[0].title).toBe("旧提醒");
  saveAlarm({ time: "09:00", weekdays: [1] }, "首次标签");
  await flush();
  expect(saved).toHaveLength(1);
  saveAlarm({ time: "10:00", weekdays: [1, 2] }, "最新标签", countdowns.value[1].id);
  await flush();
  expect(saved).toHaveLength(1);
  releaseFirst!(); await flush();
  expect(saved).toHaveLength(2);
  expect(JSON.parse(saved[1])[1]).toMatchObject({ title: "最新标签", alarm: { time: "10:00", weekdays: [1, 2] } });
  expect(JSON.parse(saved[1])[0].id).toBe("legacy");
});
