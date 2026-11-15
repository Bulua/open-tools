import { describe, expect, it } from "vitest";
import { parseTimeInput } from "./timestamp";

describe("时间戳", () => {
  it("自动区分秒和毫秒", () => {
    const s = parseTimeInput("1700000000");
    const ms = parseTimeInput("1700000000000");
    expect(s.ok && s.unit).toBe("s");
    expect(ms.ok && ms.unit).toBe("ms");
    expect(s.ok && ms.ok && s.date.getTime() === ms.date.getTime()).toBe(true);
  });

  it("可以手动指定单位", () => {
    const r = parseTimeInput("1700000000", "ms");
    expect(r.ok && r.date.getTime()).toBe(1700000000);
  });

  it("解析日期文本（本地时间）", () => {
    const r = parseTimeInput("2024-01-02 03:04:05");
    expect(r.ok && r.date.getTime()).toBe(new Date(2024, 0, 2, 3, 4, 5).getTime());
  });

  it("无法识别时给出提示", () => {
    const r = parseTimeInput("hello");
    expect(r.ok).toBe(false);
  });
});
