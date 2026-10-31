import { describe, expect, it } from "vitest";
import {
  diffJson,
  escapeJson,
  formatJson,
  jsonToTypeScript,
  jsonToYaml,
  minifyJson,
  parseJson,
  unescapeJson,
  yamlToJson,
} from "./utils";

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

describe("转义", () => {
  it("转义与去转义互为逆操作", () => {
    const raw = '{"name":"Open Tools"}\n';
    expect(escapeJson(raw)).toBe('{\\"name\\":\\"Open Tools\\"}\\n');
    expect(unescapeJson(escapeJson(raw))).toBe(raw);
  });

  it("去转义时两侧有引号也可以", () => {
    expect(unescapeJson('"a\\tb"')).toBe("a\tb");
  });
});

describe("YAML", () => {
  it("JSON 与 YAML 互转", () => {
    const yaml = jsonToYaml('{"name":"x","tags":["a","b"]}');
    expect(yaml).toBe("name: x\ntags:\n  - a\n  - b\n");
    expect(JSON.parse(yamlToJson(yaml))).toEqual({ name: "x", tags: ["a", "b"] });
  });
});

describe("jsonToTypeScript", () => {
  it("生成嵌套 interface，缺失字段为可选", () => {
    const ts = jsonToTypeScript({
      id: 1,
      name: "a",
      tags: ["x"],
      users: [{ id: 1, email: "a@b.c" }, { id: 2 }],
      extra: null,
    });
    expect(ts).toBe(
      [
        "export interface Root {",
        "  id: number;",
        "  name: string;",
        "  tags: string[];",
        "  users: User[];",
        "  extra: null;",
        "}",
        "",
        "export interface User {",
        "  id: number;",
        "  email?: string;",
        "}",
      ].join("\n"),
    );
  });

  it("根节点是数组时生成类型别名", () => {
    expect(jsonToTypeScript([{ a: 1 }])).toBe("export type Root = RootItem[];\n\nexport interface RootItem {\n  a: number;\n}");
  });
});

describe("diffJson", () => {
  it("列出新增、删除和修改", () => {
    const a = { name: "a", age: 1, tags: ["x"], gone: true };
    const b = { name: "b", age: 1, tags: ["x", "y"], added: { k: 1 } };
    expect(diffJson(a, b)).toEqual([
      { path: "$.name", kind: "changed", before: "a", after: "b" },
      { path: "$.tags[1]", kind: "added", after: "y" },
      { path: "$.gone", kind: "removed", before: true },
      { path: "$.added", kind: "added", after: { k: 1 } },
    ]);
  });

  it("内容相同时没有差异", () => {
    expect(diffJson({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([]);
  });
});
