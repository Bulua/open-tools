/**
 * 工具列表的多语言：分类名、工具名称、说明、输入框提示、按钮名。
 * 中文写在各模块的 index.ts 里；其他语言从模块 locales.ts 的 tools 里按语言、工具 id 取，没写的仍显示中文。
 */
import { computed } from "vue";
import { allTools, categories, compareNames, type Category, type Tool } from "@/tools";
import { locale, toolTexts, translationIn, type Locale, type Translations } from "./index";

/** 分类名的翻译，按语言、再按分类 id 对应（中文写在 src/tools/index.ts 的 categories 里） */
export const CATEGORY_NAMES: Translations<Record<string, string>> = {
  en: {
    developer: "Developer Tools",
    daily: "Everyday Tools",
    time: "Time",
    calc: "Calculate",
    image: "Image",
    audio: "Audio",
    video: "Video",
    document: "Documents & Files",
    network: "Network",
  },
  ja: {
    developer: "開発ツール",
    daily: "日常ツール",
    time: "時間",
    calc: "計算・換算",
    image: "画像",
    audio: "音声",
    video: "動画",
    document: "文書・ファイル",
    network: "ネットワーク",
  },
};

const zhById = new Map(allTools.map((t) => [t.id, t]));
const zhCategoryById = new Map(categories.map((c) => [c.id, c]));

/** 工具换成指定语言的文字；中文或没有翻译时原样返回 */
export function localizeTool(tool: Tool, l: Locale): Tool {
  const x = translationIn(toolTexts, l, tool.id);
  if (!x) return tool;
  return {
    ...tool,
    name: x.name,
    desc: x.desc,
    inputPlaceholder: x.placeholder ?? tool.inputPlaceholder,
    actions: tool.actions?.map((a, i) => ({ ...a, label: x.actions?.[i] ?? a.label })),
  };
}

/** 指定语言下的工具名排序：中文按拼音首字母与英文混排，其他语言按该语言的字母顺序 */
export const compareNamesIn = (l: Locale) => (l === "zh-CN" ? compareNames : new Intl.Collator(l, { numeric: true, sensitivity: "base" }).compare);

/** 分类和其中的工具换成指定语言，并按该语言重新排序 */
export function localizeCategories(list: Category[], l: Locale): Category[] {
  if (l === "zh-CN") return list;
  const compare = compareNamesIn(l);
  return list.map((c) => ({
    ...c,
    name: translationIn(CATEGORY_NAMES, l, c.id) ?? c.name,
    tools: c.tools.map((t) => localizeTool(t, l)).sort((a, b) => compare(a.name, b.name)),
  }));
}

/** 当前语言下的分类列表，切换语言时自动更新 */
export const localizedCategories = computed(() => localizeCategories(categories, locale.value));

/** 搜索用的文字：同时包含当前语言和中文的名称、说明，切到其他语言后输入中文也能搜到 */
export function searchTextOf(tool: Tool, category?: Category): string {
  const zh = zhById.get(tool.id);
  const zhCategory = category && zhCategoryById.get(category.id);
  return [tool.name, tool.desc, zh?.name, zh?.desc, tool.id, category?.name, zhCategory?.name].join(" ").toLowerCase();
}
