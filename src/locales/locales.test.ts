import { afterEach, describe, expect, it, vi } from "vitest";
import { allTools, categories, type Tool } from "@/tools";
import { relativeTime } from "@/utils/time";
import { LOCALES, i18n, matchLocale, t, toolTexts, type Locale, type OtherLocale } from "./index";
import { CATEGORY_NAMES, compareNamesIn, localizeCategories, localizeTool, searchTextOf } from "./tools";

const setLocale = (l: Locale) => ((i18n.global.locale as unknown as { value: string }).value = l);
afterEach(() => setLocale("zh-CN"));

/** 中文以外的所有语言 */
const OTHERS = LOCALES.map((l) => l.value).filter((l): l is OtherLocale => l !== "zh-CN");

describe.each(OTHERS)("工具列表的翻译：%s", (l) => {
  const texts = toolTexts[l] ?? {};

  it("每个工具都有名称和说明", () => {
    expect(allTools.filter((tool) => !texts[tool.id]?.name || !texts[tool.id]?.desc).map((tool) => tool.id)).toEqual([]);
  });

  it("没有写给不存在的工具", () => {
    const ids = new Set(allTools.map((tool) => tool.id));
    expect(Object.keys(texts).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("按钮和输入框提示与工具定义一一对应", () => {
    for (const tool of allTools) {
      const x = texts[tool.id];
      expect(x.actions?.length ?? 0, tool.id).toBe(tool.actions?.length ?? 0);
      expect(Boolean(x.placeholder), tool.id).toBe(Boolean(tool.inputPlaceholder));
    }
  });

  it("每个分类都有名称", () => {
    expect(categories.filter((c) => !CATEGORY_NAMES[l]?.[c.id]).map((c) => c.id)).toEqual([]);
  });

  it("按该语言排序", () => {
    for (const c of localizeCategories(categories, l)) {
      const names = c.tools.map((tool) => tool.name);
      expect(names).toEqual([...names].sort(compareNamesIn(l)));
    }
  });
});

describe("工具列表", () => {
  it("中文下保持原样", () => {
    expect(localizeCategories(categories, "zh-CN")).toBe(categories);
  });

  it("没有翻译时显示中文", () => {
    const tool: Tool = { id: "no-such-tool", name: "测试工具", desc: "说明", icon: {} };
    expect(localizeTool(tool, "en")).toBe(tool);
  });

  it("搜索同时匹配当前语言和中文", () => {
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
  const messages = (i18n.global.messages as unknown as { value: Record<Locale, Record<string, unknown>> }).value;
  const zhKeys = leafKeys(messages["zh-CN"]).sort();

  it("英文完整：key 与中文一一对应", () => {
    expect(leafKeys(messages.en).sort()).toEqual(zhKeys);
  });

  // 其他语言可以只翻译一部分（缺的回退到英文），但不能有中文里没有的 key
  it.each(OTHERS)("%s 没有多余的 key", (l) => {
    const zh = new Set(zhKeys);
    expect(leafKeys(messages[l]).filter((k) => !zh.has(k))).toEqual([]);
  });

  it("所有文案都能正常编译（@、|、花括号等语法字符要转义）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const { value: l } of LOCALES) {
        setLocale(l);
        for (const key of leafKeys(messages[l])) expect(() => t(key, {}), `${l}: ${key}`).not.toThrow();
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

  it("系统语言匹配界面语言", () => {
    expect(matchLocale("zh-CN")).toBe("zh-CN");
    expect(matchLocale("zh-TW")).toBe("zh-CN");
    expect(matchLocale("en-US")).toBe("en");
    expect(matchLocale("xx-YY")).toBe("en");
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
