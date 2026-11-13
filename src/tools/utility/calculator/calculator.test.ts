import { describe, expect, it } from "vitest";
import { evaluate, formatResult } from "./calculator";

const calc = (s: string, angle: "deg" | "rad" = "deg") => formatResult(evaluate(s, angle));

describe("计算器", () => {
  it("四则运算与优先级", () => {
    expect(calc("1 + 2 * 3")).toBe("7");
    expect(calc("(1 + 2) × 3")).toBe("9");
    expect(calc("10 ÷ 4")).toBe("2.5");
    expect(calc("0.1 + 0.2")).toBe("0.3");
  });

  it("乘方、负号、取余、百分号、阶乘", () => {
    expect(calc("2^3^2")).toBe("512");
    expect(calc("-2^2")).toBe("-4");
    expect(calc("2^-1")).toBe("0.5");
    expect(calc("10 mod 3")).toBe("1");
    expect(calc("200 * 15%")).toBe("30");
    expect(calc("5!")).toBe("120");
  });

  it("函数与常量", () => {
    expect(calc("√16")).toBe("4");
    expect(calc("sqrt(2)^2")).toBe("2");
    expect(calc("sin(30)")).toBe("0.5");
    expect(calc("cos(90)")).toBe("0");
    expect(calc("sin(pi/2)", "rad")).toBe("1");
    expect(calc("log(1000)")).toBe("3");
    expect(calc("ln(e)")).toBe("1");
    expect(calc("abs(-3.5)")).toBe("3.5");
    expect(calc("sin(30)^2")).toBe("0.25");
  });

  it("省略乘号", () => {
    expect(calc("2π")).toBe(formatResult(2 * Math.PI));
    expect(calc("2(3+4)")).toBe("14");
    expect(calc("(1+2)(3+4)")).toBe("21");
  });

  it("允许省略最后的右括号", () => {
    expect(calc("2*(3+4")).toBe("14");
  });

  it("错误提示", () => {
    expect(() => evaluate("1/0")).toThrow("不能除以 0");
    expect(() => evaluate("1+")).toThrow("算式不完整");
    expect(() => evaluate("2)")).toThrow("括号不匹配");
    expect(() => evaluate("abc")).toThrow("不认识");
    expect(() => evaluate("√-4")).toThrow("负数不能开平方");
    expect(() => evaluate("")).toThrow("请输入算式");
  });

  it("大数用科学计数法", () => {
    expect(calc("10^20")).toBe("1e+20");
  });
});
