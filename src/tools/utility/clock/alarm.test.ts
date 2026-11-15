import { describe, expect, it } from "vitest";
import { nextAlarmTarget } from "./alarm";

const at = (value: string) => new Date(value).getTime();
describe("闹钟排期", () => {
  it("单次提醒在当天未来时刻或次日响铃，不立即触发刚保存的闹钟", () => {
    const schedule = { time: "09:00", weekdays: [] };
    expect(nextAlarmTarget(schedule, at("2026-11-16T08:59:00"))).toBe(at("2026-11-16T09:00:00"));
    expect(nextAlarmTarget(schedule, at("2026-11-16T09:00:00"))).toBe(at("2026-11-17T09:00:00"));
  });
  it("多选星期按最近的选中日排期，周日和跨周都能命中", () => {
    const schedule = { time: "08:30", weekdays: [1, 3, 0] };
    expect(nextAlarmTarget(schedule, at("2026-11-16T09:00:00"))).toBe(at("2026-11-18T08:30:00"));
    expect(nextAlarmTarget(schedule, at("2026-11-21T09:00:00"))).toBe(at("2026-11-22T08:30:00"));
    expect(nextAlarmTarget({ time: "08:30", weekdays: [1] }, at("2026-11-16T08:30:00"))).toBe(at("2026-11-23T08:30:00"));
  });
  it("跨月、跨年和长时间离线后仍只排到下次选中时刻", () => {
    expect(nextAlarmTarget({ time: "00:00", weekdays: [] }, at("2026-12-31T23:59:59"))).toBe(at("2027-01-01T00:00:00"));
    expect(nextAlarmTarget({ time: "09:00", weekdays: [1] }, at("2030-01-01T10:00:00"))).toBe(at("2030-01-07T09:00:00"));
  });
  it("拒绝无效时间和星期", () => {
    expect(() => nextAlarmTarget({ time: "24:00", weekdays: [] }, Date.now())).toThrow();
    expect(() => nextAlarmTarget({ time: "09:00", weekdays: [8] }, Date.now())).toThrow();
  });
});
