import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_DURATION, dismissError, errorMessage, errors, holdError, releaseError, showError } from "./errorToast";

describe("errorToast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    errors.value.forEach((x) => dismissError(x.id));
    vi.useRealTimers();
  });

  it("把各种 catch 到的值转成文字", () => {
    expect(errorMessage(new Error("坏了"))).toBe("坏了");
    expect(errorMessage("出错")).toBe("出错");
    expect(errorMessage({ message: "对象" })).toBe("对象");
    expect(errorMessage(42)).toBe("42");
  });

  it("到时间自动收起", () => {
    showError(new Error("保存失败"), "导出");
    expect(errors.value[0]).toMatchObject({ message: "保存失败", title: "导出" });
    vi.advanceTimersByTime(ERROR_DURATION);
    expect(errors.value).toHaveLength(0);
  });

  it("鼠标停留时不收起，移开后重新计时", () => {
    showError("看一下");
    const id = errors.value[0].id;
    holdError(id);
    vi.advanceTimersByTime(ERROR_DURATION * 2);
    expect(errors.value).toHaveLength(1);
    releaseError(id);
    vi.advanceTimersByTime(ERROR_DURATION);
    expect(errors.value).toHaveLength(0);
  });

  it("空内容不显示，相同内容只显示一条并重新计时", () => {
    showError("  ");
    showError("重复");
    vi.advanceTimersByTime(ERROR_DURATION - 100);
    showError("重复");
    expect(errors.value).toHaveLength(1);
    vi.advanceTimersByTime(ERROR_DURATION - 100);
    expect(errors.value).toHaveLength(1);
  });

  it("最多同时显示 3 条，更早的先收起", () => {
    ["1", "2", "3", "4"].forEach((m) => showError(m));
    expect(errors.value.map((x) => x.message)).toEqual(["2", "3", "4"]);
  });
});
