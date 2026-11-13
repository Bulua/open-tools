import { t } from "@/locales";
export interface ParsedRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body: string;
  /** 输入的类型，用于界面提示 */
  source: "headers" | "curl" | "json" | "empty";
}

/** HTTP/2 的伪头部（Chrome 开发者工具里会出现 :authority 等） */
const PSEUDO = /^:(authority|method|path|scheme|protocol|status)$/i;

export function parseInput(text: string): ParsedRequest {
  const t = text.trim();
  if (!t) return { method: "", url: "", headers: [], body: "", source: "empty" };
  if (/^curl(\.exe)?\s/i.test(t)) return parseCurl(t);
  if (t.startsWith("{")) return parseJsonHeaders(t);
  return parseHeaderLines(t);
}

/** 「Key: value」逐行格式；也支持开发者工具里「键、值分两行」的复制结果和 HTTP 请求行 */
export function parseHeaderLines(text: string): ParsedRequest {
  const req: ParsedRequest = { method: "", url: "", headers: [], body: "", source: "headers" };
  let host = "";
  let path = "";
  let scheme = "https";
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    // 请求行：GET /api/list?page=1 HTTP/1.1
    const request = line.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT|TRACE)\s+(\S+)(?:\s+HTTP\/[\d.]+)?$/);
    if (request) {
      req.method = request[1];
      path = request[2];
      continue;
    }
    let key: string;
    let value: string;
    const pseudo = line.match(/^(:[a-z]+):?\s*(.*)$/i);
    if (pseudo) {
      [key, value] = [pseudo[1], pseudo[2]];
    } else {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      key = line.slice(0, idx).trim();
      value = line.slice(idx + 1).trim();
    }
    // 值在下一行（「accept:」换行「*/*」）
    if (!value && i + 1 < lines.length && lines[i + 1] && !/^[\w:-]+:/.test(lines[i + 1])) value = lines[++i];
    if (PSEUDO.test(key)) {
      const k = key.toLowerCase();
      if (k === ":authority") host = value;
      else if (k === ":method") req.method = value.toUpperCase();
      else if (k === ":path") path = value;
      else if (k === ":scheme") scheme = value;
      continue;
    }
    if (/^host$/i.test(key)) host = value;
    req.headers.push([key, value]);
  }
  if (host) req.url = `${scheme}://${host}${path || "/"}`;
  else if (/^https?:\/\//.test(path)) req.url = path;
  return req;
}

export function parseJsonHeaders(text: string): ParsedRequest {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(t("network.jsonInvalid", { error: e instanceof Error ? e.message : String(e) }));
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(t("network.jsonObject"));
  const headers: [string, string][] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(v)) v.forEach((x) => headers.push([k, String(x)]));
    else headers.push([k, typeof v === "string" ? v : JSON.stringify(v)]);
  }
  return { method: "", url: "", headers, body: "", source: "json" };
}

/** 按 shell 规则拆分命令：单引号、双引号、$'..'、反斜杠续行、Windows 的 ^ 续行 */
export function splitCommand(cmd: string): string[] {
  const s = cmd.replace(/\\\r?\n/g, " ").replace(/\^\r?\n/g, " ");
  const out: string[] = [];
  let cur = "";
  let has = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) {
      if (has) out.push(cur);
      cur = "";
      has = false;
    } else if (c === "'" || (c === "$" && s[i + 1] === "'")) {
      const ansi = c === "$";
      if (ansi) i++;
      let j = i + 1;
      while (j < s.length && s[j] !== "'") {
        if (ansi && s[j] === "\\" && j + 1 < s.length) {
          const n = s[++j];
          cur += n === "n" ? "\n" : n === "t" ? "\t" : n;
        } else cur += s[j];
        j++;
      }
      i = j;
      has = true;
    } else if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') {
        // 双引号里 \" 是转义的引号（bash 与 Windows CMD 都这样写）
        if (s[j] === "\\" && (s[j + 1] === '"' || s[j + 1] === "\\")) j++;
        cur += s[j];
        j++;
      }
      i = j;
      has = true;
    } else if (c === "\\" && i + 1 < s.length) {
      cur += s[++i];
      has = true;
    } else if (c === "^" && i + 1 < s.length) {
      // Windows CMD 的转义符
      cur += s[++i];
      has = true;
    } else {
      cur += c;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}

export function parseCurl(cmd: string): ParsedRequest {
  const args = splitCommand(cmd).slice(1);
  const req: ParsedRequest = { method: "", url: "", headers: [], body: "", source: "curl" };
  const takesValue = new Set(["-H", "--header", "-X", "--request", "-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode", "-b", "--cookie", "-A", "--user-agent", "-e", "--referer", "-u", "--user", "--url", "-o", "--output", "-m", "--max-time", "--connect-timeout", "-x", "--proxy", "-F", "--form"]);
  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    let value: string | undefined;
    // --header=xxx 写法
    const eq = a.match(/^(--[\w-]+)=(.*)$/s);
    if (eq) [a, value] = [eq[1], eq[2]];
    if (takesValue.has(a) && value === undefined) value = args[++i] ?? "";
    switch (a) {
      case "-H":
      case "--header": {
        const idx = value!.indexOf(":");
        if (idx > 0) req.headers.push([value!.slice(0, idx).trim(), value!.slice(idx + 1).trim()]);
        break;
      }
      case "-X":
      case "--request":
        req.method = value!.toUpperCase();
        break;
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
      case "--data-ascii":
      case "--data-urlencode":
        req.body = req.body ? `${req.body}&${value}` : value!;
        break;
      case "-b":
      case "--cookie":
        req.headers.push(["Cookie", value!]);
        break;
      case "-A":
      case "--user-agent":
        req.headers.push(["User-Agent", value!]);
        break;
      case "-e":
      case "--referer":
        req.headers.push(["Referer", value!]);
        break;
      case "-u":
      case "--user":
        req.headers.push(["Authorization", `Basic ${btoa(unescape(encodeURIComponent(value!)))}`]);
        break;
      case "--url":
        req.url = value!;
        break;
      default:
        if (!a.startsWith("-") && !req.url) req.url = a;
    }
  }
  if (!req.method) req.method = req.body ? "POST" : "GET";
  return req;
}
