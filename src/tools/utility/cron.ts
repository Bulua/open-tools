/**
 * Cron 表达式：解析、生成中文说明、计算接下来的执行时间。
 *
 * 支持三种常见写法：
 * - Linux / Unix：5 位「分 时 日 月 周」，周 0～7（0 和 7 都是周日）
 * - Spring：6 位「秒 分 时 日 月 周」，周的写法同 Linux
 * - Quartz：6～7 位「秒 分 时 日 月 周 [年]」，周 1～7（1 是周日），日和周其中一个写 ?
 * 支持 * ? , - /、月份和星期的英文缩写、L（最后一天 / 最后一个周几）、#（第几个周几）和 @daily 等简写。
 */
import { locale, t, translationOf, type Locale, type Translations } from "@/locales";

export type CronDialect = "unix" | "spring" | "quartz";

/** fields 是各字段的顺序说明，见文案 utility.fieldsUnix 等 */
export const DIALECTS: { value: CronDialect; label: string; fields: string }[] = [
  { value: "unix", label: "Linux", fields: "fieldsUnix" },
  { value: "spring", label: "Spring", fields: "fieldsSpring" },
  { value: "quartz", label: "Quartz", fields: "fieldsQuartz" },
];
/** 字段名（报错和逐项说明里用） */
const F = (key: "Second" | "Minute" | "Hour" | "Day" | "Month" | "Week" | "Year") => t(`utility.f${key}`);

export interface CronField {
  /** 原始写法 */
  text: string;
  /** 允许的取值（已排序） */
  values: number[];
  /** * 或 ?：不限制 */
  any: boolean;
}

