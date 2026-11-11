import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_DURATION, dismissToast, errorMessage, holdToast, releaseToast, showError, showNotice, toasts } from "./errorToast";

describe("errorToast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    toasts.value.forEach((x) => dismissToast(x.id));
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
    expect(toasts.value[0]).toMatchObject({ message: "保存失败", title: "导出" });
    vi.advanceTimersByTime(TOAST_DURATION);
    expect(toasts.value).toHaveLength(0);
  });

  it("鼠标停留时不收起，移开后重新计时", () => {
    showError("看一下");
    const id = toasts.value[0].id;
    holdToast(id);
    vi.advanceTimersByTime(TOAST_DURATION * 2);
    expect(toasts.value).toHaveLength(1);
    releaseToast(id);
    vi.advanceTimersByTime(TOAST_DURATION);
    expect(toasts.value).toHaveLength(0);
  });

  it("空内容不显示，相同内容只显示一条并重新计时", () => {
    showError("  ");
    showError("重复");
    vi.advanceTimersByTime(TOAST_DURATION - 100);
    showError("重复");
    expect(toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(TOAST_DURATION - 100);
    expect(toasts.value).toHaveLength(1);
  });

  it("最多同时显示 3 条，更早的先收起", () => {
    ["1", "2", "3", "4"].forEach((m) => showError(m));
    expect(toasts.value.map((x) => x.message)).toEqual(["2", "3", "4"]);
  });

  it("普通提示与错误各自去重，共用收起计时", () => {
    showNotice("请先压缩");
    showNotice("请先压缩");
    showError("请先压缩");
    expect(toasts.value.map((item) => item.kind)).toEqual(["notice", "error"]);
    vi.advanceTimersByTime(TOAST_DURATION);
    expect(toasts.value).toHaveLength(0);
  });
});
