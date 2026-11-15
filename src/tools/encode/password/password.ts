import { charGroups, type PasswordOptions } from "../shared/password";
/**
 * 随机密码生成：使用系统的安全随机数（crypto.getRandomValues），密码不会保存或上传。
 */
import { locale, t } from "@/locales";

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
  // 大单位：中文按亿年、万年计，其他语言按十亿年、百万年计（名称见文案 encode.uBig 等）；最大一档超过一万亿年时不再写具体数字
  const [big, mid] = locale.value === "zh-CN" ? [1e8, 1e4] : [1e9, 1e6];
  const units: [number, string][] = [
    [31536000 * big, t("encode.uBig")],
    [31536000 * mid, t("encode.uMid")],
    [31536000, t("encode.uYear")],
    [86400, t("encode.uDay")],
    [3600, t("encode.uHour")],
    [60, t("encode.uMinute")],
    [1, t("encode.uSecond")],
  ];
  if (seconds >= 31536000 * 1e12) return t("encode.overTrillion");
  const [size, unit] = units.find(([s]) => seconds >= s)!;
  const n = seconds / size;
  return t("encode.about", { n: n >= 100 ? Math.round(n) : Number(n.toPrecision(2)), unit });
}
