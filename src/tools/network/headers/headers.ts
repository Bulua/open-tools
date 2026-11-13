import type { ParsedRequest } from "../shared/parseRequest";
/**
 * 请求头转换：把浏览器复制的请求头、cURL 命令或 JSON 解析成统一的请求信息，
 * 再生成 JSON、cURL（bash / Windows CMD）、fetch、Python requests 等写法。
 */

// ---------- 输出 ----------

export interface OutputOptions {
  /** 去掉 Cookie */
  dropCookie: boolean;
  /** 去掉 Content-Length、Host 等由工具自动生成的请求头 */
  dropAuto: boolean;
}

const AUTO = /^(content-length|host|connection|accept-encoding)$/i;

export function filterHeaders(headers: [string, string][], o: OutputOptions): [string, string][] {
  return headers.filter(([k]) => !(o.dropCookie && /^cookie$/i.test(k)) && !(o.dropAuto && AUTO.test(k)));
}

/** 转成对象：同名请求头合并（Cookie 用分号，其他用逗号） */
export function toHeaderObject(headers: [string, string][]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [k, v] of headers) {
    const existing = Object.keys(obj).find((x) => x.toLowerCase() === k.toLowerCase());
    if (existing) obj[existing] += /^cookie$/i.test(k) ? `; ${v}` : `, ${v}`;
    else obj[k] = v;
  }
  return obj;
}

export const toJson = (headers: [string, string][]) => JSON.stringify(toHeaderObject(headers), null, 2);

export const toHeaderText = (headers: [string, string][]) => headers.map(([k, v]) => `${k}: ${v}`).join("\n");

const bashQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const cmdQuote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "%%")}"`;

export function toCurl(req: ParsedRequest, headers: [string, string][], shell: "bash" | "cmd" = "bash"): string {
  const q = shell === "bash" ? bashQuote : cmdQuote;
  const parts = [`curl ${q(req.url || "https://example.com/")}`];
  const method = req.method || (req.body ? "POST" : "GET");
  if (method !== "GET" && !(method === "POST" && req.body)) parts.push(`-X ${method}`);
  for (const [k, v] of headers) parts.push(`-H ${q(`${k}: ${v}`)}`);
  if (req.body) parts.push(`--data-raw ${q(req.body)}`);
  return parts.join(shell === "bash" ? " \\\n  " : " ^\n  ");
}

const jsString = (s: string) => JSON.stringify(s);

export function toFetch(req: ParsedRequest, headers: [string, string][]): string {
  const method = req.method || (req.body ? "POST" : "GET");
  const lines = [`fetch(${jsString(req.url || "https://example.com/")}, {`, `  method: ${jsString(method)},`];
  const h = toHeaderObject(headers);
  lines.push(`  headers: ${JSON.stringify(h, null, 2).replace(/\n/g, "\n  ")},`);
  if (req.body) lines.push(`  body: ${jsString(req.body)},`);
  lines.push("});");
  return lines.join("\n");
}

const pyString = (s: string) => JSON.stringify(s);

export function toPython(req: ParsedRequest, headers: [string, string][]): string {
  const method = (req.method || (req.body ? "POST" : "GET")).toLowerCase();
  const h = toHeaderObject(headers);
  const entries = Object.entries(h).map(([k, v]) => `    ${pyString(k)}: ${pyString(v)},`);
  const lines = ["import requests", "", `headers = {`, ...entries, "}", ""];
  const args = [pyString(req.url || "https://example.com/"), "headers=headers"];
  if (req.body) {
    lines.push(`data = ${pyString(req.body)}`, "");
    args.push("data=data");
  }
  const known = ["get", "post", "put", "delete", "patch", "head", "options"].includes(method);
  if (!known) args.unshift(pyString(method.toUpperCase()));
  lines.push(`response = requests.${known ? method : "request"}(${args.join(", ")})`);
  lines.push("print(response.status_code)", "print(response.text)");
  return lines.join("\n");
}
