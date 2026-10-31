/** Base64 工具用到的纯函数（文本、文件、图片），不依赖界面，便于测试 */

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
  if (!/^[A-Za-z0-9+/]*=*$/.test(s)) throw new Error("包含 Base64 以外的字符");
  s = s.replace(/=+$/, "");
  if (s.length % 4 === 1) throw new Error("长度不正确");
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
    throw new Error("解码结果不是文本，可能是文件或图片");
  }
}

// ---------- Data URI ----------

export interface ParsedDataUri {
  mime: string;
  base64: string;
}

/** 解析 data:image/png;base64,xxxx，失败返回 null */
export function parseDataUri(text: string): ParsedDataUri | null {
  const match = /^data:([\w/+.-]*);base64,([\s\S]*)$/.exec(text.trim());
  if (!match) return null;
  return { mime: match[1] || "application/octet-stream", base64: match[2].replace(/\s+/g, "") };
}

export type FileOutputFormat = "dataUri" | "base64" | "css" | "html";

export const FILE_OUTPUT_FORMATS: { value: FileOutputFormat; label: string; imageOnly?: boolean }[] = [
  { value: "dataUri", label: "Data URI" },
  { value: "base64", label: "纯 Base64" },
  { value: "css", label: "CSS", imageOnly: true },
  { value: "html", label: "HTML", imageOnly: true },
];

/** 把 Data URI 转成需要的输出格式 */
export function formatFileOutput(dataUri: string, format: FileOutputFormat): string {
  switch (format) {
    case "dataUri":
      return dataUri;
    case "base64":
      return parseDataUri(dataUri)?.base64 ?? "";
    case "css":
      return `background-image: url("${dataUri}");`;
    case "html":
      return `<img src="${dataUri}" alt="" />`;
  }
}

// ---------- 文件类型识别 ----------

interface FileKind {
  mime: string;
  ext: string;
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/** 根据文件开头的「魔数」识别常见文件类型，识别不了返回 null */
export function detectFileKind(bytes: Uint8Array): FileKind | null {
  const b = bytes;
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return { mime: "image/png", ext: "png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (ascii(b, 0, 4) === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE") return { mime: "audio/wav", ext: "wav" };
  if (ascii(b, 0, 2) === "BM") return { mime: "image/bmp", ext: "bmp" };
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return { mime: "image/x-icon", ext: "ico" };
  if (ascii(b, 0, 4) === "%PDF") return { mime: "application/pdf", ext: "pdf" };
  if (ascii(b, 0, 4) === "PK\x03\x04") return { mime: "application/zip", ext: "zip" };
  if (b[0] === 0x1f && b[1] === 0x8b) return { mime: "application/gzip", ext: "gz" };
  if (ascii(b, 0, 3) === "ID3") return { mime: "audio/mpeg", ext: "mp3" };
  if (ascii(b, 4, 4) === "ftyp") return { mime: "video/mp4", ext: "mp4" };
  if (/<svg[\s>]/i.test(ascii(b, 0, Math.min(b.length, 512)))) return { mime: "image/svg+xml", ext: "svg" };
  return null;
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/gzip": "gz",
  "application/json": "json",
  "text/plain": "txt",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "video/mp4": "mp4",
};

export const extensionOf = (mime: string) => MIME_EXT[mime] ?? "bin";

export interface DecodedFile {
  bytes: Uint8Array;
  mime: string;
  ext: string;
  /** 浏览器可以直接显示的图片 */
  isImage: boolean;
  dataUri: string;
}

/**
 * 解码用户粘贴的 Data URI 或纯 Base64。
 * Data URI 自带类型；纯 Base64 根据文件头识别，识别不了视为普通二进制文件。
 */
export function decodeFile(text: string): DecodedFile {
  const input = text.trim();
  const parsed = parseDataUri(input);
  const bytes = base64ToBytes(parsed ? parsed.base64 : input);
  const kind = detectFileKind(bytes);
  const mime = parsed && parsed.mime !== "application/octet-stream" ? parsed.mime : (kind?.mime ?? "application/octet-stream");
  return {
    bytes,
    mime,
    ext: kind && kind.mime === mime ? kind.ext : extensionOf(mime),
    isImage: mime.startsWith("image/"),
    dataUri: `data:${mime};base64,${bytesToBase64(bytes)}`,
  };
}
