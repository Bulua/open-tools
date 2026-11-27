const solarFestivals: Record<string, string> = {
  "1-1": "newYear",
  "5-1": "labourDay",
  "10-1": "nationalDay",
  "12-25": "christmas",
};

const lunarFestivals: Record<string, string> = {
  "1-1": "springFestival",
  "1-15": "lantern",
  "5-5": "dragonBoat",
  "7-7": "qixi",
  "8-15": "midAutumn",
  "9-9": "doubleNinth",
};

const lunar = new Intl.DateTimeFormat("zh-CN", {
  calendar: "chinese",
  numberingSystem: "latn",
  timeZone: "UTC",
  month: "numeric",
  day: "numeric",
});
const supportsChineseCalendar = lunar.resolvedOptions().calendar === "chinese";

// UTC 仅用于表示公历日期，避免本地夏令时影响按天运算。
export function calendarDate(year: number, month: number, day = 1) {
  return new Date(Date.UTC(year, month, day));
}

export function localCalendarDate(now = new Date()) {
  return calendarDate(now.getFullYear(), now.getMonth(), now.getDate());
}

export function calendarDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

import type { CalendarNote, CalendarNotes } from "@/types/calendar";

export type { CalendarNote, CalendarNotes };

function isValidYmd(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1) return false;
  if (m === 2) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return d <= (leap ? 29 : 28);
  }
  if ([4, 6, 9, 11].includes(m)) return d <= 30;
  return d <= 31;
}

export const isCalendarReminderAt = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) ((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)$/);
  if (!match) return false;
  return isValidYmd(Number(match[1]), Number(match[2]), Number(match[3]));
};

export function calendarReminderParts(reminderAt: string | undefined) {
  if (!isCalendarReminderAt(reminderAt)) return null;
  return {
    date: reminderAt.slice(0, 10),
    time: reminderAt.slice(11, 19),
  };
}

export function calendarReminderSecond(reminderAt: string | undefined) {
  const parts = calendarReminderParts(reminderAt);
  if (!parts) return 0;
  const [hours, minutes, seconds] = parts.time.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

export function calendarNoteOccursOn(origin: string, note: CalendarNote, date: string) {
  return origin === date || (note.annual && origin < date && origin.slice(5) === date.slice(5));
}

export function calendarNotesOn(notes: CalendarNotes, date: string) {
  return Object.entries(notes).filter(([origin, note]) => calendarNoteOccursOn(origin, note, date));
}

export function calendarNoteRemindsOn(origin: string, note: CalendarNote, date: string) {
  const parts = calendarReminderParts(note.reminderAt);
  if (!parts) return calendarNoteOccursOn(origin, note, date);
  if (!note.annual) return parts.date === date;
  return parts.date === date || (parts.date < date && parts.date.slice(5) === date.slice(5));
}

export function calendarRemindersOn(notes: CalendarNotes, date: string) {
  return Object.entries(notes).filter(([origin, note]) => calendarNoteRemindsOn(origin, note, date));
}

export function calendarCrossDayRemindersOn(notes: CalendarNotes, date: string) {
  return Object.entries(notes).filter(
    ([origin, note]) => calendarNoteRemindsOn(origin, note, date) && !calendarNoteOccursOn(origin, note, date),
  );
}

export function calendarReminderTargetDate(origin: string, note: CalendarNote, reminderDate: string) {
  if (!note.annual) return origin;
  const parts = calendarReminderParts(note.reminderAt);
  if (!parts) return reminderDate;
  const yearDelta = Number(reminderDate.slice(0, 4)) - Number(parts.date.slice(0, 4));
  return `${Number(origin.slice(0, 4)) + yearDelta}${origin.slice(4)}`;
}

export function calendarReminderDisplay(origin: string, note: CalendarNote, viewDate: string) {
  const parts = calendarReminderParts(note.reminderAt);
  if (!parts) return "";
  if (!note.annual) {
    return parts.date === viewDate ? parts.time : `${parts.date} ${parts.time}`;
  }
  const yearDelta = Number(viewDate.slice(0, 4)) - Number(origin.slice(0, 4));
  const effectiveDate = `${Number(parts.date.slice(0, 4)) + yearDelta}${parts.date.slice(4)}`;
  return effectiveDate === viewDate ? parts.time : `${effectiveDate} ${parts.time}`;
}

export function monthDays(year: number, month: number) {
  const first = calendarDate(year, month);
  const offset = (first.getUTCDay() + 6) % 7;
  const last = calendarDate(year, month + 1, 0).getUTCDate();
  const length = Math.ceil((offset + last) / 7) * 7;
  return Array.from({ length }, (_, i) => calendarDate(year, month, 1 - offset + i));
}

const lunarDayNames = [
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
];

export function compactLunarDate(parts: Intl.DateTimeFormatPart[], locale: string) {
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  if (day === "1") return parts.find((part) => part.type === "month")?.value ?? day;
  return locale === "zh-CN" ? lunarDayNames[Number(day) - 1] ?? day : day;
}

function lunarKey(date: Date) {
  const parts = lunar.formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  // 闰月带「闰」前缀，节日只匹配普通月份。
  return `${month}-${day}`;
}

export function calendarFestivals(date: Date) {
  const festivals: string[] = [];
  const solarFestival = solarFestivals[`${date.getUTCMonth() + 1}-${date.getUTCDate()}`];
  if (solarFestival) festivals.push(solarFestival);

  if (supportsChineseCalendar) {
    const key = lunarKey(date);
    const lunarFestival = lunarFestivals[key];
    if (lunarFestival) festivals.push(lunarFestival);
    // 除夕是春节前一天，腊月可能只有二十九天。
    if (key === "12-29" || key === "12-30") {
      const tomorrow = calendarDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
      if (lunarKey(tomorrow) === "1-1") festivals.push("lunarNewYearsEve");
    }
  }
  return festivals;
}
