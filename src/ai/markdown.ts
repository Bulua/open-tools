import DOMPurify from "dompurify";
import { Marked, type Tokens } from "marked";
import hljs from "highlight.js/lib/common";
import { t } from "@/locales";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LANG_TO_EXT: Record<string, string> = {
  python: "py",
  py: "py",
  python3: "py",
  javascript: "js",
  js: "js",
  mjs: "mjs",
  cjs: "cjs",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  jsx: "jsx",
  vue: "vue",
  svelte: "svelte",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "svg",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  json: "json",
  jsonc: "json",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  env: "env",
  sql: "sql",
  mysql: "sql",
  postgresql: "sql",
  postgres: "sql",
  sqlite: "sql",
  bash: "sh",
  sh: "sh",
  shell: "sh",
  zsh: "sh",
  powershell: "ps1",
  ps1: "ps1",
  pwsh: "ps1",
  bat: "bat",
  cmd: "bat",
  batch: "bat",
  rust: "rs",
  rs: "rs",
  go: "go",
  golang: "go",
  java: "java",
  kotlin: "kt",
  kt: "kt",
  swift: "swift",
  c: "c",
  h: "h",
  cpp: "cpp",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "hpp",
  csharp: "cs",
  cs: "cs",
  "c#": "cs",
  php: "php",
  ruby: "rb",
  rb: "rb",
  lua: "lua",
  r: "r",
  dart: "dart",
  scala: "scala",
  perl: "pl",
  markdown: "md",
  md: "md",
  csv: "csv",
  tsv: "tsv",
  graphql: "graphql",
  gql: "graphql",
  proto: "proto",
  protobuf: "proto",
  diff: "patch",
  patch: "patch",
  nginx: "conf",
  conf: "conf",
  log: "log",
};

const SPECIAL_FILES: Record<string, string> = {
  dockerfile: "Dockerfile",
  docker: "Dockerfile",
  makefile: "Makefile",
  make: "Makefile",
};

const DEFAULT_BASE_BY_EXT: Record<string, string> = {
  py: "script",
  sh: "script",
  ps1: "script",
  bat: "script",
  js: "index",
  mjs: "index",
  cjs: "index",
  ts: "index",
  tsx: "App",
  jsx: "App",
  vue: "Component",
  html: "index",
  css: "style",
  scss: "style",
  less: "style",
  json: "data",
  yaml: "config",
  toml: "config",
  ini: "config",
  xml: "data",
  svg: "image",
  sql: "query",
  rs: "main",
  go: "main",
  c: "main",
  cpp: "main",
  cs: "Program",
  java: "Main",
  kt: "Main",
  swift: "main",
  php: "index",
  rb: "script",
  md: "document",
  csv: "data",
  txt: "snippet",
};

