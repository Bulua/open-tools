import DOMPurify from "dompurify";
import { computed } from "vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { renderMarkdown } from "./render";
import { DEFAULT_DOCX_OPTIONS, type DocxOptions } from "./toDocx";

/** 渲染并清理 HTML：Markdown 里可以写任意 HTML，去掉脚本、事件属性等，防止被执行 */
export function renderSafe(source: string) {
  const { html, headings } = renderMarkdown(source);
  return { html: DOMPurify.sanitize(html), headings };
}

/** 统计字数：中文按字、英文按单词 */
export function countWords(text: string): number {
  const plain = text.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`~[\]()|!-]/g, " ");
  const cjk = plain.match(/[㐀-鿿豈-﫿]/g)?.length ?? 0;
  const words = plain.replace(/[㐀-鿿豈-﫿]/g, " ").match(/[A-Za-z0-9]+(?:['.][A-Za-z0-9]+)*/g)?.length ?? 0;
  return cjk + words;
}

export const FONTS = ["宋体", "微软雅黑", "等线", "仿宋", "楷体"];
/** 字体在英文界面显示的名称（值仍用中文名，Word 认得） */
export const FONT_NAMES_EN: Record<string, string> = { 宋体: "SimSun", 微软雅黑: "Microsoft YaHei", 等线: "DengXian", 仿宋: "FangSong", 楷体: "KaiTi" };

/** Word 导出格式，「Markdown 编辑预览」和「Markdown 转 Word」共用 */
export function useDocxOptions() {
  const font = useStoredRef("md2word.font", DEFAULT_DOCX_OPTIONS.font);
  const fontSize = useStoredRef("md2word.fontSize", DEFAULT_DOCX_OPTIONS.fontSize);
  const lineSpacing = useStoredRef("md2word.lineSpacing", DEFAULT_DOCX_OPTIONS.lineSpacing);
  const options = computed<DocxOptions>(() => ({ font: font.value, fontSize: fontSize.value, lineSpacing: lineSpacing.value }));
  return { font, fontSize, lineSpacing, options };
}
