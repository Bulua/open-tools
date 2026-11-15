import { describe, expect, it } from "vitest";
import { calendarDate, calendarDateKey, calendarFestivals, calendarNotesOn, compactLunarDate, localCalendarDate, monthDays } from "./calendar";

describe("月历", () => {
  it("农历初一显示月份，其他日期显示简写", () => {
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      calendar: "chinese", month: "long", day: "numeric", timeZone: "UTC",
    });
    expect(compactLunarDate(formatter.formatToParts(calendarDate(2026, 10, 9)), "zh-CN")).toBe("十月");
    expect(compactLunarDate(formatter.formatToParts(calendarDate(2026, 10, 1)), "zh-CN")).toBe("廿三");
    expect(compactLunarDate(formatter.formatToParts(calendarDate(2025, 6, 25)), "zh-CN")).toBe("闰六月");
  });

  it("周一开头，包含相邻月份，并处理闰年", () => {
    const dates = monthDays(2024, 1);
    expect(dates).toHaveLength(35);
    expect(dates[0]).toEqual(calendarDate(2024, 0, 29));
    expect(dates).toContainEqual(calendarDate(2024, 1, 29));
    expect(dates[dates.length - 1]).toEqual(calendarDate(2024, 2, 3));
  });

  it("完整的四周和跨六周的月份使用实际行数", () => {
    expect(monthDays(2021, 1)).toHaveLength(28);
    expect(monthDays(2026, 2)).toHaveLength(42);
  });

  it.each([
    [2026, 0, 1, "newYear"],
    [2024, 1, 9, "lunarNewYearsEve"],
    [2026, 1, 16, "lunarNewYearsEve"],
    [2026, 1, 17, "springFestival"],
    [2026, 5, 19, "dragonBoat"],
    [2026, 8, 25, "midAutumn"],
  ] as const)("标记 %i 年月索引 %i 的 %i 日", (year, month, day, festival) => {
    expect(calendarFestivals(calendarDate(year, month, day))).toContain(festival);
  });

  it("闰月不重复标记农历节日", () => {
    expect(calendarFestivals(calendarDate(2009, 4, 28))).toContain("dragonBoat");
    expect(calendarFestivals(calendarDate(2009, 5, 27))).not.toContain("dragonBoat");
  });

  it("公历和农历节日可以同日出现", () => {
    expect(calendarFestivals(calendarDate(2020, 9, 1))).toEqual(["nationalDay", "midAutumn"]);
  });
});

describe("日历备注", () => {
  const notes = {
    "2024-02-29": { text: "闰日纪念", annual: true },
    "2026-11-09": { text: "一次性备注", annual: false },
    "2027-11-09": { text: "周年纪念", annual: true },
  };

  it("用本地日期而不是当前的 UTC 日期决定当天提醒", () => {
    expect(calendarDateKey(localCalendarDate(new Date(2026, 10, 9, 23, 30)))).toBe("2026-11-09");
  });

  it("只在原日期或之后相同的公历月日显示纪念日", () => {
    expect(calendarNotesOn(notes, "2026-11-09")).toEqual([["2026-11-09", notes["2026-11-09"]]]);
    expect(calendarNotesOn(notes, "2028-11-09")).toEqual([["2027-11-09", notes["2027-11-09"]]]);
    expect(calendarNotesOn(notes, "2027-02-28")).toEqual([]);
    expect(calendarNotesOn(notes, "2028-02-29")).toEqual([["2024-02-29", notes["2024-02-29"]]]);
  });
});
