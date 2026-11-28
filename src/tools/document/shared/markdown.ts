import { locale, translationIn, type Translations } from "@/locales/index";
import { computed } from "vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { DEFAULT_DOCX_OPTIONS, type DocxOptions } from "./toDocx";

export const FONTS = ["宋体", "微软雅黑", "等线", "仿宋", "楷体"];
/** 字体在其他语言下显示的名称（值仍用中文名，Word 认得） */
export const FONT_NAMES: Translations<Record<string, string>> = {
  en: { 宋体: "SimSun", 微软雅黑: "Microsoft YaHei", 等线: "DengXian", 仿宋: "FangSong", 楷体: "KaiTi", 黑体: "SimHei" },
};
/** 字体在当前界面语言下显示的名称 */
export const fontLabel = (font: string) => translationIn(FONT_NAMES, locale.value, font) ?? font;

/** Markdown 转 Word 的导出格式设置 */
export function useDocxOptions() {
  const font = useStoredRef("md2word.font", DEFAULT_DOCX_OPTIONS.font);
  const fontSize = useStoredRef("md2word.fontSize", DEFAULT_DOCX_OPTIONS.fontSize);
  const lineSpacing = useStoredRef("md2word.lineSpacing", DEFAULT_DOCX_OPTIONS.lineSpacing);
  const options = computed<DocxOptions>(() => ({ font: font.value, fontSize: fontSize.value, lineSpacing: lineSpacing.value }));
  return { font, fontSize, lineSpacing, options };
}