export interface ParsedCron {
  dialect: CronDialect;
  second: CronField;
  minute: CronField;
  hour: CronField;
  day: CronField & { last: boolean; lastOffset: number };
  month: CronField;
  /** 星期统一为 0～6，0 是周日 */
  week: CronField & { nth: [number, number][]; lastOf: number[] };
  year: CronField | null;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WEEK_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

/** 根据位数和写法猜测是哪种 Cron */
export function detectDialect(expr: string): CronDialect {
  const parts = expr.trim().split(/\s+/);
  if (parts.length <= 5 || expr.trim().startsWith("@")) return "unix";
  if (parts.length === 7 || expr.includes("?")) return "quartz";
  return "spring";
}

const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

/** 解析一个字段：* ? , - / 和英文名称 */
function parseField(text: string, min: number, max: number, label: string, toNumber: (s: string) => number): CronField {
  if (text === "*" || text === "?") return { text, values: range(min, max), any: true };
  const values = new Set<number>();
  for (const part of text.split(",")) {
    const m = part.match(/^(\*|[\w]+)(?:-([\w]+))?(?:\/(\d+))?$/);
    if (!m) throw new Error(t("utility.badPart", { label, part }));
    const [, a, b, stepText] = m;
    const step = stepText ? Number(stepText) : 1;
    if (step < 1) throw new Error(t("utility.badStep", { label, part }));
    const from = a === "*" ? min : toNumber(a);
    // 「5/10」表示从 5 开始每 10 个，一直到最大值
    const to = b !== undefined ? toNumber(b) : a === "*" || stepText ? max : from;
    if (from < min || from > max || to < min || to > max) throw new Error(t("utility.partRange", { label, part, min, max }));
    if (from > to) throw new Error(t("utility.partOrder", { label, part }));
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return { text, values: [...values].sort((x, y) => x - y), any: false };
}

const numberOr = (names: string[] | null, base: number, label: string) => (s: string) => {
  const upper = s.toUpperCase();
  const idx = names ? names.indexOf(upper) : -1;
  if (idx >= 0) return idx + base;
  if (!/^\d+$/.test(s)) throw new Error(t("utility.badValue", { label, s }));
  return Number(s);
};

export function parseCron(input: string, dialect: CronDialect = detectDialect(input)): ParsedCron {
  let expr = input.trim();
  if (!expr) throw new Error(t("utility.needCron"));
  if (expr.startsWith("@")) {
    const macro = MACROS[expr.toLowerCase()];
    if (!macro) throw new Error(t("utility.badMacro", { expr }));
    expr = dialect === "unix" ? macro : `0 ${macro}`;
  }
  const parts = expr.split(/\s+/);
  const expected = dialect === "unix" ? [5] : dialect === "spring" ? [6] : [6, 7];
  if (!expected.includes(parts.length)) {
    const info = DIALECTS.find((d) => d.value === dialect)!;
    throw new Error(t("utility.fieldCount", { dialect: info.label, expected: expected.join(t("utility.or")), fields: t(`utility.${info.fields}`), n: parts.length }));
  }
  const [secText, minText, hourText, dayText, monthText, weekText, yearText] = dialect === "unix" ? ["0", ...parts] : parts;

  // 日：L、L-3（倒数第几天）；W（最近工作日）不支持
  let dayLast = false;
  let lastOffset = 0;
  if (/W/i.test(dayText)) throw new Error(t("utility.noW"));
  const dayParts = dayText.split(",").filter((p) => {
    const m = p.match(/^L(?:-(\d+))?$/i);
    if (!m) return true;
    dayLast = true;
    lastOffset = Number(m[1] ?? 0);
    return false;
  });
  const dayField = dayParts.length
    ? parseField(dayParts.join(","), 1, 31, F("Day"), numberOr(null, 0, F("Day")))
    : { text: dayText, values: [], any: false };

  // 周：Quartz 1～7（1 是周日），其他 0～7（0、7 都是周日）；统一成 0～6
  const quartz = dialect === "quartz";
  const toWeekday = (s: string) => {
    const n = numberOr(WEEKDAYS, quartz ? 1 : 0, F("Week"))(s);
    if (quartz ? n < 1 || n > 7 : n < 0 || n > 7) throw new Error(t("utility.weekRange", { s, range: quartz ? "1–7" : "0–7" }));
    return quartz ? n - 1 : n % 7;
  };
  const nth: [number, number][] = [];
  const lastOf: number[] = [];
  const weekParts = weekText.split(",").filter((p) => {
    const hash = p.match(/^(\w+)#([1-5])$/);
    if (hash) {
      nth.push([toWeekday(hash[1]), Number(hash[2])]);
      return false;
    }
    const last = p.match(/^(\w*)L$/i);
    if (last) {
      // 单独的 L 表示周六（一周的最后一天）
      lastOf.push(last[1] ? toWeekday(last[1]) : 6);
      return false;
    }
    return true;
  });
  let weekField: CronField = { text: weekText, values: [], any: false };
  if (weekParts.length) {
    const any = weekParts.length === 1 && (weekParts[0] === "*" || weekParts[0] === "?");
    if (any) weekField = { text: weekText, values: range(0, 6), any: true };
    else {
      const parsed = parseField(weekParts.join(","), quartz ? 1 : 0, 7, F("Week"), (s) => numberOr(WEEKDAYS, quartz ? 1 : 0, F("Week"))(s));
      const values = [...new Set(parsed.values.map((v) => (quartz ? v - 1 : v % 7)))].sort((x, y) => x - y);
      weekField = { text: weekText, values, any: false };
    }
  }

  if (quartz && dayText !== "?" && weekText !== "?") throw new Error(t("utility.quartzQ"));

  return {
    dialect,
    second: parseField(secText, 0, 59, F("Second"), numberOr(null, 0, F("Second"))),
    minute: parseField(minText, 0, 59, F("Minute"), numberOr(null, 0, F("Minute"))),
    hour: parseField(hourText, 0, 23, F("Hour"), numberOr(null, 0, F("Hour"))),
    day: { ...dayField, text: dayText, any: dayText === "*" || dayText === "?", last: dayLast, lastOffset },
    month: parseField(monthText, 1, 12, F("Month"), numberOr(MONTHS, 1, F("Month"))),
    week: { ...weekField, nth, lastOf },
    year: yearText ? parseField(yearText, 1970, 2099, F("Year"), numberOr(null, 0, F("Year"))) : null,
  };
}

// ---------- 执行时间 ----------

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

function dayMatches(c: ParsedCron, year: number, month: number, day: number): boolean {
  const last = daysInMonth(year, month);
  const weekday = new Date(year, month - 1, day).getDay();
  const domRestricted = !c.day.any;
  const dowRestricted = !c.week.any;
  const dom = c.day.values.includes(day) || (c.day.last && day === last - c.day.lastOffset);
  const dow =
    c.week.values.includes(weekday) ||
    c.week.nth.some(([w, n]) => w === weekday && Math.ceil(day / 7) === n) ||
    c.week.lastOf.some((w) => w === weekday && day + 7 > last);
  // Linux 的规则：日和周都有限制时，满足其一即可
  if (c.dialect === "unix" && domRestricted && dowRestricted) return dom || dow;
  return (!domRestricted || dom) && (!dowRestricted || dow);
}

/** 从 from 之后开始，接下来的 count 次执行时间（最多往后找 5 年） */
export function nextRuns(c: ParsedCron, from: Date, count = 10): Date[] {
  const out: Date[] = [];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 366 * 5 && out.length < count; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (c.year && !c.year.values.includes(y)) continue;
    if (!c.month.values.includes(m) || !dayMatches(c, y, m, d)) continue;
    for (const h of c.hour.values) {
      for (const min of c.minute.values) {
        for (const s of c.second.values) {
          const t = new Date(y, m - 1, d, h, min, s);
          if (t > from) {
            out.push(t);
            if (out.length >= count) return out;
          }
        }
      }
    }
  }
  return out;
}

// ---------- 中文说明 ----------

const join = (items: string[]) => items.join("、");

/** 把一个字段的写法翻译成中文，例如「*\/5」→「每 5 分钟」 */
function describeParts(text: string, unit: string, name: (v: string) => string, every: string): string {
  return join(
    text.split(",").map((part) => {
      const m = part.match(/^(\*|\w+)(?:-(\w+))?(?:\/(\d+))?$/);
      if (!m) return part;
      const [, a, b, step] = m;
      if (a === "*" && step) return `每 ${step} ${every}`;
      if (a === "*") return `每${every}`;
      // 「9 点至 18 点」「周一至周五」
      const span = b ? `${name(a)}${unit}至${unit.startsWith(" ") ? " " : ""}${name(b)}${unit}` : "";
      if (b && step) return `${span}每 ${step} ${every}`;
      if (b) return span;
      if (step) return `从${name(a)}${unit}起每 ${step} ${every}`;
      return `${name(a)}${unit}`;
    }),
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 各语言的说明生成函数（说明要按语法拼句子，每种语言单独写）；没有的语言用英文说明 */
const DESCRIBERS: Partial<Record<Locale, (c: ParsedCron) => string>> = { "zh-CN": describeCronZh, en: describeCronEn };

/** 用当前界面语言说明 Cron 表达式 */
export function describeCron(c: ParsedCron): string {
  return (DESCRIBERS[locale.value] ?? describeCronEn)(c);
}

function describeCronZh(c: ParsedCron): string {
  const withSeconds = c.dialect !== "unix";
  const single = (f: CronField) => !f.any && f.values.length === 1 && /^\d+$/.test(f.text);
  const weekName = (v: string) => {
    const idx = WEEKDAYS.indexOf(v.toUpperCase());
    const n = idx >= 0 ? idx : Number(v) - (c.dialect === "quartz" ? 1 : 0);
    return WEEK_LABELS[((n % 7) + 7) % 7];
  };
  const monthName = (v: string) => String(MONTHS.indexOf(v.toUpperCase()) + 1 || Number(v));

  // 时间部分
  let time: string;
  const secFixed = !withSeconds || single(c.second);
  const fixedTimes = !c.hour.any && !c.minute.any && secFixed && c.hour.values.length * c.minute.values.length <= 6 && !/[/-]/.test(c.hour.text + c.minute.text);
  if (fixedTimes) {
    const sec = withSeconds && c.second.values[0] ? `:${pad(c.second.values[0])}` : "";
    time = join(c.hour.values.flatMap((h) => c.minute.values.map((m) => `${pad(h)}:${pad(m)}${sec}`)));
  } else {
    const parts: string[] = [];
    if (!c.hour.any) parts.push(describeParts(c.hour.text, " 点", String, "小时"));
    // 秒有限制、分不限制时，「每分钟」由秒的说明表达
    const secondsRestricted = withSeconds && !c.second.any && !(single(c.second) && c.second.values[0] === 0);
    if (c.minute.any) {
      if (!secondsRestricted) parts.push("每分钟");
    } else if (/\//.test(c.minute.text)) parts.push(describeParts(c.minute.text, " 分", String, "分钟"));
    else parts.push(`${c.hour.any ? "每小时的" : ""}第 ${join(c.minute.values.map(String))} 分`);
    if (withSeconds && (secondsRestricted || c.second.any)) {
      parts.push(c.second.any ? "每秒" : /\//.test(c.second.text) ? describeParts(c.second.text, " 秒", String, "秒") : `第 ${join(c.second.values.map(String))} 秒`);
    }
    time = parts.join("，");
    if (c.minute.any && withSeconds && c.second.any) time = c.hour.any ? "每秒" : `${parts[0]}，每秒`;
  }

  // 日期部分
  const dateParts: string[] = [];
  if (c.year) dateParts.push(`${describeParts(c.year.text, " 年", String, "年")}`);
  if (!c.month.any) dateParts.push(`${c.year ? "" : "每年 "}${describeParts(c.month.text, " 月", monthName, "个月")}`);
  const dayDesc: string[] = [];
  if (!c.day.any) {
    const normal = c.day.text.split(",").filter((p) => !/^L/i.test(p)).join(",");
    if (normal) dayDesc.push(describeParts(normal, " 日", String, "天"));
    if (c.day.last) dayDesc.push(c.day.lastOffset ? `倒数第 ${c.day.lastOffset + 1} 天` : "最后一天");
  }
  const weekDesc: string[] = [];
  if (!c.week.any) {
    const normal = c.week.text.split(",").filter((p) => !/[#L]/i.test(p)).join(",");
    if (normal) weekDesc.push(describeParts(normal, "", weekName, "天"));
    for (const [w, n] of c.week.nth) weekDesc.push(`第 ${n} 个${WEEK_LABELS[w]}`);
    for (const w of c.week.lastOf) weekDesc.push(`最后一个${WEEK_LABELS[w]}`);
  }
  const monthly = c.week.nth.length || c.week.lastOf.length;
  const dayText = dayDesc.length ? `${c.month.any ? (c.day.values.length ? "每月 " : "每月") : ""}${join(dayDesc)}` : "";
  const weekText = weekDesc.length ? `${monthly ? (c.month.any ? "每月" : "") : "每"}${join(weekDesc)}` : "";
  if (dayText && weekText) dateParts.push(c.dialect === "unix" ? `${dayText}或${weekText}` : `${dayText}且${weekText}`);
  else if (dayText || weekText) dateParts.push(dayText || weekText);

  const date = dateParts.join(" ");
  if (!date) return fixedTimes ? `每天 ${time}` : time;
  return `${date} ${time}`;
}

// ---------- 英文说明 ----------

const MONTH_NAMES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

/** 英文版的字段说明，例如「*\/5」→「every 5 minutes」，「9-18」→「hour 9 to 18」 */
function describePartsEn(text: string, prefix: string, name: (v: string) => string, unit: string): string {
  return text
    .split(",")
    .map((part) => {
      const m = part.match(/^(\*|\w+)(?:-(\w+))?(?:\/(\d+))?$/);
      if (!m) return part;
      const [, a, b, step] = m;
      if (a === "*" && step) return `every ${step} ${unit}s`;
      if (a === "*") return `every ${unit}`;
      if (b && step) return `every ${step} ${unit}s from ${prefix}${name(a)} to ${name(b)}`;
      if (b) return `${prefix}${name(a)} to ${name(b)}`;
      if (step) return `every ${step} ${unit}s starting at ${prefix}${name(a)}`;
      return `${prefix}${name(a)}`;
    })
    .join(", ");
}

function describeCronEn(c: ParsedCron): string {
  const withSeconds = c.dialect !== "unix";
  const single = (f: CronField) => !f.any && f.values.length === 1 && /^\d+$/.test(f.text);
  const weekName = (v: string) => {
    const idx = WEEKDAYS.indexOf(v.toUpperCase());
    const n = idx >= 0 ? idx : Number(v) - (c.dialect === "quartz" ? 1 : 0);
    return WEEK_NAMES_EN[((n % 7) + 7) % 7];
  };
  const monthName = (v: string) => MONTH_NAMES_EN[(MONTHS.indexOf(v.toUpperCase()) + 1 || Number(v)) - 1] ?? v;

  let time: string;
  const secFixed = !withSeconds || single(c.second);
  const fixedTimes = !c.hour.any && !c.minute.any && secFixed && c.hour.values.length * c.minute.values.length <= 6 && !/[/-]/.test(c.hour.text + c.minute.text);
  if (fixedTimes) {
    const sec = withSeconds && c.second.values[0] ? `:${pad(c.second.values[0])}` : "";
    time = `at ${c.hour.values.flatMap((h) => c.minute.values.map((m) => `${pad(h)}:${pad(m)}${sec}`)).join(", ")}`;
  } else {
    const parts: string[] = [];
    const secondsRestricted = withSeconds && !c.second.any && !(single(c.second) && c.second.values[0] === 0);
    if (withSeconds && (secondsRestricted || c.second.any)) {
      parts.push(c.second.any ? "every second" : /\//.test(c.second.text) ? describePartsEn(c.second.text, "second ", String, "second") : `at second ${c.second.values.join(", ")}`);
    }
    if (c.minute.any) {
      if (!secondsRestricted && !(withSeconds && c.second.any)) parts.push("every minute");
    } else if (/\//.test(c.minute.text)) parts.push(describePartsEn(c.minute.text, "minute ", String, "minute"));
    else parts.push(`at minute ${c.minute.values.join(", ")}${c.hour.any ? " of every hour" : ""}`);
    if (!c.hour.any) parts.push(`during ${describePartsEn(c.hour.text, "hour ", String, "hour")}`);
    time = parts.join(", ");
  }

  const dateParts: string[] = [];
  const dayDesc: string[] = [];
  if (!c.day.any) {
    const normal = c.day.text.split(",").filter((p) => !/^L/i.test(p)).join(",");
    if (normal) dayDesc.push(describePartsEn(normal, "day ", String, "day"));
    if (c.day.last) dayDesc.push(c.day.lastOffset ? `${c.day.lastOffset} days before the last day` : "the last day");
  }
  const weekDesc: string[] = [];
  if (!c.week.any) {
    const normal = c.week.text.split(",").filter((p) => !/[#L]/i.test(p)).join(",");
    if (normal) weekDesc.push(describePartsEn(normal, "", weekName, "day"));
    for (const [w, n] of c.week.nth) weekDesc.push(`the ${ordinal(n)} ${WEEK_NAMES_EN[w]}`);
    for (const w of c.week.lastOf) weekDesc.push(`the last ${WEEK_NAMES_EN[w]}`);
  }
  const dayText = dayDesc.length ? `on ${dayDesc.join(", ")}${c.month.any ? " of every month" : ""}` : "";
  const weekText = weekDesc.length ? `on ${weekDesc.join(", ")}` : "";
  if (dayText && weekText) dateParts.push(c.dialect === "unix" ? `${dayText} or ${weekText}` : `${dayText} and ${weekText}`);
  else if (dayText || weekText) dateParts.push(dayText || weekText);
  if (!c.month.any) dateParts.push(`in ${describePartsEn(c.month.text, "", monthName, "month")}`);
  if (c.year) dateParts.push(`in ${describePartsEn(c.year.text, "", String, "year")}`);

  const date = dateParts.join(", ");
  const text = date ? `${time}, ${date}` : fixedTimes ? `${time} every day` : time;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 常用表达式（Linux 格式），i18n 是其他语言的名称 */
export const PRESETS: { label: string; i18n: Translations<string>; expr: string }[] = [
  { label: "每分钟", i18n: { en: "Every minute", ja: "毎分" }, expr: "* * * * *" },
  { label: "每 5 分钟", i18n: { en: "Every 5 minutes", ja: "5 分ごと" }, expr: "*/5 * * * *" },
  { label: "每小时", i18n: { en: "Hourly", ja: "毎時" }, expr: "0 * * * *" },
  { label: "每天 0 点", i18n: { en: "Daily at 0:00", ja: "毎日 0:00" }, expr: "0 0 * * *" },
  { label: "每天 9:30", i18n: { en: "Daily at 9:30", ja: "毎日 9:30" }, expr: "30 9 * * *" },
  { label: "工作日 9 点", i18n: { en: "Weekdays at 9:00", ja: "平日 9:00" }, expr: "0 9 * * 1-5" },
  { label: "每周一 10 点", i18n: { en: "Mondays at 10:00", ja: "毎週月曜 10:00" }, expr: "0 10 * * 1" },
  { label: "每月 1 日", i18n: { en: "1st of each month", ja: "毎月 1 日" }, expr: "0 0 1 * *" },
  { label: "每月最后一天", i18n: { en: "Last day of month", ja: "毎月の最終日" }, expr: "0 18 L * *" },
  { label: "工作时间每 15 分钟", i18n: { en: "Every 15 min in work hours", ja: "勤務時間中 15 分ごと" }, expr: "*/15 9-18 * * 1-5" },
];

/** 各字段的名称，用于逐项说明 */
export function fieldRows(c: ParsedCron): { name: string; text: string; values: string }[] {
  const zh = locale.value === "zh-CN";
  const list = (items: string[]) => items.join(t("utility.listSep"));
  // 星期名：中文用「周一」，其他语言取系统的星期名（2023-01-01 是周日）
  const weekLabel = (w: number) => (zh ? WEEK_LABELS[w] : new Date(2023, 0, 1 + w).toLocaleDateString(locale.value, { weekday: "long" }));
  const show = (f: CronField, fmt: (v: number) => string = String) =>
    f.any ? t("utility.any") : f.values.length > 12 ? t("utility.nValues", { n: f.values.length }) : list(f.values.map(fmt));
  const rows = [
    ...(c.dialect !== "unix" ? [{ name: F("Second"), text: c.second.text, values: show(c.second) }] : []),
    { name: F("Minute"), text: c.minute.text, values: show(c.minute) },
    { name: F("Hour"), text: c.hour.text, values: show(c.hour) },
    {
      name: F("Day"),
      text: c.day.text,
      values: c.day.any
        ? t("utility.any")
        : list([...(c.day.values.length ? [show(c.day)] : []), ...(c.day.last ? [c.day.lastOffset ? t("utility.nthLastDay", { n: zh ? c.day.lastOffset + 1 : c.day.lastOffset }) : t("utility.lastDay")] : [])]),
    },
    { name: F("Month"), text: c.month.text, values: show(c.month) },
    {
      name: F("Week"),
      text: c.week.text,
      values: c.week.any
        ? t("utility.any")
        : list([
            ...(c.week.values.length ? [show(c.week, weekLabel)] : []),
            ...c.week.nth.map(([w, n]) => t("utility.nthWeekday", { n, w: weekLabel(w) })),
            ...c.week.lastOf.map((w) => t("utility.lastWeekday", { w: weekLabel(w) })),
          ]),
    },
  ];
  if (c.year) rows.push({ name: F("Year"), text: c.year.text, values: show(c.year) });
  return rows;
}
