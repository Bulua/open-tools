import type { Translations } from "@/locales/types";
/** 正则表达式匹配与替换，纯函数（在后台线程中执行，见 regex.worker.ts） */

export interface RegexMatch {
  index: number;
  end: number;
  text: string;
  /** 编号分组：第 1、2… 组，未参与匹配的为 undefined */
  groups: (string | undefined)[];
  /** 命名分组 (?<name>…) */
  named: Record<string, string | undefined>;
}

export interface RegexResult {
  ok: boolean;
  error?: string;
  matches: RegexMatch[];
  /** 匹配数超过上限时为 true */
  truncated: boolean;
  /** 替换后的文本（提供了替换内容时） */
  replaced?: string;
}

/** 最多返回的匹配数，避免结果太多时界面卡顿 */
export const MAX_MATCHES = 1000;

export function runRegex(pattern: string, flags: string, text: string, replacement?: string): RegexResult {
  if (!pattern) return { ok: true, matches: [], truncated: false };
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), matches: [], truncated: false };
  }

  const matches: RegexMatch[] = [];
  const toMatch = (m: RegExpExecArray): RegexMatch => ({
    index: m.index,
    end: m.index + m[0].length,
    text: m[0],
    groups: m.slice(1),
    named: m.groups ? { ...m.groups } : {},
  });

  let truncated = false;
  if (re.global || re.sticky) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (matches.length >= MAX_MATCHES) {
        truncated = true;
        break;
      }
      matches.push(toMatch(m));
      // 空匹配时手动前进，避免死循环
      if (m[0] === "") re.lastIndex += 1;
      if (!re.global) break;
    }
  } else {
    const m = re.exec(text);
    if (m) matches.push(toMatch(m));
  }

  return {
    ok: true,
    matches,
    truncated,
    replaced: replacement === undefined ? undefined : text.replace(new RegExp(pattern, flags), replacement),
  };
}

/** 常用正则，i18n 是其他语言的名称（这个文件也在后台线程里用，不引入文案） */
export const PRESETS: { label: string; i18n: Translations<string>; pattern: string; flags?: string }[] = [
  { label: "手机号", i18n: { en: "Phone (CN)" }, pattern: "1[3-9]\\d{9}" },
  { label: "邮箱", i18n: { en: "Email" }, pattern: "[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+" },
  { label: "网址", i18n: { en: "URL" }, pattern: "https?://[^\\s\"'<>]+" },
  { label: "IPv4", i18n: { en: "IPv4" }, pattern: "\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b" },
  { label: "身份证号", i18n: { en: "ID card (CN)" }, pattern: "\\b\\d{17}[\\dXx]\\b" },
  { label: "日期", i18n: { en: "Date" }, pattern: "(?<year>\\d{4})[-/.](?<month>\\d{1,2})[-/.](?<day>\\d{1,2})" },
  { label: "中文", i18n: { en: "Chinese" }, pattern: "[\\u4e00-\\u9fa5]+" },
  { label: "数字", i18n: { en: "Number" }, pattern: "-?\\d+(\\.\\d+)?" },
  { label: "空行", i18n: { en: "Blank line" }, pattern: "^\\s*$", flags: "gm" },
];
