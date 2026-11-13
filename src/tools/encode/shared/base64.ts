import { t } from "@/locales";
// ---------- 字节 ↔ Base64 ----------

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  // 分段拼接，避免大文件时参数过多
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** 支持标准与 URL 安全两种写法，自动忽略空白、补齐末尾的 = */
export function base64ToBytes(base64: string): Uint8Array {
  let s = base64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*=*$/.test(s)) throw new Error(t("encode.badBase64Chars"));
  s = s.replace(/=+$/, "");
  if (s.length % 4 === 1) throw new Error(t("encode.badLength"));
  s += "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** 转成 URL 安全写法：+ → -，/ → _，去掉末尾的 = */
export const toUrlSafe = (base64: string) => base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ---------- 文本 ----------

export function textToBase64(text: string, urlSafe = false): string {
  const base64 = bytesToBase64(new TextEncoder().encode(text));
  return urlSafe ? toUrlSafe(base64) : base64;
}

/** 按 UTF-8 解码；内容不是文本（例如图片）时抛出错误 */
export function base64ToText(base64: string): string {
  const bytes = base64ToBytes(base64);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(t("encode.notText"));
  }
}
