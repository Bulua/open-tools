import { afterEach, describe, expect, it, vi } from "vitest";
import { allTools, categories, type Tool } from "@/tools";
import { relativeTime } from "@/utils/time";
import { i18n, t, toolTexts } from "./index";
import { CATEGORY_NAMES_EN, compareNamesIn, localizeCategories, localizeTool, searchTextOf } from "./tools";

const setLocale = (l: "zh-CN" | "en") => ((i18n.global.locale as unknown as { value: string }).value = l);
afterEach(() => setLocale("zh-CN"));

describe("工具列表的英文", () => {
  it("每个工具都有英文名称和说明", () => {
    const missing = allTools.filter((tool) => !toolTexts[tool.id]?.name || !toolTexts[tool.id]?.desc).map((tool) => tool.id);
    expect(missing).toEqual([]);
  });

  it("没有写给不存在的工具", () => {
    const ids = new Set(allTools.map((tool) => tool.id));
    expect(Object.keys(toolTexts).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("按钮和输入框提示与工具定义一一对应", () => {
    for (const tool of allTools) {
      const x = toolTexts[tool.id];
      expect(x.actions?.length ?? 0, tool.id).toBe(tool.actions?.length ?? 0);
      expect(Boolean(x.placeholder), tool.id).toBe(Boolean(tool.inputPlaceholder));
    }
  });

  it("每个分类都有英文名", () => {
    expect(categories.filter((c) => !CATEGORY_NAMES_EN[c.id]).map((c) => c.id)).toEqual([]);
  });

  it("英文下按字母排序，中文下保持原样", () => {
    expect(localizeCategories(categories, "zh-CN")).toBe(categories);
    for (const c of localizeCategories(categories, "en")) {
      const names = c.tools.map((tool) => tool.name);
      expect(names).toEqual([...names].sort(compareNamesIn("en")));
    }
  });

  it("没有英文时显示中文", () => {
    const tool: Tool = { id: "no-such-tool", name: "测试工具", desc: "说明", icon: {} };
    expect(localizeTool(tool, "en")).toBe(tool);
  });

  it("搜索同时匹配英文和中文", () => {
    const tool = localizeTool(allTools.find((x) => x.id === "json-format")!, "en");
    expect(searchTextOf(tool)).toContain("json formatter");
    expect(searchTextOf(tool)).toContain("格式化");
  });
});

/** 列出文案对象里所有字符串的 key，如 header.search */
function leafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "string" ? [prefix + k] : Array.isArray(v) ? [] : leafKeys(v as Record<string, unknown>, `${prefix}${k}.`),
  );
}

describe("文案文件", () => {
  const messages = (i18n.global.messages as unknown as { value: Record<"zh-CN" | "en", Record<string, unknown>> }).value;

  it("中英文的 key 一一对应", () => {
    expect(leafKeys(messages.en).sort()).toEqual(leafKeys(messages["zh-CN"]).sort());
  });

  it("所有文案都能正常编译（@、|、花括号等语法字符要转义）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const l of ["zh-CN", "en"] as const) {
        setLocale(l);
        for (const key of leafKeys(messages[l])) expect(() => t(key, {}), key).not.toThrow();
      }
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

describe("文案切换", () => {
  it("切换语言后取到对应文案，缺的回退到中文", () => {
    expect(t("header.search")).toBe("搜索工具");
    setLocale("en");
    expect(t("header.search")).toBe("Search tools");
    expect(t("tool.session", { n: 2 })).toBe("Session 2");
    expect(t("no.such.key")).toBe("no.such.key");
  });

  it("相对时间跟着语言变", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(relativeTime(now + 3 * 86400_000, now)).toBe("3 天后");
    setLocale("en");
    expect(relativeTime(now + 3 * 86400_000, now)).toBe("in 3 days");
    expect(relativeTime(now - 2 * 3600_000, now)).toBe("2 hours ago");
    expect(relativeTime(now + 1000, now)).toBe("just now");
  });
});
