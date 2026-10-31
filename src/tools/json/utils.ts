/** JSON 工具用到的纯函数，不依赖界面，便于测试 */
import { dump, load } from "js-yaml";

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
  return result.line ? `第 ${result.line} 行第 ${result.column} 列：${result.message}` : result.message;
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

// ---------- 转义 ----------

/** 把文本转成 JSON 字符串字面量（去掉两侧引号），例如换行变成 \n */
export function escapeJson(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

/** escapeJson 的逆操作，两侧有没有引号都可以 */
export function unescapeJson(text: string): string {
  const s = text.trim();
  const quoted = s.length >= 2 && s.startsWith('"') && s.endsWith('"');
  return JSON.parse(quoted ? s : `"${s}"`);
}

// ---------- YAML ----------

export function jsonToYaml(text: string): string {
  return dump(JSON.parse(text), { indent: 2, lineWidth: -1, noRefs: true });
}

export function yamlToJson(text: string): string {
  return JSON.stringify(load(text), null, 2);
}

// ---------- 生成 TypeScript 类型 ----------

const pascal = (s: string) => {
  const words = s.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  return /^[A-Za-z_]/.test(name) ? name : `T${name}`;
};

const safeKey = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));

/** 根据 JSON 示例生成 TypeScript interface */
export function jsonToTypeScript(value: JsonValue, rootName = "Root"): string {
  const interfaces: string[] = [];
  const used = new Set<string>();

  const uniqueName = (base: string) => {
    let name = pascal(base) || "Item";
    for (let i = 2; used.has(name); i++) name = `${pascal(base)}${i}`;
    used.add(name);
    return name;
  };

  /** 把多个对象合并成一个 interface，缺失的字段标记为可选 */
  const objectType = (objects: Record<string, JsonValue>[], name: string): string => {
    const typeName = uniqueName(name);
    const keys = [...new Set(objects.flatMap((o) => Object.keys(o)))];
    const lines = keys.map((k) => {
      const present = objects.filter((o) => k in o);
      const optional = present.length < objects.length ? "?" : "";
      return `  ${safeKey(k)}${optional}: ${typeOf(present.map((o) => o[k]), k)};`;
    });
    interfaces.push(`export interface ${typeName} {\n${lines.join("\n")}\n}`);
    return typeName;
  };

  /** 推断一组同位置取值的类型（数组元素、同名字段） */
  const typeOf = (values: JsonValue[], name: string): string => {
    const types = new Set<string>();
    const objects: Record<string, JsonValue>[] = [];
    const arrays: JsonValue[][] = [];

    for (const v of values) {
      if (v === null) types.add("null");
      else if (Array.isArray(v)) arrays.push(v);
      else if (typeof v === "object") objects.push(v);
      else types.add(typeof v);
    }
    if (objects.length) types.add(objectType(objects, name));
    if (arrays.length) {
      const items = arrays.flat();
      const item = items.length ? typeOf(items, singular(name)) : "unknown";
      types.add(item.includes("|") ? `(${item})[]` : `${item}[]`);
    }
    return [...types].join(" | ") || "unknown";
  };

  const root = typeOf([value], rootName);
  if (!interfaces.length || root !== pascal(rootName)) {
    interfaces.push(`export type ${uniqueName(rootName)} = ${root};`);
  }
  // 子类型先生成，根类型最后生成；反转后根类型在最上面
  return interfaces.reverse().join("\n\n");
}

const singular = (name: string) => (name.endsWith("s") && name.length > 1 ? name.slice(0, -1) : `${name}Item`);

// ---------- 对比 ----------

export type DiffKind = "added" | "removed" | "changed";

export interface DiffItem {
  path: string;
  kind: DiffKind;
  before?: JsonValue;
  after?: JsonValue;
}

const childPath = (path: string, key: string | number) =>
  typeof key === "number" ? `${path}[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;

const isObject = (v: JsonValue): v is Record<string, JsonValue> => !!v && typeof v === "object" && !Array.isArray(v);

/** 结构化对比两个 JSON，返回所有差异（数组按下标对比） */
export function diffJson(a: JsonValue, b: JsonValue, path = "$"): DiffItem[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    const items: DiffItem[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const p = childPath(path, i);
      if (i >= a.length) items.push({ path: p, kind: "added", after: b[i] });
      else if (i >= b.length) items.push({ path: p, kind: "removed", before: a[i] });
      else items.push(...diffJson(a[i], b[i], p));
    }
    return items;
  }
  if (isObject(a) && isObject(b)) {
    const items: DiffItem[] = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const p = childPath(path, k);
      if (!(k in a)) items.push({ path: p, kind: "added", after: b[k] });
      else if (!(k in b)) items.push({ path: p, kind: "removed", before: a[k] });
      else items.push(...diffJson(a[k], b[k], p));
    }
    return items;
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ path, kind: "changed", before: a, after: b }];
}

/** 取值的简短预览，用于列表显示 */
export function preview(value: JsonValue | undefined, max = 60): string {
  const s = JSON.stringify(value);
  if (s === undefined) return "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
