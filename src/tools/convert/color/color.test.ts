import { describe, expect, it } from "vitest";
import { hsvToRgb, parseColor, rgbToHsv, toHex, toHsl, toRgb } from "@/utils/color";

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

describe("取色板 HSV", () => {
  it("与 RGB 互转", () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsvToRgb(120, 1, 0.5)).toEqual({ r: 0, g: 128, b: 0 });
    expect(hsvToRgb(0, 0, 1)).toEqual({ r: 255, g: 255, b: 255 });
    for (const c of [{ r: 201, g: 100, b: 66 }, { r: 12, g: 200, b: 240 }, { r: 90, g: 90, b: 90 }]) {
      const { h, s, v } = rgbToHsv(c);
      expect(hsvToRgb(h, s, v)).toEqual(c);
    }
  });
});
