import { describe, expect, it } from "vitest";
import { allTools, categories, categoriesForPlatform, compareNames, initialOf } from "./index";

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

describe("平台可用性", () => {
  it("桌面版保留完整工具列表", () => {
    expect(categoriesForPlatform(categories, "desktop")).toEqual(categories);
  });

  it("网页预览隐藏依赖 Windows 后台监听的剪贴板历史", () => {
    const shown = categoriesForPlatform(categories, "web").flatMap((category) => category.tools.map((tool) => tool.id));
    expect([...shown].sort()).toEqual(allTools.map((tool) => tool.id).filter((id) => id !== "clipboard-history").sort());
  });

  it("Android 保留全部分类，并隐藏尚未适配的工具", () => {
    const androidCategories = categoriesForPlatform(categories, "android");
    const shown = new Set(androidCategories.flatMap((category) => category.tools.map((tool) => tool.id)));

    expect(androidCategories.map((category) => category.id)).toEqual(categories.map((category) => category.id));
    expect(allTools.filter((tool) => !shown.has(tool.id)).map((tool) => tool.id).sort()).toEqual([
      "camera-recorder",
      "clipboard-history",
      "douyin-download",
      "image-inpaint",
      "image-removebg",
      "recorder",
      "screen-recorder",
      "screenshot-history",
      "tts",
      "word-to-pdf",
    ]);
  });
});

// 目录也是工具的边界：入口、页面和翻译都应能够通过工具 ID 定位。
describe("工具目录约定", () => {
  const entries = import.meta.glob<{ default: import("./types").Tool }>("./*/*/index.ts", { eager: true });
  const pages = import.meta.glob("./*/*/*.vue");
  const locales = import.meta.glob("./*/*/locales.ts");

  it("每个注册工具恰好有一个同名目录，并且包含页面和翻译", () => {
    expect(Object.values(entries).map((entry) => entry.default.id).sort()).toEqual(allTools.map((tool) => tool.id).sort());
    for (const [path, entry] of Object.entries(entries)) {
      const directory = path.slice(0, -"index.ts".length);
      expect(directory.split("/").slice(-2)[0], path).toBe(entry.default.id);
      expect(Object.keys(pages).some((page) => page.startsWith(directory)), path).toBe(true);
      expect(locales, path).toHaveProperty(`${directory}locales.ts`);
    }
  });
});
