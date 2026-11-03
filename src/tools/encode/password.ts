/**
 * 随机密码生成：使用系统的安全随机数（crypto.getRandomValues），密码不会保存或上传。
 */
import { locale, t } from "@/locales";

export interface PasswordOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  /** 自定义字符，会加入字符集 */
  custom: string;
  /** 排除容易看错的字符，如 0 O o 1 l I */
  excludeAmbiguous: boolean;
  /** 每种选中的字符至少出现一次 */
  requireEach: boolean;
}

export const CHARSETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>?/~",
};
export const AMBIGUOUS = "0Oo1lI|`'\"";

export const DEFAULT_PASSWORD: PasswordOptions = {
  length: 16,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  custom: "",
  excludeAmbiguous: false,
  requireEach: true,
};

/** 0 ≤ n < max 的安全随机整数（拒绝采样，避免取模带来的偏差） */
export function secureRandomInt(max: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

/** 选中的各组字符（已去掉易混淆字符和重复字符） */
export function charGroups(o: PasswordOptions): string[] {
  const clean = (s: string) => [...new Set(s)].filter((c) => !(o.excludeAmbiguous && AMBIGUOUS.includes(c)) && c.trim()).join("");
  const groups = [o.upper && CHARSETS.upper, o.lower && CHARSETS.lower, o.digits && CHARSETS.digits, o.symbols && CHARSETS.symbols]
    .filter((g): g is string => !!g)
    .map(clean);
  // 自定义字符中不在其他组里的部分单独成组
  const used = new Set(groups.join(""));
  const custom = clean(o.custom).split("").filter((c) => !used.has(c)).join("");
  if (custom) groups.push(custom);
  return groups.filter(Boolean);
}

export function generatePassword(o: PasswordOptions, randomInt: (max: number) => number = secureRandomInt): string {
  const groups = charGroups(o);
  if (!groups.length) throw new Error(t("encode.needCharset"));
  const all = groups.join("");
  const length = Math.max(1, Math.floor(o.length));
  const chars: string[] = [];
  // 先从每组各取一个，保证都出现，再随机补足并打乱
  if (o.requireEach && length >= groups.length) for (const g of groups) chars.push(g[randomInt(g.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** 密码强度：按字符集大小和长度估算的熵（比特） */
export function passwordStrength(o: PasswordOptions): { bits: number; level: 0 | 1 | 2 | 3; label: string } {
  const size = charGroups(o).join("").length;
  const bits = size > 1 ? Math.round(o.length * Math.log2(size)) : 0;
  const level = bits < 40 ? 0 : bits < 60 ? 1 : bits < 90 ? 2 : 3;
  return { bits, level, label: t(`encode.${(["weak", "fair", "strong", "veryStrong"] as const)[level]}`) };
}

/** 暴力破解所需时间的大致描述（按每秒一百亿次尝试估算） */
export function crackTime(bits: number): string {
  const seconds = 2 ** bits / 2 / 1e10;
  if (seconds < 1) return t("encode.instant");
  // 中文按亿年、万年计，英文按 billion、million years 计；最大一档超过一万亿年时不再写具体数字
  const units: [number, string][] =
    locale.value === "zh-CN"
      ? [
          [31536000 * 1e8, "亿年"],
          [31536000 * 1e4, "万年"],
          [31536000, "年"],
          [86400, "天"],
          [3600, "小时"],
          [60, "分钟"],
          [1, "秒"],
        ]
      : [
          [31536000 * 1e9, "billion years"],
          [31536000 * 1e6, "million years"],
          [31536000, "years"],
          [86400, "days"],
          [3600, "hours"],
          [60, "minutes"],
          [1, "seconds"],
        ];
  if (seconds >= 31536000 * 1e12) return t("encode.overTrillion");
  const [size, unit] = units.find(([s]) => seconds >= s)!;
  const n = seconds / size;
  return t("encode.about", { n: n >= 100 ? Math.round(n) : Number(n.toPrecision(2)), unit });
}
