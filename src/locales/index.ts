/**
 * 国际化：基于 vue-i18n（Composition API 模式）。
 *
 * - 公共文案在本目录的 zh-CN.ts / en.ts
 * - 每个工具模块的文案在 src/tools/<模块>/locales.ts，这里自动收集合并
 * - 语言默认跟随系统，可在顶栏切换，选择记在 localStorage 的 locale 里
 * - 找不到英文文案时显示中文，所以还没迁移的界面照常显示中文
 *
 * 组件里用 `const { t } = useI18n()`；普通 .ts 文件里用这里导出的 `t`。
 */
import { computed, watchEffect, type Ref } from "vue";
import { createI18n } from "vue-i18n";
import { useStoredRef } from "@/composables/useStoredRef";
import zhCN from "./zh-CN";
import en from "./en";
import type { Locale, LocalePref, ModuleLocales, ToolText } from "./types";

export * from "./types";

/** 语言切换菜单里的选项，名称固定用各自的语言显示 */
export const LOCALES: { value: Locale; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
];

const modules = import.meta.glob<{ default: ModuleLocales }>("../tools/*/locales.ts", { eager: true });

// 文案结构各模块不同，结构检查放在 en.ts 和 defineModuleLocales 里
const messages: Record<Locale, Record<string, any>> = { "zh-CN": { ...zhCN }, en: { ...en } };
/** 所有工具在工具列表里的英文，按工具 id 对应 */
export const toolTexts: Record<string, ToolText> = {};
for (const { default: m } of Object.values(modules)) {
  Object.assign(toolTexts, m.tools);
  if (m.messages) {
    Object.assign(messages["zh-CN"], m.messages["zh-CN"]);
    Object.assign(messages.en, m.messages.en);
  }
}

export const i18n = createI18n({
  legacy: false,
  // 启动时先用中文（测试也在中文下运行），initLocale() 再换成用户选择的语言
  locale: "zh-CN",
  fallbackLocale: "zh-CN",
  messages,
  missingWarn: false,
  fallbackWarn: false,
});

// 全局实例只用到这两样；写成简单类型，避免 vue-i18n 的类型推导过深
const global = i18n.global as unknown as {
  locale: Ref<Locale>;
  t: (key: string, named?: Record<string, unknown>) => string;
};
/** 当前界面语言 */
export const locale = computed(() => global.locale.value);
/** 在普通 .ts 文件里取文案 */
export const t = global.t;

const systemLocale = (): Locale => (navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en");

let pref: Ref<LocalePref> | undefined;
/** 用户的语言选择（auto 表示跟随系统）和当前实际使用的语言 */
export function useLocale() {
  pref ??= useStoredRef<LocalePref>("locale", "auto");
  return { pref, locale };
}

/** 启动时调用：按用户选择设置语言，之后选择变化时自动切换 */
export function initLocale() {
  const { pref } = useLocale();
  watchEffect(() => {
    const l = pref.value === "zh-CN" || pref.value === "en" ? pref.value : systemLocale();
    global.locale.value = l;
    document.documentElement.lang = l;
  });
}
