import { describe, expect, it } from "vitest";
import { pickNotes, splitNotes } from "./releaseNotes";

const NOTES = "- 新增日语界面\n- 修复问题\n<!-- en -->\n- Added Japanese UI\n- Bug fixes\n<!-- ja -->\n- 日本語の UI を追加";

describe("更新说明按语言分段", () => {
  it("拆出各语言的段落，开头没有标记的是中文", () => {
    expect(splitNotes(NOTES)).toEqual({
      "zh-CN": "- 新增日语界面\n- 修复问题",
      en: "- Added Japanese UI\n- Bug fixes",
      ja: "- 日本語の UI を追加",
    });
  });

  it("按界面语言挑选", () => {
    expect(pickNotes(NOTES, "zh-CN")).toBe("- 新增日语界面\n- 修复问题");
    expect(pickNotes(NOTES, "ja")).toBe("- 日本語の UI を追加");
  });

  it("没有对应语言时先用英文，再用中文", () => {
    expect(pickNotes("中文\n<!-- en -->\nEnglish", "ja")).toBe("English");
    expect(pickNotes("只有中文", "en")).toBe("只有中文");
    expect(pickNotes("只有中文", "ja")).toBe("只有中文");
  });

  it("只写了其他语言时，中文界面也能显示", () => {
    expect(pickNotes("<!-- en -->\nEnglish only", "zh-CN")).toBe("English only");
  });
});
