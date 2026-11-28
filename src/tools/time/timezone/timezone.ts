/**
 * 时区换算：基于浏览器内置的时区数据（Intl），自动处理夏令时。
 */
import { locale, t, translationIn } from "@/locales";
import { CITY_NAMES } from "./names";

export interface City {
  name: string;
  zone: string;
}

/** 常用城市（同一时区只列一个代表城市） */
export const CITIES: City[] = [
  { name: "北京", zone: "Asia/Shanghai" },
  { name: "香港", zone: "Asia/Hong_Kong" },
  { name: "台北", zone: "Asia/Taipei" },
  { name: "东京", zone: "Asia/Tokyo" },
  { name: "首尔", zone: "Asia/Seoul" },
  { name: "新加坡", zone: "Asia/Singapore" },
  { name: "曼谷", zone: "Asia/Bangkok" },
  { name: "雅加达", zone: "Asia/Jakarta" },
  { name: "马尼拉", zone: "Asia/Manila" },
  { name: "新德里", zone: "Asia/Kolkata" },
  { name: "迪拜", zone: "Asia/Dubai" },
  { name: "莫斯科", zone: "Europe/Moscow" },
  { name: "伊斯坦布尔", zone: "Europe/Istanbul" },
  { name: "伦敦", zone: "Europe/London" },
  { name: "巴黎", zone: "Europe/Paris" },
  { name: "柏林", zone: "Europe/Berlin" },
  { name: "阿姆斯特丹", zone: "Europe/Amsterdam" },
  { name: "罗马", zone: "Europe/Rome" },
  { name: "马德里", zone: "Europe/Madrid" },
  { name: "开罗", zone: "Africa/Cairo" },
  { name: "约翰内斯堡", zone: "Africa/Johannesburg" },
  { name: "拉各斯", zone: "Africa/Lagos" },
  { name: "纽约", zone: "America/New_York" },
  { name: "芝加哥", zone: "America/Chicago" },
  { name: "丹佛", zone: "America/Denver" },
  { name: "洛杉矶", zone: "America/Los_Angeles" },
  { name: "温哥华", zone: "America/Vancouver" },
  { name: "多伦多", zone: "America/Toronto" },
  { name: "墨西哥城", zone: "America/Mexico_City" },
  { name: "圣保罗", zone: "America/Sao_Paulo" },
  { name: "布宜诺斯艾利斯", zone: "America/Argentina/Buenos_Aires" },
  { name: "悉尼", zone: "Australia/Sydney" },
  { name: "墨尔本", zone: "Australia/Melbourne" },
  { name: "珀斯", zone: "Australia/Perth" },
  { name: "奥克兰", zone: "Pacific/Auckland" },
  { name: "檀香山", zone: "Pacific/Honolulu" },
  { name: "协调世界时 UTC", zone: "UTC" },
];

export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** 所有时区名称（运行环境不支持时退回到常用城市的时区） */
export function allZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const list = intl.supportedValuesOf?.("timeZone") ?? [];
  return [...new Set([...list, ...CITIES.map((c) => c.zone)])].sort();
}

/** 城市在当前界面语言下的名称 */
export const cityLabel = (c: City) => translationIn(CITY_NAMES, locale.value, c.zone) ?? c.name;
export const cityName = (zone: string) => {
  const city = CITIES.find((c) => c.zone === zone);
  return city ? cityLabel(city) : zone.split("/").pop()!.replace(/_/g, " ");
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsIn(date: Date, zone: string) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(zone, f);
  }
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
  };
}

/** 某个时刻在该时区相对 UTC 的偏移（分钟），东八区为 480 */
export function zoneOffset(zone: string, date: Date): number {
  const p = partsIn(date, zone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** 偏移显示为「UTC+8」「UTC-3:30」 */
export function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const m = abs % 60;
  return `UTC${sign}${Math.floor(abs / 60)}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** 时差显示为「+8 小时」「-2.5 小时」「相同」 */
export function diffLabel(minutes: number): string {
  if (!minutes) return t("convert.sameTime");
  const h = minutes / 60;
  return t(h > 0 ? "convert.ahead" : "convert.behind", { n: Number(Math.abs(h).toFixed(2)) });
}

const pad = (n: number) => String(n).padStart(2, "0");
/** 星期的简称（当前界面语言）：2023-01-01 是周日，往后数 n 天 */
const weekdayName = (n: number) => new Date(2023, 0, 1 + n).toLocaleDateString(locale.value, { weekday: "short" });

export interface ZonedTime {
  date: string;
  time: string;
  hour: number;
  weekday: string;
  /** 用于比较日期先后的数字，如 20261101 */
  dayKey: number;
}

export function timeIn(date: Date, zone: string, withSeconds = false): ZonedTime {
  const p = partsIn(date, zone);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}${withSeconds ? `:${pad(p.second)}` : ""}`,
    hour: p.hour,
    weekday: weekdayName(p.weekday),
    dayKey: p.year * 10000 + p.month * 100 + p.day,
  };
}

/** 把某个时区的「年月日时分」换算成真实时刻 */
export function zonedToDate(zone: string, year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // 用估算时刻的偏移修正两次，夏令时切换附近也能得到正确结果
  let t = guess - zoneOffset(zone, new Date(guess)) * 60000;
  t = guess - zoneOffset(zone, new Date(t)) * 60000;
  return new Date(t);
}

/** 解析「2026-11-01T14:30」（datetime-local 的值） */
export function parseLocalInput(value: string): [number, number, number, number, number] | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])] : null;
}

/** 相对基准时区是今天、明天还是昨天 */
export function dayRelation(target: ZonedTime, base: ZonedTime): string {
  if (target.dayKey === base.dayKey) return "";
  return target.dayKey > base.dayKey ? t("convert.nextDay") : t("convert.prevDay");
}
