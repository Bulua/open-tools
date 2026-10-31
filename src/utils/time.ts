/** 时间格式化，多个工具共用 */

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

/** Date → 2024-01-02 03:04:05（本地时间） */
export function formatDateTime(date: Date, withMs = false): string {
  const s = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return withMs ? `${s}.${pad(date.getMilliseconds(), 3)}` : s;
}

/** 与现在的相对时间，例如「3 天后」「2 小时前」；date 与 now 均为毫秒时间戳 */
export function relativeTime(date: number, now = Date.now()): string {
  const diff = (date - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 5) return "刚刚";
  const units: [number, string][] = [
    [86400 * 365, "年"],
    [86400 * 30, "个月"],
    [86400, "天"],
    [3600, "小时"],
    [60, "分钟"],
    [1, "秒"],
  ];
  const [size, unit] = units.find(([s]) => abs >= s)!;
  const n = Math.floor(abs / size);
  return diff >= 0 ? `${n} ${unit}后` : `${n} ${unit}前`;
}
