import { describe, expect, it } from "vitest";
import {
  calendarCrossDayRemindersOn,
  calendarNoteRemindsOn,
  calendarReminderDisplay,
  calendarReminderParts,
  calendarReminderSecond,
  calendarRemindersOn,
  calendarReminderTargetDate,
  isCalendarReminderAt,
  type CalendarNotes,
} from "./calendar";

describe("日历任意日期提醒纯逻辑", () => {
  it("能正确校验并拆分 YYYY-MM-DD HH:MM:SS 格式", () => {
    expect(isCalendarReminderAt("2026-05-09 09:30:15")).toBe(true);
    expect(isCalendarReminderAt("2024-02-29 00:00:00")).toBe(true);
    expect(isCalendarReminderAt("2025-02-29 00:00:00")).toBe(false);
    expect(isCalendarReminderAt("09:30:00")).toBe(false);
    expect(isCalendarReminderAt("2026-05-09T09:30:00")).toBe(false);
    expect(isCalendarReminderAt("2026-05-09 24:00:00")).toBe(false);

    expect(calendarReminderParts("2026-05-09 09:30:15")).toEqual({
      date: "2026-05-09",
      time: "09:30:15",
    });
    expect(calendarReminderParts(undefined)).toBeNull();
    expect(calendarReminderSecond("2026-05-09 01:02:03")).toBe(3723);
    expect(calendarReminderSecond(undefined)).toBe(0);
  });

  it("支持当天提醒、跨日提前/延后提醒与跨年每年重复提醒", () => {
    const notes: CalendarNotes = {
      "2026-05-10": { text: "妈妈生日", annual: true, reminderAt: "2026-05-09 09:00:00" },
      "2026-01-01": { text: "新年计划", annual: true, reminderAt: "2025-12-31 20:00:00" },
      "2026-06-01": { text: "项目复盘", annual: false, reminderAt: "2026-05-30 14:00:00" },
      "2026-07-15": { text: "全天备忘", annual: false },
    };

    // 非跨日仅在提醒日触发，不在备注原日期重复触发
    expect(calendarNoteRemindsOn("2026-06-01", notes["2026-06-01"], "2026-05-30")).toBe(true);
    expect(calendarNoteRemindsOn("2026-06-01", notes["2026-06-01"], "2026-06-01")).toBe(false);

    // 每年重复支持跨日及次年同日重复
    expect(calendarNoteRemindsOn("2026-05-10", notes["2026-05-10"], "2026-05-09")).toBe(true);
    expect(calendarNoteRemindsOn("2026-05-10", notes["2026-05-10"], "2027-05-09")).toBe(true);
    expect(calendarNoteRemindsOn("2026-05-10", notes["2026-05-10"], "2025-05-09")).toBe(false);

    // 跨年提前提醒能正确推导关联备注年份
    expect(calendarNoteRemindsOn("2026-01-01", notes["2026-01-01"], "2026-12-31")).toBe(true);
    expect(calendarReminderTargetDate("2026-01-01", notes["2026-01-01"], "2026-12-31")).toBe("2027-01-01");
    expect(calendarReminderTargetDate("2026-06-01", notes["2026-06-01"], "2026-05-30")).toBe("2026-06-01");

    // 当天跨日提醒列表与全量提醒列表区分正确
    expect(calendarCrossDayRemindersOn(notes, "2026-05-30").map(([k]) => k)).toEqual(["2026-06-01"]);
    expect(calendarRemindersOn(notes, "2026-07-15").map(([k]) => k)).toEqual(["2026-07-15"]);
  });

  it("在弹窗中按查看日期格式化提醒时间展示", () => {
    const sameDay = { text: "开会", annual: false, reminderAt: "2026-05-10 10:00:00" };
    const advanceAnnual = { text: "生日", annual: true, reminderAt: "2026-05-09 09:00:00" };
    const noTime = { text: "全天", annual: false };

    expect(calendarReminderDisplay("2026-05-10", sameDay, "2026-05-10")).toBe("10:00:00");
    expect(calendarReminderDisplay("2026-05-10", advanceAnnual, "2026-05-10")).toBe("2026-05-09 09:00:00");
    expect(calendarReminderDisplay("2026-05-10", advanceAnnual, "2027-05-10")).toBe("2027-05-09 09:00:00");
    expect(calendarReminderDisplay("2026-05-10", noTime, "2026-05-10")).toBe("");
  });
});
