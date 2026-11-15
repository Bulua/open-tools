import { sendMode, friendlyError, FriendlyError, PROXY_PATH } from "../shared/transport";
import { locale, t } from "@/locales";

/**
 * HTTP 请求工具的核心逻辑：根据界面上的设置组装请求、发送、识别响应内容的类型。
 *
 * 发送方式：
 * - 桌面版：由 Rust 发出（Tauri HTTP 插件），不受跨域限制，可以设置任何请求头
 * - 网页版开发时：经开发服务器转发（见 scripts/devProxy.ts），同样不受跨域限制
 * - 其他情况：浏览器直接发送，受跨域限制
 */

export interface KeyValue {
  enabled: boolean;
  key: string;
  value: string;
  /** multipart 表单中的文件 */
  file?: File | null;
}

export type BodyType = "none" | "json" | "text" | "form" | "multipart" | "binary";
export type AuthType = "none" | "bearer" | "basic";

export interface RequestModel {
  method: string;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: { type: AuthType; token: string; username: string; password: string };
  bodyType: BodyType;
  /** JSON / 文本请求体 */
  bodyText: string;
  /** 文本请求体的类型，例如 text/plain、application/xml */
  textType: string;
  form: KeyValue[];
  multipart: KeyValue[];
  binary: File | null;
  /** 超时（秒） */
  timeout: number;
  followRedirects: boolean;
  /** 忽略 HTTPS 证书错误（只有桌面版支持） */
  insecure: boolean;
}

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export const emptyRow = (): KeyValue => ({ enabled: true, key: "", value: "" });

export const newRequest = (): RequestModel => ({
  method: "GET",
  url: "",
  params: [emptyRow()],
  headers: [emptyRow()],
  auth: { type: "none", token: "", username: "", password: "" },
  bodyType: "none",
  bodyText: "",
  textType: "text/plain",
  form: [emptyRow()],
  multipart: [emptyRow()],
  binary: null,
  timeout: 30,
  followRedirects: true,
  insecure: false,
});

// ---------- 网址与查询参数 ----------

/** 补全协议：example.com → https://example.com；localhost 等用 http */
export function normalizeUrl(url: string): string {
  const u = url.trim();
  if (!u || /^[a-z][a-z\d+.-]*:\/\//i.test(u)) return u;
  return /^(localhost|127\.|10\.|192\.168\.|\[::1\])/i.test(u) ? `http://${u}` : `https://${u}`;
}

/** 网址中的查询参数（保留顺序，没有值的参数 value 为空） */
export function parseQuery(url: string): KeyValue[] {
  const q = url.indexOf("?");
  if (q < 0) return [];
  const query = url.slice(q + 1).split("#")[0];
  if (!query) return [];
  const decode = (s: string) => {
    try {
      return decodeURIComponent(s.replace(/\+/g, " "));
    } catch {
      return s;
    }
  };
  return query.split("&").map((part) => {
    const eq = part.indexOf("=");
    return { enabled: true, key: decode(eq < 0 ? part : part.slice(0, eq)), value: eq < 0 ? "" : decode(part.slice(eq + 1)) };
  });
}

/** 用参数表替换网址中的查询参数（只保留启用、有名称的） */
export function applyQuery(url: string, params: KeyValue[]): string {
  const hashAt = url.indexOf("#");
  const hash = hashAt < 0 ? "" : url.slice(hashAt);
  const base = (hashAt < 0 ? url : url.slice(0, hashAt)).split("?")[0];
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, "+");
  const query = params
    .filter((p) => p.enabled && p.key)
    .map((p) => (p.value === "" ? enc(p.key) : `${enc(p.key)}=${enc(p.value)}`))
    .join("&");
  return base + (query ? `?${query}` : "") + hash;
}

// ---------- 组装请求 ----------

export interface PreparedRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body: BodyInit | null;
}

const hasHeader = (headers: [string, string][], name: string) => headers.some(([k]) => k.toLowerCase() === name.toLowerCase());
const base64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

