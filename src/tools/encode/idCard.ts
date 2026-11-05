/**
 * 身份证号解析（中国大陆居民身份证，GB 11643）：
 * 18 位 = 6 位地区码 + 8 位出生日期 + 3 位顺序码（第 17 位奇数为男、偶数为女）+ 1 位校验码；
 * 15 位老号码 = 6 位地区码 + 6 位出生日期（年份省略 19）+ 3 位顺序码，没有校验码。
 */

export interface Birth {
  year: number;
  month: number;
  day: number;
}

/** 各项检查；null 表示还没输入到这一部分，暂时无法判断 */
export interface IdChecks {
  /** 地区码的省份存在（输入 2 位后可以判断） */
  region: boolean | null;
  /** 出生日期是真实存在的日期，且不晚于今天（输入 14 位后可以判断） */
  birth: boolean | null;
  /** 校验码正确（输入 18 位后可以判断）；15 位号码没有校验码，算通过 */
  checksum: boolean | null;
}

/** 解析结果；输入了多少位就解析多少，还没输入到的部分为空 */
export interface IdInfo {
  /** 输入的号码（去掉分隔符后） */
  digits: string;
  /** 完整的 18 位号码；输入 15 位老号码时是升级后的号码；没输入完时为空 */
  id18: string | null;
  /** 按 15 位老号码解析 */
  from15: boolean;
  /** 已输入的地区码，最多 6 位 */
  regionCode: string;
  /** 输入完出生日期且日期存在时才有 */
  birth: Birth | null;
  /** 已输入的顺序码，最多 3 位 */
  sequence: string;
  /** 输入到第 17 位后才知道 */
  male: boolean | null;
  /** 号码里的校验码；15 位号码没有 */
  checkDigit: string | null;
  /** 按前 17 位算出的校验码，输入 17 位后才有 */
  expectedCheckDigit: string | null;
  checks: IdChecks;
}

/** 输入有误的原因，文案见 encode.idError_* */
export type IdError = "length" | "chars";

export type IdParseResult = { ok: true; info: IdInfo } | { ok: false; error: IdError };

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_CHARS = "10X98765432";

/** 按前 17 位计算校验码（ISO 7064 MOD 11-2） */
export function checkDigitOf(first17: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(first17[i]) * WEIGHTS[i];
  return CHECK_CHARS[sum % 11];
}

/** 去掉空格、横线等分隔符，小写 x 转大写 */
export const normalizeId = (input: string) => input.replace(/[\s\-_]/g, "").toUpperCase();

const isRealDate = ({ year, month, day }: Birth) => {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
};

/** 两个日期比较：a 早于 b 返回负数 */
const compareDate = (a: Birth, b: Birth) => a.year - b.year || a.month - b.month || a.day - b.day;

export const toBirth = (d: Date): Birth => ({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });

/** 8 位 yyyymmdd 的出生日期：存在且不晚于今天 */
const birthOf = (yyyymmdd: string): Birth => ({ year: Number(yyyymmdd.slice(0, 4)), month: Number(yyyymmdd.slice(4, 6)), day: Number(yyyymmdd.slice(6, 8)) });
const validBirth = (b: Birth, today: Birth) => isRealDate(b) && compareDate(b, today) <= 0;

/**
 * 解析身份证号，输入了多少位就解析多少（按 18 位号码的格式）。
 * 正好 15 位时，如果按 18 位格式出生日期不成立、按 15 位老号码却成立，就按老号码解析并升级为 18 位。
 * provinces 是存在的省级代码（前 2 位），用来检查地区码；today 用来判断出生日期是否晚于今天。
 */
export function parseId(input: string, provinces: ReadonlySet<string>, today: Birth): IdParseResult {
  const s = normalizeId(input);
  if (s.length > 18) return { ok: false, error: "length" };
  if (!/^\d{0,17}[\dX]?$/.test(s) || (s.endsWith("X") && s.length !== 18)) return { ok: false, error: "chars" };

  const from15 = s.length === 15 && !validBirth(birthOf(s.slice(6, 14)), today) && validBirth(birthOf(`19${s.slice(6, 12)}`), today);
  // 统一转成 18 位格式的前 17 位（可能还没输入完）
  const first17 = from15 ? `${s.slice(0, 6)}19${s.slice(6)}` : s.slice(0, 17);
  const expectedCheckDigit = first17.length === 17 ? checkDigitOf(first17) : null;
  const checkDigit = s.length === 18 ? s[17] : null;
  const date = first17.length >= 14 ? birthOf(first17.slice(6, 14)) : null;

  return {
    ok: true,
    info: {
      digits: s,
      id18: from15 || s.length === 18 ? first17 + expectedCheckDigit : null,
      from15,
      regionCode: s.slice(0, 6),
      birth: date && isRealDate(date) ? date : null,
      sequence: first17.slice(14, 17),
      male: first17.length === 17 ? Number(first17[16]) % 2 === 1 : null,
      checkDigit,
      expectedCheckDigit,
      checks: {
        region: s.length >= 2 ? provinces.has(s.slice(0, 2)) : null,
        birth: date ? validBirth(date, today) : null,
        checksum: from15 ? true : checkDigit === null ? null : checkDigit === expectedCheckDigit,
      },
    },
  };
}

