import { describe, expect, it } from "vitest";
import { jsonToYaml, yamlToJson, jsonToTypeScript } from "./convert";

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
