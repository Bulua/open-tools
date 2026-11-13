import { describe, expect, it } from "vitest";
import {
  addHistory,
  ageOn,
  checkDigitOf,
  daysToBirthday,
  formatId,
  parseId,
  parseRegionTable,
  provincesOf,
  regionOf,
  starOf,
  zodiacOf,
} from "./idCard";
import regions from "./idRegions";

const table = parseRegionTable(regions);
const provinces = provincesOf(table);
const today = { year: 2026, month: 11, day: 5 };

describe("身份证号解析", () => {
  it("解析 GB 11643 中的示例号码", () => {
    const r = parseId("11010519491231002x", provinces, today);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info).toMatchObject({
      id18: "11010519491231002X",
      from15: false,
      regionCode: "110105",
      birth: { year: 1949, month: 12, day: 31 },
      sequence: "002",
      male: false,
      checkDigit: "X",
      checks: { region: true, birth: true, checksum: true },
    });
  });

  it("忽略空格和横线", () => {
    const r = parseId(" 110105 1949-1231 002X ", provinces, today);
    expect(r.ok && r.info.checks.checksum).toBe(true);
  });

  it("校验码错误", () => {
    const r = parseId("110105194912310021", provinces, today);
    expect(r.ok && r.info.checks).toEqual({ region: true, birth: true, checksum: false });
    expect(r.ok && r.info.expectedCheckDigit).toBe("X");
  });

  it("15 位老号码升级为 18 位", () => {
    const r = parseId("110105491231002", provinces, today);
    expect(r.ok && r.info.id18).toBe("11010519491231002X");
    expect(r.ok && r.info.from15).toBe(true);
    expect(r.ok && r.info.checks.checksum).toBe(true);
  });

  it("不存在的日期、未来的日期、不存在的省份", () => {
    const bad = parseId("990105199002300010", provinces, today);
    expect(bad.ok && bad.info.birth).toBeNull();
    expect(bad.ok && bad.info.checks.region).toBe(false);
    const future = "11010520300101001";
    const r = parseId(future + checkDigitOf(future), provinces, today);
    expect(r.ok && r.info.checks.birth).toBe(false);
  });

  it("位数或字符不对", () => {
    expect(parseId("1101051949123100212", provinces, today)).toEqual({ ok: false, error: "length" });
    expect(parseId("11010519491231002A", provinces, today)).toEqual({ ok: false, error: "chars" });
    expect(parseId("11010549123100X", provinces, today)).toEqual({ ok: false, error: "chars" });
  });

  it("输入一部分时先解析已输入的部分", () => {
    const at = (s: string) => {
      const r = parseId(s, provinces, today);
      if (!r.ok) throw new Error(r.error);
      return r.info;
    };
    expect(at("1")).toMatchObject({ regionCode: "1", birth: null, male: null, id18: null, checks: { region: null, birth: null, checksum: null } });
    expect(at("11").checks.region).toBe(true);
    expect(at("99").checks.region).toBe(false);
    expect(at("1101051949123").birth).toBeNull();
    expect(at("11010519491231")).toMatchObject({ birth: { year: 1949, month: 12, day: 31 }, checks: { birth: true, checksum: null } });
    expect(at("1101051949123100")).toMatchObject({ sequence: "00", male: null, expectedCheckDigit: null });
    expect(at("11010519491231002")).toMatchObject({ male: false, expectedCheckDigit: "X", checkDigit: null, id18: null });
    // 不存在的月份在输入完日期后才判断
    expect(at("11010519901301").checks.birth).toBe(false);
  });

  it("正好 15 位时，按 18 位格式日期也成立就当作还没输入完", () => {
    // 前 14 位 11010519491231 是有效日期，不当作老号码
    expect(parseId("110105194912310", provinces, today)).toMatchObject({ ok: true, info: { from15: false, id18: null } });
  });

  it("地区", () => {
    expect(regionOf("110105", table)).toEqual({ province: "北京市", city: undefined, county: "朝阳区", found: true });
    expect(regionOf("440305", table)).toMatchObject({ province: "广东省", city: "深圳市", county: "南山区", found: true });
    expect(regionOf("419001", table)).toMatchObject({ province: "河南省", county: "济源市", found: true });
    // 代码表里没有的区县：只能显示到省、市
    expect(regionOf("440399", table)).toMatchObject({ province: "广东省", city: "深圳市", county: undefined, found: false });
    // 只输入了一部分
    expect(regionOf("44", table)).toEqual({ province: "广东省", city: undefined, county: undefined, found: null });
    expect(regionOf("4403", table)).toEqual({ province: "广东省", city: "深圳市", county: undefined, found: null });
    expect(regionOf("", table)).toEqual({ province: undefined, city: undefined, county: undefined, found: null });
  });

  it("周岁和下次生日", () => {
    const birth = { year: 1990, month: 11, day: 6 };
    expect(ageOn(birth, today)).toBe(35);
    expect(daysToBirthday(birth, today)).toBe(1);
    expect(ageOn({ year: 1990, month: 11, day: 5 }, today)).toBe(36);
    expect(daysToBirthday({ year: 1990, month: 11, day: 5 }, today)).toBe(0);
    // 2 月 29 日出生，平年按 2 月 28 日
    expect(daysToBirthday({ year: 2000, month: 2, day: 29 }, { year: 2027, month: 2, day: 27 })).toBe(1);
  });

  it("星座和生肖", () => {
    expect(starOf({ year: 1990, month: 1, day: 19 })).toBe("capricorn");
    expect(starOf({ year: 1990, month: 1, day: 20 })).toBe("aquarius");
    expect(starOf({ year: 1990, month: 12, day: 22 })).toBe("capricorn");
    expect(zodiacOf({ year: 1990, month: 3, day: 7 })).toBe("horse");
    // 1990 年春节是 1 月 27 日，之前还是蛇年
    expect(zodiacOf({ year: 1990, month: 1, day: 20 })).toBe("snake");
  });

  it("历史记录：最新的在前、去重、最多 10 条", () => {
    expect(addHistory(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    const full = Array.from({ length: 10 }, (_, i) => String(i));
    expect(addHistory(full, "new")).toEqual(["new", ...full.slice(0, 9)]);
  });

  it("分段显示", () => {
    expect(formatId("11010519491231002X")).toBe("110105 19491231 002X");
  });
});
