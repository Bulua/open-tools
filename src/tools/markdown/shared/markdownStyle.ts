/**
 * Markdown 预览的排版样式。程序内预览和「导出 HTML」共用这一份，导出的网页与预览看起来一致。
 * 颜色使用程序的主题变量，导出时在 :root 中补上浅色主题的取值。
 */
export const MARKDOWN_CSS = `
.md-body { color: var(--text); font-size: 15px; line-height: 1.75; word-wrap: break-word; }
.md-body > :first-child { margin-top: 0 !important; }
.md-body > :last-child { margin-bottom: 0 !important; }
.md-body h1, .md-body h2, .md-body h3, .md-body h4, .md-body h5, .md-body h6 { margin: 1.6em 0 0.6em; font-weight: 600; line-height: 1.35; scroll-margin-top: 12px; }
.md-body h1 { font-family: var(--font-serif); font-size: 1.9em; font-weight: 500; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
.md-body h2 { font-family: var(--font-serif); font-size: 1.5em; font-weight: 500; padding-bottom: 0.25em; border-bottom: 1px solid var(--border); }
.md-body h3 { font-size: 1.22em; }
.md-body h4 { font-size: 1.05em; }
.md-body h5, .md-body h6 { font-size: 0.95em; color: var(--text-2); }
.md-body p, .md-body ul, .md-body ol, .md-body blockquote, .md-body table, .md-body pre { margin: 0 0 1em; }
.md-body a { color: var(--accent); text-decoration: none; }
.md-body a:hover { text-decoration: underline; }
.md-body strong { font-weight: 600; }
.md-body ul, .md-body ol { padding-left: 1.8em; }
.md-body li + li, .md-body li > ul, .md-body li > ol { margin-top: 0.25em; }
.md-body li > ul, .md-body li > ol { margin-bottom: 0; }
.md-body li:has(> input[type="checkbox"]) { list-style: none; margin-left: -1.4em; }
.md-body input[type="checkbox"] { margin: 0 0.45em 0 0; vertical-align: -1px; accent-color: var(--accent); }
.md-body blockquote { padding: 0.2em 1em; color: var(--text-2); border-left: 3px solid var(--border-strong); }
.md-body hr { height: 1px; margin: 1.8em 0; border: none; background: var(--border); }
.md-body img { max-width: 100%; border-radius: 4px; }
.md-body table { display: block; width: max-content; max-width: 100%; overflow: auto; border-collapse: collapse; font-size: 0.93em; }
.md-body th, .md-body td { padding: 6px 13px; border: 1px solid var(--border-strong); }
.md-body th { font-weight: 600; background: var(--bg-sunken); }
.md-body tr:nth-child(2n) td { background: var(--hover); }
.md-body code { padding: 0.15em 0.4em; border-radius: 4px; background: var(--active); font-family: var(--font-mono); font-size: 0.87em; }
.md-body pre { position: relative; padding: 14px 16px; overflow: auto; border-radius: 8px; background: var(--bg-sunken); border: 1px solid var(--border); line-height: 1.6; }
.md-body pre code { padding: 0; background: none; font-size: 13px; white-space: pre; }
.md-body .code-lang { position: absolute; top: 6px; right: 10px; font-size: 11px; color: var(--text-3); font-family: var(--font-mono); }
.md-body .hljs-comment, .md-body .hljs-quote { color: var(--text-3); font-style: italic; }
.md-body .hljs-keyword, .md-body .hljs-selector-tag, .md-body .hljs-built_in, .md-body .hljs-meta .hljs-keyword { color: var(--syntax-literal); }
.md-body .hljs-string, .md-body .hljs-regexp, .md-body .hljs-addition, .md-body .hljs-meta .hljs-string { color: var(--syntax-string); }
.md-body .hljs-number, .md-body .hljs-literal, .md-body .hljs-symbol, .md-body .hljs-bullet { color: var(--syntax-number); }
.md-body .hljs-title, .md-body .hljs-section, .md-body .hljs-attr, .md-body .hljs-attribute, .md-body .hljs-property, .md-body .hljs-name { color: var(--syntax-key); }
.md-body .hljs-type, .md-body .hljs-class .hljs-title, .md-body .hljs-variable, .md-body .hljs-template-variable { color: var(--syntax-number); }
.md-body .hljs-deletion { color: var(--danger); }
.md-body .hljs-meta { color: var(--text-3); }
.md-body .hljs-emphasis { font-style: italic; }
.md-body .hljs-strong { font-weight: 600; }
`;

/** 导出 HTML 时补充的浅色主题变量（程序内由主题提供） */
const EXPORT_VARS = `
:root { --text: #141413; --text-2: #5e5d59; --text-3: #8f8d86; --bg-sunken: #f5f4ee; --hover: rgba(31,30,29,.04); --active: rgba(31,30,29,.07);
  --border: rgba(31,30,29,.12); --border-strong: rgba(31,30,29,.2); --accent: #c96442; --danger: #b5412f;
  --syntax-key: #3b5a7a; --syntax-string: #4c7a4f; --syntax-number: #b55a3b; --syntax-literal: #6a5a9c;
  --font-serif: Georgia, "Times New Roman", "Microsoft YaHei", serif; --font-mono: "Cascadia Mono", Consolas, monospace; }
body { margin: 0; background: #faf9f5; font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; }
.md-body { max-width: 860px; margin: 0 auto; padding: 48px 32px 80px; }
`;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 生成可以单独打开的 HTML 文件 */
export function standaloneHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${EXPORT_VARS}${MARKDOWN_CSS}</style>
</head>
<body>
<article class="md-body">
${bodyHtml}
</article>
</body>
</html>
`;
}
