import { expect, it } from "vitest";
import { activityCalendar, activityDateKey, activityLevel, normalizeActivity } from "./toolActivity";

it("统计日期使用本地年月日", () => {
  expect(activityDateKey(new Date(2026, 10, 11, 0, 1))).toBe("2026-11-11");
  expect(activityDateKey(new Date(2026, 10, 11, 23, 59))).toBe("2026-11-11");
});

it("忽略损坏、无效日期和非正整数记录", () => {
  expect(normalizeActivity(null)).toEqual({});
  expect(normalizeActivity([])).toEqual({});
  expect(normalizeActivity({
    "2024-02-29": 2, "2025-02-29": 3, "2026-11-11": 10,
    "2026-11-12": -1, "2026-11-13": 0.5, "2026-11-14": "1", bad: 8,
  })).toEqual({ "2024-02-29": 2, "2026-11-11": 10 });
});

it.each([new Date(2026, 10, 11), new Date(2024, 2, 1), new Date(2026, 0, 1)])("滚动日历包含截至 %s 的近六个月日期，星期正确对齐", (today) => {
  const calendar = activityCalendar({ [activityDateKey(today)]: 12 }, today);
  const days = calendar.filter((day) => day !== null);
  const start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  expect(days[0].key).toBe(activityDateKey(start));
  expect(new Set(days.map((day) => day.date.getMonth())).size).toBe(6);
  expect(new Set(days.map((day) => day.key)).size).toBe(days.length);
  expect(calendar.length % 7).toBe(0);
  expect(days[days.length - 1]).toMatchObject({ key: activityDateKey(today), count: 12, level: 4 });
  calendar.forEach((day, index) => { if (day) expect(day.date.getDay()).toBe(index % 7); });
});

it("闰日只出现一次，区间外的数据不进入热力图", () => {
  const days = activityCalendar({ "2024-02-29": 5, "2020-01-01": 100 }, new Date(2024, 2, 1));
  expect(days.filter((day) => day?.key === "2024-02-29")).toHaveLength(1);
  expect(days.reduce((total, day) => total + (day?.count ?? 0), 0)).toBe(5);
});

it("使用次数按固定阈值逐级加深", () => {
  expect([0, 1, 2, 3, 5, 6, 9, 10, 100].map(activityLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
});
