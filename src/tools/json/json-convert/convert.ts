import { dump, load } from "js-yaml";
import type { JsonValue } from "../shared/json";

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
