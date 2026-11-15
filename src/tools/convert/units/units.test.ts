import { describe, expect, it } from "vitest";
import { QUANTITIES, convertUnit, formatNumber } from "./units";

const q = (id: string) => QUANTITIES.find((x) => x.id === id)!;

describe("温度", () => {
  it("常用换算", () => {
    expect(convertUnit(q("temperature"), 100, "c", "f")).toBe(212);
    expect(convertUnit(q("temperature"), 32, "f", "c")).toBe(0);
    expect(convertUnit(q("temperature"), 0, "c", "k")).toBe(273.15);
    expect(formatNumber(convertUnit(q("temperature"), -40, "c", "f"))).toBe("-40");
    expect(formatNumber(convertUnit(q("temperature"), 0, "k", "r"))).toBe("0");
  });
});

describe("其他单位", () => {
  it("长度、重量、面积", () => {
    expect(convertUnit(q("length"), 1, "mi", "km")).toBeCloseTo(1.609344);
    expect(convertUnit(q("length"), 1, "m", "chi")).toBeCloseTo(3);
    expect(convertUnit(q("weight"), 1, "kg", "jin")).toBe(2);
    expect(convertUnit(q("area"), 1, "ha", "mu")).toBeCloseTo(15);
  });

  it("数据大小区分 1024 与 1000", () => {
    expect(convertUnit(q("data"), 1, "gb", "mb")).toBe(1024);
    expect(formatNumber(convertUnit(q("data"), 1000, "gb10", "gb"))).toBe("931.3225746");
  });
});

describe("formatNumber", () => {
  it("去掉浮点误差", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(1 / 3)).toBe("0.3333333333");
  });

  it("极大极小值用科学计数法", () => {
    expect(formatNumber(1.5e20)).toBe("1.5e+20");
    expect(formatNumber(2e-9)).toBe("2e-9");
  });
});

describe("更多物理量", () => {
  const q = (id: string) => QUANTITIES.find((x) => x.id === id)!;
  it("压力、能量、功率、角度、频率", () => {
    expect(formatNumber(convertUnit(q("pressure"), 1, "atm", "kpa"))).toBe("101.325");
    expect(formatNumber(convertUnit(q("energy"), 1, "kwh", "kcal"))).toBe("860.4206501");
    expect(formatNumber(convertUnit(q("power"), 1, "hp", "w"))).toBe("735.49875");
    expect(formatNumber(convertUnit(q("angle"), 180, "deg", "rad"))).toBe("3.141592654");
    expect(formatNumber(convertUnit(q("frequency"), 3000, "rpm", "hz"))).toBe("50");
  });
});
