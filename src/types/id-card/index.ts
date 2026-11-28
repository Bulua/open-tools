/**
 * 身份证号解析模块前后端通信类型定义。
 */

export interface Birth {
  year: number;
  month: number;
  day: number;
}

export interface IdChecks {
  region: boolean | null;
  birth: boolean | null;
  checksum: boolean | null;
}

export interface Region {
  province?: string;
  city?: string;
  county?: string;
  found: boolean | null;
}

export type StarId =
  | "capricorn"
  | "aquarius"
  | "pisces"
  | "aries"
  | "taurus"
  | "gemini"
  | "cancer"
  | "leo"
  | "virgo"
  | "libra"
  | "scorpio"
  | "sagittarius";

export type ZodiacId =
  | "rat"
  | "ox"
  | "tiger"
  | "rabbit"
  | "dragon"
  | "snake"
  | "horse"
  | "goat"
  | "monkey"
  | "rooster"
  | "dog"
  | "pig";

export interface IdInfo {
  digits: string;
  id18: string | null;
  from15: boolean;
  regionCode: string;
  region: Region;
  birth: Birth | null;
  age: number | null;
  daysSince: number | null;
  daysToBirthday: number | null;
  zodiac: ZodiacId | null;
  star: StarId | null;
  sequence: string;
  male: boolean | null;
  checkDigit: string | null;
  expectedCheckDigit: string | null;
  checks: IdChecks;
}

export type IdError = "length" | "chars";

export type IdParseResult = { ok: true; info: IdInfo } | { ok: false; error: IdError };
