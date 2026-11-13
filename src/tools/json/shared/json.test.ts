import { describe, expect, it } from "vitest";
import { parseJson, formatJson, minifyJson } from "./json";

describe("parseJson", () => {
  it("解析合法 JSON", () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("出错时给出行号和列号", () => {
    const r = parseJson('{\n  "a": 1,\n  "b" 2\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.line).toBe(3);
      expect(r.column).toBe(7);
    }
  });

  it("缺少结尾括号时指向文本末尾", () => {
    const r = parseJson('{\n  "a": [1, 2]\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.line).toBe(2);
  });
});

describe("格式化与压缩", () => {
  it("按缩进格式化并可排序键名", () => {
    expect(formatJson({ b: 1, a: [1] }, 2, true)).toBe('{\n  "a": [\n    1\n  ],\n  "b": 1\n}');
    expect(formatJson({ a: 1 }, "tab")).toBe('{\n\t"a": 1\n}');
  });

  it("压缩", () => {
    expect(minifyJson({ a: { b: [1, 2] } })).toBe('{"a":{"b":[1,2]}}');
  });
});
