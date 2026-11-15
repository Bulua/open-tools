import { describe, expect, it } from "vitest";
import { MAX_MATCHES, PRESETS, runRegex } from "./regex";

describe("runRegex", () => {
  it("全局匹配返回所有结果和位置", () => {
    const r = runRegex("\\d+", "g", "a1 b22 c333");
    expect(r.matches.map((m) => [m.text, m.index, m.end])).toEqual([
      ["1", 1, 2],
      ["22", 4, 6],
      ["333", 8, 11],
    ]);
  });

  it("不加 g 只返回第一个", () => {
    expect(runRegex("\\d+", "", "a1 b22").matches).toHaveLength(1);
  });

  it("编号分组与命名分组", () => {
    const r = runRegex("(?<user>\\w+)@(\\w+)", "g", "tom@site");
    expect(r.matches[0].groups).toEqual(["tom", "site"]);
    expect(r.matches[0].named).toEqual({ user: "tom" });
  });

  it("替换支持 $1 引用", () => {
    expect(runRegex("(\\w+)@(\\w+)", "g", "tom@site", "$2/$1").replaced).toBe("site/tom");
  });

  it("空匹配不会死循环", () => {
    expect(runRegex("^", "gm", "a\nb\nc").matches).toHaveLength(3);
  });

  it("语法错误给出提示", () => {
    const r = runRegex("(abc", "g", "abc");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("结果过多时截断", () => {
    const r = runRegex(".", "g", "x".repeat(MAX_MATCHES + 10));
    expect(r.matches).toHaveLength(MAX_MATCHES);
    expect(r.truncated).toBe(true);
  });

  it("常用正则都能编译，并能匹配示例", () => {
    for (const p of PRESETS) expect(() => new RegExp(p.pattern, p.flags ?? "g")).not.toThrow();
    const find = (label: string, text: string) =>
      runRegex(PRESETS.find((p) => p.label === label)!.pattern, "g", text).matches.map((m) => m.text);
    expect(find("手机号", "电话 13812345678，座机 010-1234")).toEqual(["13812345678"]);
    expect(find("邮箱", "联系 a.b+c@mail.example.com 即可")).toEqual(["a.b+c@mail.example.com"]);
    expect(find("IPv4", "192.168.1.1 和 999.1.1.1")).toEqual(["192.168.1.1"]);
  });
});
