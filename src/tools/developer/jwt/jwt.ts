/** JWT 解码（只解码，不校验签名），不依赖界面，便于测试 */
import { t } from "@/locales";
import { base64ToText } from "../shared/base64";

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

const decodePart = (part: string, name: string) => {
  try {
    return JSON.parse(base64ToText(part));
  } catch {
    throw new Error(t("encode.badJwtPart", { name }));
  }
};

export function decodeJwt(token: string): DecodedJwt {
  // 允许带上 "Bearer " 前缀直接粘贴
  const parts = token.trim().replace(/^Bearer\s+/i, "").split(".");
  if (parts.length !== 3 && parts.length !== 2) throw new Error(t("encode.badJwt"));
  return {
    header: decodePart(parts[0], "Header"),
    payload: decodePart(parts[1], "Payload"),
    signature: parts[2] ?? "",
  };
}

export type JwtStatus = "valid" | "expired" | "notYetValid" | "noExpiry";

/** 根据 exp / nbf 判断当前状态，now 为毫秒时间戳 */
export function jwtStatus(payload: Record<string, unknown>, now = Date.now()): JwtStatus {
  const sec = now / 1000;
  if (typeof payload.nbf === "number" && payload.nbf > sec) return "notYetValid";
  if (typeof payload.exp !== "number") return "noExpiry";
  return payload.exp < sec ? "expired" : "valid";
}

