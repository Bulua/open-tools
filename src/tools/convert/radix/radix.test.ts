import { describe, expect, it } from "vitest";
import { formatInteger, groupBinary, parseInteger } from "./radix";

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
