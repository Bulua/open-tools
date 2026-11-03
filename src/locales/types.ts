/** 支持的界面语言 */
export type Locale = "zh-CN" | "en";
/** 用户的语言选择：auto 表示跟随系统 */
export type LocalePref = Locale | "auto";

/**
 * 与中文文案结构相同、值都是字符串的文案类型。
 * 英文文案写成 `const en: Messages<typeof zhCN> = {...}`，少写、多写 key 时 typecheck 会报错。
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
 * - tools：工具列表里的英文（中文直接写在模块的 index.ts 里），按工具 id 对应
 * - messages：工具界面里的文案，放在以模块名为 key 的命名空间下，两种语言结构相同
 */
export interface ModuleLocales {
  tools?: Record<string, ToolText>;
  messages?: { "zh-CN": Record<string, unknown>; en: Record<string, unknown> };
}

/** 定义模块文案时用，带类型检查：英文 messages 的结构必须与中文相同 */
export function defineModuleLocales<T extends Record<string, unknown>>(m: {
  tools?: Record<string, ToolText>;
  messages?: { "zh-CN": T; en: Messages<T> };
}): ModuleLocales {
  return m as ModuleLocales;
}
