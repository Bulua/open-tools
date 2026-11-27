/**
 * 统一处理后端 SQLite 存储与返回的本地时间文本（`YYYY-MM-DD HH:MM:SS`）。
 */

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 将 `YYYY-MM-DD HH:MM:SS`（或兼容旧数字时间戳）解析为本地 `Date`。 */
export function parseDateTime(value: string | number | null | undefined): Date {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value);
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return new Date(NaN);
  const match = DATETIME_RE.exec(text);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }
  if (/^\d+$/.test(text)) {
    return new Date(Number(text));
  }
  return new Date(text);
}

/** 将 `YYYY-MM-DD HH:MM:SS` 转换为毫秒时间戳（非法值返回 `0`）。 */
export function parseDateTimeMillis(value: string | number | null | undefined): number {
  const time = parseDateTime(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** 返回当前本地时间字符串（`YYYY-MM-DD HH:MM:SS`）。 */
export function formatNowDateTime(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
}
