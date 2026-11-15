import { isTauri } from "@tauri-apps/api/core";
import { t } from "@/locales";
export type SendMode = "desktop" | "dev-proxy" | "browser";
export const sendMode = (): SendMode => (isTauri() ? "desktop" : import.meta.env.DEV ? "dev-proxy" : "browser");

export const PROXY_PATH = "/__open_tools_proxy";

/** 常见的网络错误换成容易看懂的说明 */
export function friendlyError(message: string): string {
  const rules: [RegExp, string][] = [
    [/ENOTFOUND|dns error|failed to lookup|No such host/i, "dnsFailed"],
    [/ECONNREFUSED|Connection refused|actively refused/i, "refused"],
    [/ETIMEDOUT|timed out|timeout/i, "timeout"],
    [/certificate|CERT_|self.signed|SSL|TLS/i, "certError"],
    [/ECONNRESET|connection reset|closed/i, "reset"],
  ];
  const hit = rules.find(([re]) => re.test(message));
  return hit ? t("network.withDetail", { reason: t(`network.${hit[1]}`), error: message }) : t("network.requestFailed", { error: message });
}

/** 已经整理成说明文字的错误，外层不再用 friendlyError 包一次 */
export class FriendlyError extends Error {}

// ---------- 下载文件 ----------

export interface FetchOptions {
  headers?: [string, string][];
  signal?: AbortSignal;
  /** 下载进度：已下载字节数、总字节数（未知时为 0） */
  onProgress?: (loaded: number, total: number) => void;
}

/** 读取响应体，同时报告进度 */
async function readBody(res: Response, total: number, onProgress?: FetchOptions["onProgress"]): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * GET 下载，返回内容和响应头。和 HTTP 请求工具一样：桌面版由 Rust 发出、开发时经开发服务器转发，
 * 所以可以设置 Referer、Cookie 等浏览器不允许设置的请求头。状态码不是 2xx 时抛出错误。
 */
export async function fetchBytes(url: string, o: FetchOptions = {}): Promise<{ data: Uint8Array; headers: [string, string][]; url: string }> {
  const headers = o.headers ?? [];
  const mode = sendMode();
  let res: Response;
  let total = 0;
  let list: [string, string][] = [];
  /** 跟随跳转后的地址 */
  let finalUrl = url;
  try {
    if (mode === "dev-proxy") {
      res = await fetch(PROXY_PATH, {
        method: "POST",
        headers: {
          "x-ot-url": encodeURIComponent(url),
          "x-ot-method": "GET",
          "x-ot-headers": encodeURIComponent(JSON.stringify(headers)),
          "x-ot-timeout": String(30 * 60 * 1000),
        },
        signal: o.signal,
      });
      const error = res.headers.get("x-ot-error");
      if (error !== null) throw new Error(friendlyError(decodeURIComponent(error)));
      const status = Number(res.headers.get("x-ot-status"));
      if (status < 200 || status >= 300) throw new FriendlyError(t("network.downloadFailed", { status }));
      total = Number(res.headers.get("x-ot-length")) || 0;
      list = JSON.parse(decodeURIComponent(res.headers.get("x-ot-headers") ?? "[]"));
      finalUrl = decodeURIComponent(res.headers.get("x-ot-final-url") ?? "") || url;
    } else {
      const doFetch = mode === "desktop" ? (await import("@tauri-apps/plugin-http")).fetch : fetch;
      res = await doFetch(url, { headers, signal: o.signal });
      if (!res.ok) throw new FriendlyError(t("network.downloadFailed", { status: res.status }));
      total = Number(res.headers.get("content-length")) || 0;
      res.headers.forEach((v, k) => list.push([k, v]));
      finalUrl = res.url || url;
    }
  } catch (e) {
    if (o.signal?.aborted) throw new Error(t("network.cancelled"));
    if (e instanceof FriendlyError) throw e;
    throw new Error(friendlyError(e instanceof Error ? e.message : String(e)));
  }
  return { data: await readBody(res, total, o.onProgress), headers: list, url: finalUrl };
}
