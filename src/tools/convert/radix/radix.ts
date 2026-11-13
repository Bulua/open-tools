/** 进制转换用到的纯函数（支持任意大整数），不依赖界面，便于测试 */
import { t } from "@/locales";

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const PREFIX: Record<number, RegExp> = { 2: /^0b/i, 8: /^0o/i, 16: /^0x/i };

/** 按指定进制解析整数，允许 0x / 0b / 0o 前缀、空格和下划线分隔 */
export function parseInteger(input: string, base: number): bigint {
  let s = input.trim().replace(/[\s_]/g, "").toLowerCase();
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  s = s.replace(PREFIX[base] ?? /^$/, "");
  if (!s) throw new Error(t("convert.enterNumber"));

  let value = 0n;
  const b = BigInt(base);
  for (const ch of s) {
    const digit = DIGITS.indexOf(ch);
    if (digit < 0 || digit >= base) throw new Error(t("convert.badDigit", { ch, base }));
    value = value * b + BigInt(digit);
  }
  return negative ? -value : value;
}

export function formatInteger(value: bigint, base: number): string {
  return value.toString(base);
}

/** 把二进制按 4 位一组分隔，便于阅读：10110 → 1 0110 */
export function groupBinary(binary: string): string {
  const negative = binary.startsWith("-");
  const digits = negative ? binary.slice(1) : binary;
  const grouped = digits.replace(/\B(?=(\d{4})+(?!\d))/g, " ");
  return negative ? `-${grouped}` : grouped;
}