/** 按界面设置组装请求：认证写入 Authorization，请求体自动加上 Content-Type（用户自己设置了就不加） */
export function prepareRequest(m: RequestModel): PreparedRequest {
  const url = normalizeUrl(m.url);
  if (!url) throw new Error(t("network.needUrl"));
  try {
    new URL(url);
  } catch {
    throw new Error(t("network.badUrl"));
  }
  const headers: [string, string][] = m.headers.filter((h) => h.enabled && h.key.trim()).map((h) => [h.key.trim(), h.value]);
  if (m.auth.type === "bearer" && m.auth.token.trim() && !hasHeader(headers, "authorization")) headers.push(["Authorization", `Bearer ${m.auth.token.trim()}`]);
  if (m.auth.type === "basic" && (m.auth.username || m.auth.password) && !hasHeader(headers, "authorization")) {
    headers.push(["Authorization", `Basic ${base64(`${m.auth.username}:${m.auth.password}`)}`]);
  }

  const contentType = (type: string) => !hasHeader(headers, "content-type") && headers.push(["Content-Type", type]);
  let body: BodyInit | null = null;
  if (m.method !== "GET" && m.method !== "HEAD") {
    switch (m.bodyType) {
      case "json":
        body = m.bodyText;
        contentType("application/json");
        break;
      case "text":
        body = m.bodyText;
        contentType(m.textType || "text/plain");
        break;
      case "form":
        body = new URLSearchParams(m.form.filter((f) => f.enabled && f.key).map((f) => [f.key, f.value])).toString();
        contentType("application/x-www-form-urlencoded");
        break;
      case "multipart": {
        // Content-Type（带 boundary）由 FormData 自动生成
        const fd = new FormData();
        for (const f of m.multipart) if (f.enabled && f.key) f.file ? fd.append(f.key, f.file, f.file.name) : fd.append(f.key, f.value);
        body = fd;
        break;
      }
      case "binary":
        if (m.binary) {
          body = m.binary;
          contentType(m.binary.type || "application/octet-stream");
        }
        break;
    }
  }
  return { method: m.method, url, headers, body };
}

/** 请求体转成字节和 Content-Type（FormData 的 boundary 由浏览器生成） */
async function encodeBody(body: BodyInit | null): Promise<{ bytes: Uint8Array | null; type: string | null }> {
  if (body === null) return { bytes: null, type: null };
  const req = new Request("http://localhost/", { method: "POST", body });
  return { bytes: new Uint8Array(await req.arrayBuffer()), type: req.headers.get("content-type") };
}

// ---------- 发送 ----------

export interface HttpResponse {
  status: number;
  statusText: string;
  /** 跟随跳转后的最终地址 */
  url: string;
  headers: [string, string][];
  body: Uint8Array;
  /** 耗时（毫秒） */
  time: number;
  /** 请求实际发送的大小（字节） */
  requestSize: number;
}

