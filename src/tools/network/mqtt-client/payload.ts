import { MAX_PAYLOAD } from "./mqtt";

export const PAYLOAD_FORMATS = ["text", "base64", "json", "hex"] as const;
export type PayloadFormat = (typeof PAYLOAD_FORMATS)[number];
type PayloadError = "jsonError" | "base64Error" | "hexError" | "payloadError";
export type EncodedPayload = { bytes: Uint8Array; error?: never } | { bytes?: never; error: PayloadError };

export function isPayloadFormat(value: unknown): value is PayloadFormat {
  return PAYLOAD_FORMATS.some(format => format === value);
}

/** 格式决定输入的解释方式；切换格式不会改写编辑器内的原文。 */
export function encodePayload(payload: string, format: PayloadFormat): EncodedPayload {
  let bytes: Uint8Array;
  if (format === "hex") {
    const compact = payload.replace(/\s/g, "");
    if (compact.length % 2 || /[^0-9a-f]/i.test(compact)) return { error: "hexError" };
    if (compact.length / 2 > MAX_PAYLOAD) return { error: "payloadError" };
    bytes = Uint8Array.from(compact.match(/../g) ?? [], pair => parseInt(pair, 16));
  } else if (format === "base64") {
    const compact = payload.replace(/\s/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1 || (compact.includes("=") && compact.length % 4 !== 0)) return { error: "base64Error" };
    try {
      const decoded = atob(compact);
      // 同时拒绝非规范的尾部填充位，允许省略末尾的等号。
      if (btoa(decoded).replace(/=+$/, "") !== compact.replace(/=+$/, "")) return { error: "base64Error" };
      if (decoded.length > MAX_PAYLOAD) return { error: "payloadError" };
      bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
    } catch { return { error: "base64Error" }; }
  } else {
    bytes = new TextEncoder().encode(payload);
    if (bytes.length > MAX_PAYLOAD) return { error: "payloadError" };
    if (format === "json") {
      try { JSON.parse(payload); } catch { return { error: "jsonError" }; }
    }
  }
  return { bytes };
}

/** 所有展示都从原始字节生成，不把二进制先转成文本再编码。 */
export function formatPayload(rawPayload: readonly number[], format: PayloadFormat): string {
  if (format === "hex") return rawPayload.map(byte => byte.toString(16).padStart(2, "0")).join(" ");
  const bytes = Uint8Array.from(rawPayload);
  if (format === "base64") {
    let binary = "";
    // 分块处理，256 KiB 的消息也不会触发函数参数数量上限。
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(binary);
  }
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
  if (format === "json") {
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch { /* 非 JSON 消息仍可阅读原始文本。 */ }
  }
  return text;
}
