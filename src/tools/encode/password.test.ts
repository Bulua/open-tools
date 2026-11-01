import { describe, expect, it } from "vitest";
import { CHARSETS, DEFAULT_PASSWORD, charGroups, crackTime, generatePassword, passwordStrength, secureRandomInt } from "./password";

describe("随机密码", () => {
  it("长度正确，包含每种选中的字符", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword({ ...DEFAULT_PASSWORD, length: 8 });
      expect(p).toHaveLength(8);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/\d/);
      expect([...p].some((c) => CHARSETS.symbols.includes(c))).toBe(true);
    }
  });

  it("只用自定义字符；排除易混淆字符", () => {
    const opts = { ...DEFAULT_PASSWORD, upper: false, lower: false, digits: false, symbols: false, custom: "ab" };
    expect(generatePassword({ ...opts, length: 30 })).toMatch(/^[ab]{30}$/);
    const groups = charGroups({ ...DEFAULT_PASSWORD, excludeAmbiguous: true });
    expect(groups.join("")).not.toMatch(/[0Oo1lI]/);
  });

  it("没有选择字符时报错", () => {
    expect(() => generatePassword({ ...DEFAULT_PASSWORD, upper: false, lower: false, digits: false, symbols: false })).toThrow("请至少选择一种字符");
  });

  it("随机数在范围内", () => {
    for (let i = 0; i < 200; i++) {
      const n = secureRandomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it("强度与破解时间", () => {
    expect(passwordStrength({ ...DEFAULT_PASSWORD, length: 6, upper: false, lower: false, symbols: false }).label).toBe("弱");
    expect(passwordStrength({ ...DEFAULT_PASSWORD, length: 16 }).label).toBe("非常强");
    expect(crackTime(20)).toBe("瞬间");
    expect(crackTime(60)).toMatch(/年/);
  });
});