export async function sendRequest(m: RequestModel, signal?: AbortSignal): Promise<HttpResponse> {
  const req = prepareRequest(m);
  const { bytes, type } = await encodeBody(req.body);
  const headers = [...req.headers];
  if (type && !hasHeader(headers, "content-type")) headers.push(["Content-Type", type]);
  const timeout = Math.max(1, m.timeout || 30) * 1000;
  const mode = sendMode();
  const started = performance.now();

  if (mode === "dev-proxy") {
    const res = await fetch(PROXY_PATH, {
      method: "POST",
      headers: {
        "x-ot-url": encodeURIComponent(req.url),
        "x-ot-method": encodeURIComponent(req.method),
        "x-ot-headers": encodeURIComponent(JSON.stringify(headers)),
        "x-ot-timeout": String(timeout),
        "x-ot-redirect": m.followRedirects ? "follow" : "manual",
      },
      body: bytes as Uint8Array<ArrayBuffer> | null,
      signal,
    });
    const error = res.headers.get("x-ot-error");
    if (error !== null) throw new FriendlyError(friendlyError(decodeURIComponent(error)));
    const body = new Uint8Array(await res.arrayBuffer());
    return {
      status: Number(res.headers.get("x-ot-status")),
      statusText: decodeURIComponent(res.headers.get("x-ot-status-text") ?? ""),
      url: decodeURIComponent(res.headers.get("x-ot-final-url") ?? "") || req.url,
      headers: JSON.parse(decodeURIComponent(res.headers.get("x-ot-headers") ?? "[]")),
      body,
      time: performance.now() - started,
      requestSize: bytes?.length ?? 0,
    };
  }

  const timer = AbortSignal.timeout(timeout);
  const combined = signal ? AbortSignal.any([signal, timer]) : timer;
  const init: RequestInit = { method: req.method, headers, body: bytes as Uint8Array<ArrayBuffer> | null, signal: combined, redirect: m.followRedirects ? "follow" : "manual" };
  let res: Response;
  try {
    if (mode === "desktop") {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      res = await tauriFetch(req.url, {
        ...init,
        maxRedirections: m.followRedirects ? 10 : 0,
        connectTimeout: timeout,
        danger: m.insecure ? { acceptInvalidCerts: true, acceptInvalidHostnames: true } : undefined,
      });
    } else {
      res = await fetch(req.url, init);
    }
  } catch (e) {
    if (timer.aborted) throw new Error(t("network.timeout"));
    if (signal?.aborted) throw new Error(t("network.cancelled"));
    const message = e instanceof Error ? e.message : String(e);
    if (mode === "browser" && e instanceof TypeError) throw new Error(t("network.corsFailed", { error: message }));
    throw new Error(friendlyError(message));
  }
  const body = new Uint8Array(await res.arrayBuffer());
  const list: [string, string][] = [];
  res.headers.forEach((v, k) => list.push([k, v]));
  return { status: res.status, statusText: res.statusText, url: res.url || req.url, headers: list, body, time: performance.now() - started, requestSize: bytes?.length ?? 0 };
}

// ---------- 响应内容 ----------

export type ContentKind = "json" | "html" | "xml" | "text" | "image" | "audio" | "video" | "pdf" | "binary";

export const headerValue = (headers: [string, string][], name: string) => headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? "";

/** 文件头特征：Content-Type 不准确（如 application/octet-stream）时按内容识别 */
const MAGIC: [number[], ContentKind, string][] = [
  [[0x89, 0x50, 0x4e, 0x47], "image", "image/png"],
  [[0xff, 0xd8, 0xff], "image", "image/jpeg"],
  [[0x47, 0x49, 0x46, 0x38], "image", "image/gif"],
  [[0x42, 0x4d], "image", "image/bmp"],
  [[0x25, 0x50, 0x44, 0x46], "pdf", "application/pdf"],
  [[0x49, 0x44, 0x33], "audio", "audio/mpeg"],
  [[0xff, 0xfb], "audio", "audio/mpeg"],
  [[0x4f, 0x67, 0x67, 0x53], "audio", "audio/ogg"],
  [[0x66, 0x4c, 0x61, 0x43], "audio", "audio/flac"],
  [[0x1a, 0x45, 0xdf, 0xa3], "video", "video/webm"],
];

