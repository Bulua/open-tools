/**
 * 按界面语言挑选更新说明。
 *
 * 发版时可以在说明里按语言分段，每段前面单独一行写 `<!-- 语言代码 -->`，开头没有标记的部分是中文：
 *
 * ```
 * - 新增日语界面
 * <!-- en -->
 * - Added Japanese UI
 * <!-- ja -->
 * - 日本語の UI を追加
 * ```
 *
 * 当前语言没有对应的段落时，先用英文段落，再用中文。HTML 注释在 GitHub 的 Release 页面上不显示。
 */
import type { Locale } from "@/locales/types";

const MARKER = /^\s*<!--\s*([A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?)\s*-->\s*$/;

/** 把说明拆成各语言的段落，开头没有标记的部分算中文 */
export function splitNotes(text: string): Record<string, string> {
  const sections: Record<string, string[]> = { "zh-CN": [] };
  let current = "zh-CN";
  for (const line of text.split(/\r?\n/)) {
    const m = MARKER.exec(line);
    if (m) {
      current = m[1];
      sections[current] ??= [];
    } else {
      sections[current].push(line);
    }
  }
  return Object.fromEntries(Object.entries(sections).map(([l, lines]) => [l, lines.join("\n").trim()]).filter(([, s]) => s));
}

/** 当前语言的说明：没有时先用英文，再用中文 */
export function pickNotes(text: string, locale: Locale): string {
  const sections = splitNotes(text);
  return sections[locale] ?? sections.en ?? sections["zh-CN"] ?? "";
}
