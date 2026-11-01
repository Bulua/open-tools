import { describe, expect, it } from "vitest";
import { allTools, categories, compareNames, initialOf } from "./index";

describe("工具排序", () => {
  it("中文取拼音首字母", () => {
    expect(initialOf("倒计时")).toBe("D");
    expect(initialOf("图片压缩")).toBe("T");
    expect(initialOf("Cron 表达式")).toBe("C");
    expect(initialOf("正则表达式测试")).toBe("Z");
  });

  it("中英文按首字母混排", () => {
    const names = ["计算器", "倒计时", "正则表达式测试", "Cron 表达式", "文件压缩", "文件解压", "Base64 编解码"];
    expect([...names].sort(compareNames)).toEqual(["Base64 编解码", "Cron 表达式", "倒计时", "计算器", "文件解压", "文件压缩", "正则表达式测试"]);
  });

  it("每个分类都已排序", () => {
    for (const c of categories) {
      const names = c.tools.map((t) => t.name);
      expect(names).toEqual([...names].sort(compareNames));
    }
  });
});

describe("分类", () => {
  it("每个工具恰好出现在一个分类中", () => {
    const shown = categories.flatMap((c) => c.tools.map((t) => t.id));
    expect(new Set(shown).size).toBe(shown.length);
    expect([...shown].sort()).toEqual(allTools.map((t) => t.id).sort());
  });
});
