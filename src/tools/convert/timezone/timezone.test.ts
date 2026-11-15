import { describe, expect, it } from "vitest";
import { cityName, diffLabel, offsetLabel, timeIn, zoneOffset, zonedToDate } from "./timezone";

describe("时区换算", () => {
  it("偏移与夏令时", () => {
    expect(zoneOffset("Asia/Shanghai", new Date("2026-07-01T00:00:00Z"))).toBe(480);
    expect(zoneOffset("America/New_York", new Date("2026-07-01T00:00:00Z"))).toBe(-240);
    expect(zoneOffset("America/New_York", new Date("2026-01-15T00:00:00Z"))).toBe(-300);
    expect(zoneOffset("Asia/Kolkata", new Date("2026-01-15T00:00:00Z"))).toBe(330);
  });

  it("某时区的时间 → 真实时刻 → 其他时区", () => {
    const d = zonedToDate("Asia/Shanghai", 2026, 11, 1, 9, 30);
    expect(d.toISOString()).toBe("2026-11-01T01:30:00.000Z");
    const ny = timeIn(d, "America/New_York");
    expect(ny).toMatchObject({ date: "2026-10-31", time: "21:30", weekday: "周六" });
  });

  it("夏令时切换当天", () => {
    // 2026-03-08 纽约 03:00 起进入夏令时
    expect(zonedToDate("America/New_York", 2026, 3, 8, 12, 0).toISOString()).toBe("2026-03-08T16:00:00.000Z");
  });

  it("显示", () => {
    expect(offsetLabel(480)).toBe("UTC+8");
    expect(offsetLabel(-210)).toBe("UTC-3:30");
    expect(diffLabel(0)).toBe("时间相同");
    expect(diffLabel(-780)).toBe("晚 13 小时");
    expect(diffLabel(150)).toBe("早 2.5 小时");
    expect(cityName("Asia/Tokyo")).toBe("东京");
    expect(cityName("America/Port_of_Spain")).toBe("Port of Spain");
  });
});
