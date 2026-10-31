import { describe, expect, it } from "vitest";
import { parseTimeInput } from "./timestamp";
import { formatInteger, groupBinary, parseInteger } from "./radix";
import { parseColor, toHex, toHsl, toRgb } from "@/utils/color";

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

describe("进制转换", () => {
  it("各进制互转，支持前缀和大数", () => {
    expect(parseInteger("0xff", 16)).toBe(255n);
    expect(parseInteger("1111_1111", 2)).toBe(255n);
    expect(formatInteger(255n, 8)).toBe("377");
    expect(formatInteger(parseInteger("ffffffffffffffffffff", 16), 10)).toBe("1208925819614629174706175");
    expect(parseInteger("-10", 10)).toBe(-10n);
  });

  it("非法数字给出提示", () => {
    expect(() => parseInteger("102", 2)).toThrow("「2」不是 2 进制的数字");
  });

  it("二进制按 4 位分组", () => {
    expect(groupBinary("10110")).toBe("1 0110");
    expect(groupBinary("-11111111")).toBe("-1111 1111");
  });
});

describe("颜色转换", () => {
  it("解析各种写法", () => {
    expect(parseColor("#c96442")).toEqual({ r: 201, g: 100, b: 66, a: 1 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("rgb(201, 100, 66)")).toEqual({ r: 201, g: 100, b: 66, a: 1 });
    expect(parseColor("rgba(201 100 66 / 50%)")).toEqual({ r: 201, g: 100, b: 66, a: 0.5 });
    expect(parseColor("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("hsl(120 100% 25%)")).toEqual({ r: 0, g: 128, b: 0, a: 1 });
    expect(parseColor("not a color")).toBeNull();
  });

  it("输出 HEX / RGB / HSL", () => {
    const c = { r: 201, g: 100, b: 66, a: 1 };
    expect(toHex(c)).toBe("#c96442");
    expect(toRgb(c)).toBe("rgb(201, 100, 66)");
    expect(toHsl(c)).toBe("hsl(15, 56%, 52%)");
    expect(toHsl({ r: 0, g: 128, b: 0, a: 1 })).toBe("hsl(120, 100%, 25%)");
    expect(toRgb({ ...c, a: 0.5 })).toBe("rgba(201, 100, 66, 0.5)");
    expect(toHex({ ...c, a: 0.5 })).toBe("#c9644280");
  });
});
