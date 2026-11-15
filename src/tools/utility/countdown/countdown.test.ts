import { describe, expect, it } from "vitest";
import { formatRemaining, nextOccurrence, progressOf, splitRemaining, toMs, type CountdownItem } from "./countdown";

const at = (s: string) => new Date(s).getTime();

describe("倒计时", () => {
  it("剩余时间拆分与显示", () => {
    expect(splitRemaining(toMs(27, 5, 6))).toMatchObject({ days: 1, hours: 3, minutes: 5, seconds: 6 });
    expect(formatRemaining(toMs(0, 4, 5))).toBe("04:05");
    expect(formatRemaining(toMs(2, 0, 0))).toBe("02:00:00");
    expect(formatRemaining(toMs(75, 0, 1))).toBe("3 天 03:00:01");
    // 不足一秒按一秒显示，到 0 才算结束
    expect(formatRemaining(400)).toBe("00:01");
    expect(formatRemaining(-5000)).toBe("00:00");
  });

  it("重复：每天、每周、每月（31 日）、每年（2 月 29 日）", () => {
    expect(nextOccurrence(at("2026-11-01T09:00:00"), "daily", at("2026-11-03T10:00:00"))).toBe(at("2026-11-04T09:00:00"));
    expect(nextOccurrence(at("2026-11-01T09:00:00"), "weekly", at("2026-11-01T09:00:00"))).toBe(at("2026-11-08T09:00:00"));
    expect(nextOccurrence(at("2026-01-31T08:00:00"), "monthly", at("2026-02-01T00:00:00"))).toBe(at("2026-02-28T08:00:00"));
    expect(nextOccurrence(at("2028-02-29T00:00:00"), "yearly", at("2028-03-01T00:00:00"))).toBe(at("2029-02-28T00:00:00"));
    expect(nextOccurrence(at("2026-11-01T09:00:00"), "none", at("2027-01-01T00:00:00"))).toBe(at("2026-11-01T09:00:00"));
  });

  it("进度与暂停", () => {
    const item: CountdownItem = { id: "1", title: "", target: 10_000, createdAt: 0, duration: 10_000, repeat: "none", done: false };
    expect(progressOf(item, 2_500)).toBe(0.25);
    expect(progressOf({ ...item, pausedRemaining: 5_000 }, 9_000)).toBe(0.5);
  });
});