function sniff(b: Uint8Array): { kind: ContentKind; mime: string } | null {
  for (const [sig, kind, mime] of MAGIC) if (sig.every((v, i) => b[i] === v)) return { kind, mime };
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { kind: "image", mime: "image/webp" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return { kind: "audio", mime: "audio/wav" };
  if (ascii(4, 8) === "ftyp") return /^(M4A |M4B )/.test(ascii(8, 12)) ? { kind: "audio", mime: "audio/mp4" } : { kind: "video", mime: "video/mp4" };
  return null;
}

/** 看起来是文本：前 4 KB 没有控制字符（换行、制表符除外） */
function looksLikeText(b: Uint8Array) {
  const n = Math.min(b.length, 4096);
  for (let i = 0; i < n; i++) {
    const c = b[i];
    if (c < 9 || (c > 13 && c < 32 && c !== 27)) return false;
  }
  return true;
}

/** 识别响应内容的类型：先看 Content-Type，不确定时看内容 */
export function detectKind(contentType: string, body: Uint8Array): { kind: ContentKind; mime: string } {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  if (/[/+]json$|^application\/json/.test(mime)) return { kind: "json", mime };
  if (mime === "text/html" || mime === "application/xhtml+xml") return { kind: "html", mime };
  // SVG 也是 XML，按图片显示
  if (mime === "image/svg+xml") return { kind: "image", mime };
  if (/[/+]xml$/.test(mime)) return { kind: "xml", mime };
  if (mime.startsWith("image/")) return { kind: "image", mime };
  if (mime.startsWith("audio/")) return { kind: "audio", mime };
  if (mime.startsWith("video/")) return { kind: "video", mime };
  if (mime === "application/pdf") return { kind: "pdf", mime };
  if (mime.startsWith("text/") || /javascript|ecmascript|yaml|csv|x-www-form-urlencoded/.test(mime)) return { kind: "text", mime };
  const sniffed = sniff(body);
  if (sniffed) return sniffed;
  if (body.length && looksLikeText(body)) {
    const head = new TextDecoder().decode(body.subarray(0, 200)).trimStart();
    if (/^[{[]/.test(head)) {
      try {
        JSON.parse(new TextDecoder().decode(body));
        return { kind: "json", mime: mime || "application/json" };
      } catch {
        // 不是 JSON
      }
    }
    if (/^<!doctype html|^<html/i.test(head)) return { kind: "html", mime: mime || "text/html" };
    if (/^<\?xml/i.test(head)) return { kind: "xml", mime: mime || "application/xml" };
    return { kind: "text", mime: mime || "text/plain" };
  }
  return { kind: "binary", mime: mime || "application/octet-stream" };
}

/** 按 Content-Type 中的 charset 解码文本（支持 GBK 等） */
export function decodeText(body: Uint8Array, contentType: string): string {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder().decode(body);
  }
}

/** JSON 格式化；不是合法 JSON 时原样返回 */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

const EXT: Record<string, string> = {
  "application/json": "json",
  "text/html": "html",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/xml": "xml",
  "text/xml": "xml",
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/zip": "zip",
  "application/javascript": "js",
  "text/javascript": "js",
  "text/css": "css",
};

/** 保存时的文件名：优先用 Content-Disposition，其次是网址最后一段，最后按类型命名 */
export function responseFileName(headers: [string, string][], url: string, mime: string): string {
  const cd = headerValue(headers, "content-disposition");
  const star = cd.match(/filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[2].trim().replace(/^"|"$/g, ""));
    } catch {
      // 编码不正确时继续用其他方式
    }
  }
  const plain = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
  if (plain) return plain[1].trim();
  const ext = EXT[mime] ?? "bin";
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    if (last && /\.[\w]{1,8}$/.test(last)) return last;
    if (last) return `${last}.${ext}`;
  } catch {
    // 网址无法解析
  }
  return `response.${ext}`;
}

