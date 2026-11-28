import type { JsonValue } from "../shared/json";

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
