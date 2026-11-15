import { Marked, type Tokens } from "marked";
import hljs from "highlight.js/lib/common";

/**
 * Markdown → HTML（GitHub 风格：表格、任务列表、删除线、自动链接）。
 * 代码块用 highlight.js 着色；标题带 id，方便生成目录和锚点跳转。
 * 返回的 HTML 未经过滤，显示前需要用 DOMPurify 清理（Markdown 里可以直接写 HTML）。
 */

export interface Heading {
  level: number;
  text: string;
  id: string;
}

/** 标题文字 → 锚点 id（保留中文，去掉标点，空格变短横线） */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderMarkdown(source: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Map<string, number>();

  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      heading(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Heading) {
        const inner = this.parser.parseInline(token.tokens);
        const base = slugify(token.text) || "section";
        // 重名标题加序号，保证 id 唯一
        const n = used.get(base) ?? 0;
        used.set(base, n + 1);
        const id = n ? `${base}-${n}` : base;
        headings.push({ level: token.depth, text: inner.replace(/<[^>]+>/g, ""), id });
        return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`;
      },
      code(token: Tokens.Code) {
        const lang = (token.lang ?? "").trim().split(/\s+/)[0].toLowerCase();
        const known = lang && hljs.getLanguage(lang);
        const body = known ? hljs.highlight(token.text, { language: lang, ignoreIllegals: true }).value : escapeHtml(token.text);
        const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : "";
        return `<pre>${label}<code class="hljs${known ? ` language-${lang}` : ""}">${body}</code></pre>\n`;
      },
    },
  });

  const html = marked.parse(source, { async: false }) as string;
  return { html, headings };
}