// ---------- 地区 ----------

/** 代码 → 名称，由 idRegions.ts 里的数据生成 */
export type RegionTable = ReadonlyMap<string, string>;

/** 解析「6 位代码 + 名称」用 | 连接的数据 */
export function parseRegionTable(data: string): RegionTable {
  return new Map(data.split("|").map((item) => [item.slice(0, 6), item.slice(6)]));
}

export const provincesOf = (table: RegionTable) => new Set([...table.keys()].filter((c) => c.endsWith("0000")).map((c) => c.slice(0, 2)));

export interface Region {
  province?: string;
  /** 直辖市、省直辖县级行政区没有市一级 */
  city?: string;
  county?: string;
  /** 6 位区县代码在代码表中找到了；找不到时可能已撤销或调整过；没输入完 6 位时为 null */
  found: boolean | null;
}

/** 地区；code 可以只有前 2 位或前 4 位 */
export function regionOf(code: string, table: RegionTable): Region {
  const province = code.length >= 2 ? table.get(`${code.slice(0, 2)}0000`) : undefined;
  const city = code.length >= 4 && code.slice(2, 4) !== "00" ? table.get(`${code.slice(0, 4)}00`) : undefined;
  const county = code.length === 6 && code.slice(4) !== "00" ? table.get(code) : undefined;
  return { province, city, county, found: code.length === 6 ? table.has(code) : null };
}

// ---------- 由出生日期推算 ----------

/** 周岁 */
export function ageOn(birth: Birth, today: Birth): number {
  const age = today.year - birth.year;
  return today.month < birth.month || (today.month === birth.month && today.day < birth.day) ? age - 1 : age;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** 今年（或明年）的生日；2 月 29 日出生的人在平年按 2 月 28 日算 */
const birthdayIn = (birth: Birth, year: number): Birth =>
  birth.month === 2 && birth.day === 29 && !isLeap(year) ? { year, month: 2, day: 28 } : { year, month: birth.month, day: birth.day };

const dayNumber = (d: Birth) => Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;

/** 距离下次生日还有几天，今天生日为 0 */
export function daysToBirthday(birth: Birth, today: Birth): number {
  let next = birthdayIn(birth, today.year);
  if (compareDate(next, today) < 0) next = birthdayIn(birth, today.year + 1);
  return dayNumber(next) - dayNumber(today);
}

/** 出生到今天的天数 */
export const daysSince = (birth: Birth, today: Birth) => dayNumber(today) - dayNumber(birth);

/** 星座，按每个星座的起始日期；文案见 encode.star_* */
const STARS = [
  { id: "capricorn", from: [1, 1] },
  { id: "aquarius", from: [1, 20] },
  { id: "pisces", from: [2, 19] },
  { id: "aries", from: [3, 21] },
  { id: "taurus", from: [4, 20] },
  { id: "gemini", from: [5, 21] },
  { id: "cancer", from: [6, 22] },
  { id: "leo", from: [7, 23] },
  { id: "virgo", from: [8, 23] },
  { id: "libra", from: [9, 23] },
  { id: "scorpio", from: [10, 24] },
  { id: "sagittarius", from: [11, 23] },
  { id: "capricorn", from: [12, 22] },
] as const;
export type StarId = (typeof STARS)[number]["id"];

export function starOf({ month, day }: Birth): StarId {
  let id: StarId = "capricorn";
  for (const s of STARS) if (month > s.from[0] || (month === s.from[0] && day >= s.from[1])) id = s.id;
  return id;
}

/** 生肖，按农历年（春节）划分；文案见 encode.zodiac_* */
export const ZODIACS = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"] as const;
export type ZodiacId = (typeof ZODIACS)[number];

/** 出生那天所在的农历年对应的公历年份，例如 1990-01-20 还在 1989 年（己巳年）里 */
export function lunarYearOf({ year, month, day }: Birth): number {
  const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { year: "numeric", timeZone: "UTC" }).formatToParts(new Date(Date.UTC(year, month - 1, day)));
  const related = parts.find((p) => (p.type as string) === "relatedYear")?.value;
  return related ? Number(related) : year;
}

export const zodiacOf = (birth: Birth): ZodiacId => ZODIACS[(((lunarYearOf(birth) - 4) % 12) + 12) % 12];

/** 最近查询过的号码（18 位），最新的在前，同一个号码只留一条 */
export const addHistory = (list: readonly string[], id18: string, max = 10) => [id18, ...list.filter((x) => x !== id18)].slice(0, max);

/** 按地区码、出生日期、其余部分分段，方便核对：110105 19491231 002X */
export const formatId = (id: string) => (id.length === 18 ? `${id.slice(0, 6)} ${id.slice(6, 14)} ${id.slice(14)}` : `${id.slice(0, 6)} ${id.slice(6, 12)} ${id.slice(12)}`);