/** 尝试从首行注释中提取显式声明的文件名（如 `# app.py`、`// foo/bar.ts`、`<!-- index.html -->`） */
function extractCommentFileName(code: string): string | null {
  const lines = code.split(/\r?\n/).slice(0, 2);
  for (const raw of lines) {
    const line = raw.trim();
    const match = line.match(/^(?:#|\/\/|--|\/\*|<!--)\s*(?:file(?:name)?:\s*)?([^\s*<>:"|?]+?\.[a-zA-Z0-9]{1,8})\s*(?:\*\/|-->)?$/i);
    if (!match) continue;
    const base = match[1].split(/[\\/]/).pop() ?? "";
    if (/^[a-zA-Z0-9._-]+\.[a-zA-Z0-9]{1,8}$/.test(base) && !base.startsWith(".")) {
      return base;
    }
  }
  return null;
}

/** 当未声明语言或声明为 text 时，结合代码正文特征自动推断合适的扩展名 */
function detectExtFromContent(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "txt";

  // 1. Shebang
  const firstLine = trimmed.split(/\r?\n/, 1)[0];
  if (/^#!.*\bpython[23]?\b/i.test(firstLine)) return "py";
  if (/^#!.*\b(bash|sh|zsh)\b/i.test(firstLine)) return "sh";
  if (/^#!.*\bnode\b/i.test(firstLine)) return "js";
  if (/^#!.*\b(pwsh|powershell)\b/i.test(firstLine)) return "ps1";

  // 2. JSON
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // 非合法 JSON，继续识别
    }
  }

  // 3. HTML / SVG / XML / PHP
  if (/^<!doctype\s+html\b|^<html\b/i.test(trimmed)) return "html";
  if (/^<svg\b/i.test(trimmed)) return "svg";
  if (/^<\?xml\b/i.test(trimmed)) return "xml";
  if (/^<\?php\b/i.test(trimmed)) return "php";

  // 4. Dockerfile
  if (/^FROM\s+\S+/m.test(trimmed) && /^(RUN|WORKDIR|COPY|ADD|ENV|CMD|ENTRYPOINT)\s+/m.test(trimmed)) {
    return "dockerfile";
  }

  // 5. Python
  if (
    /^from\s+[\w.]+\s+import\s+/m.test(trimmed) ||
    /^def\s+\w+\s*\([^)]*\)\s*(?:->\s*[^:]+)?:/m.test(trimmed) ||
    /if\s+__name__\s*==\s*["']__main__["']\s*:/.test(trimmed)
  ) {
    return "py";
  }

  // 6. Rust
  if (/^\s*(pub\s+)?(async\s+)?fn\s+\w+\s*\(/m.test(trimmed) && (/\blet\s+(mut\s+)?\w+/.test(trimmed) || /\buse\s+[\w:]+;/.test(trimmed))) {
    return "rs";
  }

  // 7. Go
  if (/^package\s+\w+/m.test(trimmed) && /^func\s+\w*\s*\(/m.test(trimmed)) {
    return "go";
  }

  // 8. Java
  if (/\bpublic\s+(class|interface|enum|record)\s+\w+/.test(trimmed)) {
    return "java";
  }

  // 9. C / C++
  if (/^#include\s*[<"]/m.test(trimmed)) {
    return /\b(std::|iostream|vector|string|namespace\s+std)\b/.test(trimmed) ? "cpp" : "c";
  }

  // 10. SQL
  if (/\b(SELECT\s+.+\s+FROM\s+|CREATE\s+TABLE\s+|INSERT\s+INTO\s+|ALTER\s+TABLE\s+|DELETE\s+FROM\s+)/i.test(trimmed)) {
    return "sql";
  }

  // 11. TypeScript / JavaScript
  if (
    /^\s*(export\s+)?(interface|type)\s+\w+/m.test(trimmed) ||
    /:\s*(string|number|boolean|unknown|Record<|Promise<)/.test(trimmed)
  ) {
    return "ts";
  }
  if (
    /^\s*(import\s+.+\s+from\s+["']|export\s+(default|const|function)\b|const\s+\w+\s*=\s*\(|function\s+\w+\s*\()/m.test(trimmed)
  ) {
    return "js";
  }

  // 12. PowerShell
  if (/\b(Get-|Set-|New-|Remove-|Write-Host|Invoke-RestMethod)\w*|\$env:/i.test(trimmed)) {
    return "ps1";
  }

  // 13. Shell
  if (/^\s*(export\s+\w+=|if\s+\[\s+|for\s+\w+\s+in\s+|set\s+-[euo])/m.test(trimmed)) {
    return "sh";
  }

  // 14. CSS
  if (/^[.#@]?[a-zA-Z0-9_:*\-[\]="'\s,>~+]+\{\s*[\r\n]+\s*[a-z-]+\s*:\s*[^;]+;/m.test(trimmed)) {
    return "css";
  }

  return "txt";
}

/** 结合代码块语言标识和具体正文内容推断默认下载文件名（含后缀） */
export function inferCodeFileName(code: string, declaredLang?: string): string {
  const commentName = extractCommentFileName(code);
  if (commentName) return commentName;

  const lang = (declaredLang ?? "").trim().toLowerCase();
  if (lang && lang in SPECIAL_FILES) return SPECIAL_FILES[lang];

  const isGeneric = !lang || lang === "text" || lang === "plaintext" || lang === "txt" || lang === "plain";
  const ext = isGeneric ? detectExtFromContent(code) : (LANG_TO_EXT[lang] ?? "txt");

  if (ext === "dockerfile") return "Dockerfile";
  if (ext === "java") {
    const cls = code.match(/\bpublic\s+(?:class|interface|enum|record)\s+(\w+)/);
    if (cls?.[1]) return `${cls[1]}.java`;
  }

  const base = DEFAULT_BASE_BY_EXT[ext] ?? "snippet";
  return `${base}.${ext}`;
}

export interface ParsedFileLink {
  path: string;
  startLine?: number;
  endLine?: number;
}

/** 解析 Markdown 中的 file:// 本地文件链接，提取标准化路径与可选行号区间（#L10 / #L10-L25） */
export function parseFileLinkHref(rawHref: string): ParsedFileLink | null {
  const trimmed = (rawHref ?? "").trim();
  if (!/^file:\/\//i.test(trimmed)) return null;

  const hashIdx = trimmed.indexOf("#");
  const baseUrl = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
  const hash = hashIdx >= 0 ? trimmed.slice(hashIdx + 1) : "";

  let rawPath = baseUrl.replace(/^file:\/\//i, "");
  try {
    rawPath = decodeURIComponent(rawPath);
  } catch {
    // 保留原字符串
  }
  rawPath = rawPath.replace(/\\/g, "/");
  // file:///D:/path -> D:/path
  if (/^\/[a-zA-Z]:\//.test(rawPath)) {
    rawPath = rawPath.slice(1);
  }
  rawPath = rawPath.trim();
  if (!rawPath) return null;

  let startLine: number | undefined;
  let endLine: number | undefined;
  const lineMatch = hash.match(/^L(\d+)(?:-L?(\d+))?$/i);
  if (lineMatch) {
    const start = Number(lineMatch[1]);
    const end = lineMatch[2] ? Number(lineMatch[2]) : undefined;
    if (Number.isFinite(start) && start > 0) {
      startLine = start;
      if (end && Number.isFinite(end) && end >= start) {
        endLine = end;
      }
    }
  }

  return { path: rawPath, startLine, endLine };
}

/**
 * 渲染 AI 对话里的 Markdown：支持 GFM、代码块高亮、下载与一键复制按钮、file:// 文件链接，输出经 DOMPurify 清理。
 */
export function renderChatMarkdown(source: string): string {
  const marked = new Marked({ gfm: true, breaks: true });
  const copyLabel = escapeHtml(t("common.copy"));
  const downloadLabel = escapeHtml(t("ai.downloadCode"));

  marked.use({
    renderer: {
      link(token: Tokens.Link) {
        const parsed = parseFileLinkHref(token.href);
        if (!parsed) return false;
        const label = this.parser.parseInline(token.tokens);
        const startAttr = parsed.startLine ? ` data-line-start="${parsed.startLine}"` : "";
        const endAttr = parsed.endLine ? ` data-line-end="${parsed.endLine}"` : "";
        return `<a href="#ai-file" class="ai-file-link" data-file-path="${escapeHtml(parsed.path)}"${startAttr}${endAttr} title="${escapeHtml(parsed.path)}">${label}</a>`;
      },
      code(token: Tokens.Code) {
        const lang = (token.lang ?? "").trim().split(/\s+/)[0].toLowerCase();
        const known = lang && hljs.getLanguage(lang);
        const body = known
          ? hljs.highlight(token.text, { language: lang, ignoreIllegals: true }).value
          : escapeHtml(token.text);
        const encoded = encodeURIComponent(token.text);
        const safeLang = escapeHtml(lang || "text");
        return [
          `<div class="ai-code-block">`,
          `<div class="ai-code-head">`,
          `<span class="ai-code-lang">${safeLang}</span>`,
          `<div class="ai-code-actions">`,
          `<button type="button" class="ai-code-btn ai-code-download" data-code="${encoded}" data-lang="${safeLang}">${downloadLabel}</button>`,
          `<button type="button" class="ai-code-btn ai-code-copy" data-code="${encoded}">${copyLabel}</button>`,
          `</div>`,
          `</div>`,
          `<pre><code class="hljs${known ? ` language-${escapeHtml(lang)}` : ""}">${body}</code></pre>`,
          `</div>\n`,
        ].join("");
      },
    },
  });

  const raw = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ["data-code", "data-lang", "data-file-path", "data-line-start", "data-line-end"],
  });
}
