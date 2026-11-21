import { t } from "@/locales";

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
 * 通过 Tauri HTTP 插件下载，返回内容和响应头，支持 Referer、Cookie 等请求头。
 */
export async function fetchBytes(url: string, o: FetchOptions = {}): Promise<{ data: Uint8Array; headers: [string, string][]; url: string }> {
  const headers = o.headers ?? [];
  let res: Response;
  let total = 0;
  let list: [string, string][] = [];
  /** 跟随跳转后的地址 */
  let finalUrl = url;
  try {
    const { fetch } = await import("@tauri-apps/plugin-http");
    res = await fetch(url, { headers, signal: o.signal });
    if (!res.ok) throw new FriendlyError(t("network.downloadFailed", { status: res.status }));
    total = Number(res.headers.get("content-length")) || 0;
    res.headers.forEach((v, k) => list.push([k, v]));
    finalUrl = res.url || url;
  } catch (e) {
    if (o.signal?.aborted) throw new Error(t("network.cancelled"));
    if (e instanceof FriendlyError) throw e;
    throw new Error(friendlyError(e instanceof Error ? e.message : String(e)));
  }
  return { data: await readBody(res, total, o.onProgress), headers: list, url: finalUrl };
}
