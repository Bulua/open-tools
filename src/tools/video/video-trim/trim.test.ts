import { describe, expect, it } from "vitest";
import { MIN_LENGTH, clampTrim, encodeCrop, formatTime, isFullFrame, parseTime } from "./trim";

describe("视频裁剪", () => {
  it("时间段限制在视频范围内，至少保留一小段", () => {
    expect(clampTrim(-2, 5, 10)).toEqual({ start: 0, end: 5 });
    expect(clampTrim(3, 20, 10)).toEqual({ start: 3, end: 10 });
    expect(clampTrim(6, 2, 10)).toEqual({ start: 6, end: 6 + MIN_LENGTH });
    expect(clampTrim(10, 10, 10)).toEqual({ start: 10 - MIN_LENGTH, end: 10 });
  });

  it("时间显示为分:秒", () => {
    expect(formatTime(0)).toBe("0:00.0");
    expect(formatTime(83.46)).toBe("1:23.5");
    expect(formatTime(3723)).toBe("1:02:03.0");
    expect(formatTime(59.96)).toBe("1:00.0");
  });

  it("解析多种时间写法", () => {
    expect(parseTime("83.5")).toBe(83.5);
    expect(parseTime("1:23.5")).toBe(83.5);
    expect(parseTime("1：02：03")).toBe(3723);
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("1:2:3:4")).toBeNull();
    expect(parseTime("")).toBeNull();
  });

  it("裁剪区域宽高取偶数并限制在画面内", () => {
    expect(encodeCrop({ x: 10.4, y: 5, w: 101, h: 57 }, 1920, 1080)).toEqual({ left: 10, top: 5, width: 100, height: 56 });
    expect(encodeCrop({ x: 1900, y: 0, w: 101, h: 1081 }, 1920, 1080)).toEqual({ left: 1820, top: 0, width: 100, height: 1080 });
    expect(encodeCrop({ x: 0, y: 0, w: 641, h: 361 }, 641, 361)).toEqual({ left: 0, top: 0, width: 640, height: 360 });
  });

  it("判断是否裁到整个画面", () => {
    expect(isFullFrame({ x: 0, y: 0, w: 1920, h: 1080 }, 1920, 1080)).toBe(true);
    expect(isFullFrame({ x: 0, y: 0, w: 1900, h: 1080 }, 1920, 1080)).toBe(false);
  });
});
