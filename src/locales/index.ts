/**
 * 国际化：基于 vue-i18n（Composition API 模式）。
 *
 * - 公共文案在本目录，每种语言一个文件（zh-CN.ts、en.ts）
 * - 每个工具模块的文案在 src/tools/<模块>/<工具>/locales.ts，这里自动收集合并
 * - 语言默认跟随系统，可在顶栏切换，选择记在 localStorage 的 locale 里
 * - 缺的文案：英文回退到中文；以后加的其他语言先回退到英文，再回退到中文
 *
 * 组件里用 `const { t } = useI18n()`；普通 .ts 文件里用这里导出的 `t`。
 * 新增一种语言的步骤见 docs/DEVELOPMENT.md「新增一种语言」。
 */
import { computed, watchEffect, type Ref } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import { createI18n } from "vue-i18n";
import { mergeMessages } from "./mergeMessages";
import { useStoredRef } from "@/composables/useStoredRef";
import zhCN from "./zh-CN";
import en from "./en";
import ja from "./ja";
import type { Locale, LocalePref, ModuleLocales, OtherLocale, ToolText, Translations } from "./types";

export * from "./types";

/** 语言切换菜单里的选项，名称固定用各自的语言显示 */
export const LOCALES: { value: Locale; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

/** 各语言的公共文案 */
const COMMON: Record<Locale, Record<string, unknown>> = { "zh-CN": zhCN, en, ja };

const modules = import.meta.glob<{ default: ModuleLocales }>("../tools/*/*/locales.ts", { eager: true });

// 文案结构各模块不同，结构检查放在各语言的公共文案文件和 defineModuleLocales 里
const messages = Object.fromEntries(LOCALES.map(({ value }) => [value, { ...COMMON[value] }])) as Record<Locale, Record<string, any>>;
/** 所有工具在工具列表里的翻译，按语言、再按工具 id 对应 */
export const toolTexts: Translations<Record<string, ToolText>> = {};
for (const { default: m } of Object.values(modules)) {
  for (const [l, texts] of Object.entries(m.tools ?? {})) Object.assign((toolTexts[l as OtherLocale] ??= {}), texts);
  for (const [l, msgs] of Object.entries(m.messages ?? {})) mergeMessages(messages[l as Locale], msgs);
}

export const i18n = createI18n({
  legacy: false,
  // 启动时先用中文（测试也在中文下运行），initLocale() 再换成用户选择的语言
  locale: "zh-CN",
  fallbackLocale: { en: ["zh-CN"], default: ["en", "zh-CN"] },
  messages,
  missingWarn: false,
  fallbackWarn: false,
  // 文案只通过 {{ }} 和属性绑定显示（会自动转义），不用 v-html，所以「<Token>」这类尖括号不需要提醒
  warnHtmlMessage: false,
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

/** 系统语言对应的界面语言：先完整匹配（如 zh-CN），再按语种匹配（如 zh-TW → zh-CN），都没有时用英文 */
export function matchLocale(lang: string): Locale {
  const lower = lang.toLowerCase();
  const base = lower.split("-")[0];
  return (
    LOCALES.find((l) => l.value.toLowerCase() === lower)?.value ??
    LOCALES.find((l) => l.value.toLowerCase().split("-")[0] === base)?.value ??
    "en"
  );
}

let pref: Ref<LocalePref> | undefined;
/** 用户的语言选择（auto 表示跟随系统）和当前实际使用的语言 */
export function useLocale() {
  pref ??= useStoredRef<LocalePref>("locale", "auto");
  return { pref, locale };
}

/** 托盘菜单的文字由 Rust 显示，切换语言时把当前语言的文字传过去 */
async function syncTray() {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_tray_text", {
    show: t("tray.show"),
    quit: t("tray.quit"),
    tooltip: t("tray.tooltip"),
    clipboard: t("tray.clipboard"),
    clipboardToggle: t("tray.clipboardToggle"),
  }).catch(() => {});
}

/** 启动时调用：按用户选择设置语言，之后选择变化时自动切换 */
export function initLocale(syncTrayMenu = true) {
  const { pref } = useLocale();
  watchEffect(() => {
    const chosen = LOCALES.find((l) => l.value === pref.value)?.value;
    const l = chosen ?? matchLocale(navigator.language);
    global.locale.value = l;
    document.documentElement.lang = l;
    if (syncTrayMenu) syncTray();
  });
}