/** 十六进制预览：每行 16 个字节，右侧显示可打印字符 */
export function hexDump(body: Uint8Array, limit = 4096): string {
  const lines: string[] = [];
  const n = Math.min(body.length, limit);
  for (let i = 0; i < n; i += 16) {
    const row = body.subarray(i, Math.min(i + 16, n));
    const hex = Array.from(row, (b) => b.toString(16).padStart(2, "0")).join(" ");
    const text = Array.from(row, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
    lines.push(`${i.toString(16).padStart(8, "0")}  ${hex.padEnd(47)}  ${text}`);
  }
  if (body.length > limit) lines.push(t("network.hexMore", { total: body.length, limit }));
  return lines.join("\n");
}

/** 当前请求转成 cURL 命令（文件类请求体用 @文件名 表示） */
export function toCurlCommand(m: RequestModel): string {
  const req = prepareRequest(m);
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const parts = [`curl ${q(req.url)}`];
  if (req.method !== "GET") parts.push(`-X ${req.method}`);
  for (const [k, v] of req.headers) parts.push(`-H ${q(`${k}: ${v}`)}`);
  if (m.bodyType === "multipart" && req.body) {
    for (const f of m.multipart) if (f.enabled && f.key) parts.push(`-F ${q(f.file ? `${f.key}=@${f.file.name}` : `${f.key}=${f.value}`)}`);
  } else if (m.bodyType === "binary" && m.binary) parts.push(`--data-binary ${q(`@${m.binary.name}`)}`);
  else if (typeof req.body === "string" && req.body) parts.push(`--data-raw ${q(req.body)}`);
  if (!m.followRedirects) parts.push("--max-redirs 0");
  else parts.push("-L");
  if (m.insecure) parts.push("-k");
  return parts.join(" \\\n  ");
}

/** 状态码说明，没有的返回空字符串 */
export const statusText = (code: number) => (code in STATUS_TEXT ? (locale.value === "zh-CN" ? STATUS_TEXT[code] : t(`network.s${code}`)) : "");

/** 状态码的中文说明（英文见文案 network.s200 等） */
export const STATUS_TEXT: Record<number, string> = {
  200: "成功",
  201: "已创建",
  204: "成功，没有内容",
  206: "部分内容",
  301: "永久跳转",
  302: "临时跳转",
  304: "内容没有变化",
  307: "临时跳转",
  308: "永久跳转",
  400: "请求有误",
  401: "未登录或认证失败",
  403: "没有权限",
  404: "找不到",
  405: "不支持这个请求方法",
  408: "请求超时",
  409: "冲突",
  413: "请求内容太大",
  415: "不支持的内容类型",
  422: "内容校验失败",
  429: "请求太频繁",
  500: "服务器内部错误",
  502: "网关错误",
  503: "服务暂时不可用",
  504: "网关超时",
};

// ---------- 导入 cURL ----------

/** 解析好的请求（来自 cURL 命令或浏览器复制的请求头）转成界面上的设置 */
export function fromParsed(p: { method: string; url: string; headers: [string, string][]; body: string }): RequestModel {
  const m = newRequest();
  m.method = (p.method || (p.body ? "POST" : "GET")).toUpperCase();
  m.url = p.url;
  m.params = [...parseQuery(p.url), emptyRow()];
  const contentType = p.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  m.headers = [...p.headers.map(([key, value]) => ({ enabled: true, key, value })), emptyRow()];
  if (p.body) {
    if (/x-www-form-urlencoded/i.test(contentType)) {
      m.bodyType = "form";
      m.form = [...[...new URLSearchParams(p.body)].map(([key, value]) => ({ enabled: true, key, value })), emptyRow()];
    } else {
      let json = /json/i.test(contentType);
      if (!json && !contentType) {
        try {
          JSON.parse(p.body);
          json = true;
        } catch {
          // 不是 JSON
        }
      }
      m.bodyType = json ? "json" : "text";
      m.bodyText = json ? prettyJson(p.body) : p.body;
      if (!json && contentType) m.textType = contentType.split(";")[0].trim();
    }
  }
  return m;
}

// ---------- 历史记录 ----------

export interface HistoryEntry {
  id: number;
  time: number;
  status: number | null;
  /** 不含文件（文件无法保存到历史记录中） */
  request: RequestModel;
}

/** 保存到历史记录时去掉文件 */
export const forHistory = (m: RequestModel): RequestModel => ({
  ...m,
  params: m.params.map((r) => ({ ...r })),
  headers: m.headers.map((r) => ({ ...r })),
  auth: { ...m.auth },
  form: m.form.map((r) => ({ ...r })),
  multipart: m.multipart.map((r) => ({ ...r, file: null })),
  binary: null,
});

