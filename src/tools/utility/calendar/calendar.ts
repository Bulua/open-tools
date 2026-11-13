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

export interface CalendarNote {
  text: string;
  annual: boolean;
  reminderTime?: string;
}

export type CalendarNotes = Record<string, CalendarNote>;

export const isCalendarReminderTime = (time: unknown): time is string =>
  typeof time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time);

export function calendarReminderSecond(time: string | undefined) {
  if (time === undefined) return 0;
  const [hours, minutes, seconds] = time.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

export function calendarNoteOccursOn(origin: string, note: CalendarNote, date: string) {
  return origin === date || (note.annual && origin < date && origin.slice(5) === date.slice(5));
}

export function calendarNotesOn(notes: CalendarNotes, date: string) {
  return Object.entries(notes).filter(([origin, note]) => calendarNoteOccursOn(origin, note, date));
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
