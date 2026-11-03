/** 时间格式化，多个工具共用 */
import { locale, t } from "@/locales";

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

/** Date → 2024-01-02 03:04:05（本地时间） */
export function formatDateTime(date: Date, withMs = false): string {
  const s = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return withMs ? `${s}.${pad(date.getMilliseconds(), 3)}` : s;
}

/**
 * 与现在的相对时间，例如「3 天后」「2 小时前」（英文为 in 3 days、2 hours ago）；date 与 now 均为毫秒时间戳。
 * 中文沿用原来的写法（数字和单位之间有空格），其他语言交给 Intl.RelativeTimeFormat。
 */
export function relativeTime(date: number, now = Date.now()): string {
  const diff = (date - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 5) return t("time.justNow");
  const units: [number, Intl.RelativeTimeFormatUnit, string][] = [
    [86400 * 365, "year", "年"],
    [86400 * 30, "month", "个月"],
    [86400, "day", "天"],
    [3600, "hour", "小时"],
    [60, "minute", "分钟"],
    [1, "second", "秒"],
  ];
  const [size, unit, zh] = units.find(([s]) => abs >= s)!;
  const n = Math.floor(abs / size);
  if (locale.value !== "zh-CN") return new Intl.RelativeTimeFormat(locale.value).format(diff >= 0 ? n : -n, unit);
  return diff >= 0 ? `${n} ${zh}后` : `${n} ${zh}前`;
}
