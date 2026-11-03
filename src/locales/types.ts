/**
 * 支持的界面语言。新增语言时在这里加上，再按 docs/DEVELOPMENT.md「新增一种语言」补齐文案。
 * 这个文件不依赖其他模块，后台线程（worker）里也可以引用。
 */
export type Locale = "zh-CN" | "en" | "ja";
/** 中文以外的语言：中文直接写在代码和数据里，其他语言写在翻译表里 */
export type OtherLocale = Exclude<Locale, "zh-CN">;
/** 用户的语言选择：auto 表示跟随系统 */
export type LocalePref = Locale | "auto";

/**
 * 按语言放的翻译表，例如 `{ en: "Hello" }`。中文不写在这里（就是数据本身）；
 * 缺的语言先用英文，英文也没有时显示中文，与文案文件的回退规则一致。
 */
export type Translations<T> = { [L in OtherLocale]?: T };

/** 从翻译表里取指定语言的译文（没有时用英文）；中文或者都没有时返回 undefined，调用方回退到中文 */
export const translationOf = <T>(table: Translations<T> | undefined, l: Locale): T | undefined =>
  l === "zh-CN" || !table ? undefined : (table[l as OtherLocale] ?? table.en);

/** 从按 id 对应的翻译表里取一项（这种语言没有这一项时用英文）；中文或者都没有时返回 undefined */
export const translationIn = <T>(table: Translations<Record<string, T>> | undefined, l: Locale, key: string): T | undefined =>
  l === "zh-CN" || !table ? undefined : (table[l as OtherLocale]?.[key] ?? table.en?.[key]);

/**
 * 与中文文案结构相同、值都是字符串的文案类型。
 * 其他语言的文案写成 `const en: Messages<typeof zhCN> = {...}`，少写、多写 key 时 typecheck 会报错。
 */
export type Messages<T> = T extends string
  ? string
  : T extends readonly string[]
    ? string[]
    : { [K in keyof T]: Messages<T[K]> };

/** 工具在工具列表里的文字（名称、说明、输入框提示、按钮名），用于中文以外的语言 */
export interface ToolText {
  name: string;
  desc: string;
  /** 对应工具定义的 inputPlaceholder */
  placeholder?: string;
  /** 对应工具定义的 actions，按顺序一一对应 */
  actions?: string[];
}

/**
 * 每个工具模块的 locales.ts 默认导出的内容。
 * - tools：工具列表里的翻译（中文直接写在模块的 index.ts 里），按语言、再按工具 id 对应
 * - messages：工具界面里的文案，放在以模块名为 key 的命名空间下，各语言结构相同
 */
export interface ModuleLocales {
  tools?: Translations<Record<string, ToolText>>;
  messages?: { "zh-CN": Record<string, unknown> } & Translations<Record<string, unknown>>;
}

/** 定义模块文案时用，带类型检查：其他语言 messages 的结构必须与中文相同 */
export function defineModuleLocales<T extends Record<string, unknown>>(m: {
  tools?: Translations<Record<string, ToolText>>;
  messages?: { "zh-CN": T } & Translations<Messages<T>>;
}): ModuleLocales {
  return m as ModuleLocales;
}
