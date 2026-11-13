/** JSON 工具用到的纯函数，不依赖界面，便于测试 */
import { t } from "@/locales";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// ---------- 解析与格式化 ----------

export type ParseResult =
  | { ok: true; value: JsonValue }
  | { ok: false; message: string; position?: number; line?: number; column?: number };

/** 解析 JSON，失败时尽量给出出错的行号和列号 */
export function parseJson(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const match = /position (\d+)/.exec(message);
    const end = text.trimEnd().length;
    // 「意外结束」类错误没有位置信息；位置落在末尾空白里时，都指向最后一个有内容的字符
    const raw = match ? Number(match[1]) : /end of JSON/i.test(message) ? end : undefined;
    if (raw === undefined) return { ok: false, message };
    const position = Math.min(raw, end);
    const before = text.slice(0, position).split("\n");
    return {
      ok: false,
      // 行列号已单独给出，去掉原始信息里的位置描述
      message: message.replace(/\s*(in JSON )?at position \d+.*$/, ""),
      position,
      line: before.length,
      column: before[before.length - 1].length + 1,
    };
  }
}

/** 解析失败时的完整提示，例如「第 3 行第 7 列：Expected ':' after property name」 */
export function describeError(result: ParseResult): string {
  if (result.ok) return "";
  return result.line ? t("json.errorAt", { line: result.line, column: result.column, message: result.message }) : result.message;
}

/** 转成代码编辑器需要的错误标记 */
export function editorErrorOf(result: ParseResult | null) {
  if (!result || result.ok || result.position === undefined) return null;
  return { position: result.position, message: describeError(result) };
}

/** 递归按键名排序 */
export function sortKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys(value[k])]),
    );
  }
  return value;
}

export type Indent = 2 | 4 | "tab";

export function formatJson(value: JsonValue, indent: Indent = 2, sort = false): string {
  return JSON.stringify(sort ? sortKeys(value) : value, null, indent === "tab" ? "\t" : indent);
}

export function minifyJson(value: JsonValue, sort = false): string {
  return JSON.stringify(sort ? sortKeys(value) : value);
}
