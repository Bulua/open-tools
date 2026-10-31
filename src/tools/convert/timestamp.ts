/** 时间戳转换用到的纯函数，不依赖界面，便于测试 */

export type TimestampUnit = "auto" | "s" | "ms";

export type ParsedTime = { ok: true; date: Date; unit: "s" | "ms" | "date" } | { ok: false; message: string };

/**
 * 解析用户输入：可以是时间戳（秒或毫秒），也可以是日期文本。
 * 自动模式下，13 位左右的数字视为毫秒，10 位左右视为秒。
 */
export function parseTimeInput(input: string, unit: TimestampUnit = "auto"): ParsedTime {
  const s = input.trim();
  if (!s) return { ok: false, message: "" };

  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    const asMs = unit === "ms" || (unit === "auto" && Math.abs(n) >= 1e11);
    const date = new Date(asMs ? n : n * 1000);
    if (isNaN(date.getTime())) return { ok: false, message: "时间戳超出范围" };
    return { ok: true, date, unit: asMs ? "ms" : "s" };
  }

  // 「2024-01-02 03:04:05」这种写法按本地时间解析
  const normalized = /^\d{4}-\d{1,2}-\d{1,2} \d/.test(s) ? s.replace(" ", "T") : s;
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return { ok: false, message: "无法识别，请输入时间戳或日期，例如 2024-01-02 03:04:05" };
  return { ok: true, date, unit: "date" };
}
