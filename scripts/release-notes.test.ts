import { describe, expect, it } from "vitest";
// @ts-expect-error 发布脚本是普通的 .mjs，没有类型声明
import { buildNotes } from "./release-notes.mjs";

describe("版本说明", () => {
  it("按新功能、修复、优化分组，去掉类型前缀和范围", () => {
    const notes = buildNotes(["feat(video): 新增屏幕录制", "fix(video): 播放时进度条被挡住", "chore: 发布 v0.6.8", "perf: 图片压缩更快", "docs: 更新 README"]);
    expect(notes).toBe("新功能：\n- 新增屏幕录制\n\n修复：\n- 播放时进度条被挡住\n\n优化：\n- 图片压缩更快");
  });

  it("只有一类时不写分类标题，重复的只保留一条", () => {
    expect(buildNotes(["fix: 修复 A", "fix(ui): 修复 A", "fix: 修复 B"])).toBe("- 修复 A\n- 修复 B");
  });

  it("没有可写的提交时给一句通用说明", () => {
    expect(buildNotes(["chore: 发布 v0.6.8", "refactor: 整理代码", "随手改了改"])).toBe("修复问题，优化使用体验。");
  });

  it("打包、测试相关的提交不写进去", () => {
    expect(buildNotes(["fix(ci): 打包超时", "feat(build): 新的打包脚本", "fix(test): 测试不稳定", "fix: 保存失败"])).toBe("- 保存失败");
  });
});
