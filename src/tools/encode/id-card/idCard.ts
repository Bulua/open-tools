/**
 * 身份证号解析前端类型与界面辅助函数。
 * 核心 GB 11643 校验解析与 GB/T 2260 行政区划码表统一由 Rust 后端维护，供界面与 AI 工具共用。
 */
import { invoke } from "@tauri-apps/api/core";

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

export interface Region {
  province?: string;
  /** 直辖市、省直辖县级行政区没有市一级 */
  city?: string;
  county?: string;
  /** 6 位区县代码在代码表中找到了；找不到时可能已撤销或调整过；没输入完 6 位时为 null */
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
  /** 行政区划解析结果 */
  region: Region;
  /** 输入完出生日期且日期存在时才有 */
  birth: Birth | null;
  /** 周岁（出生日期有效且不晚于今天时才有） */
  age: number | null;
  /** 出生到今天的天数 */
  daysSince: number | null;
  /** 距离下次生日还有几天，今天生日为 0 */
  daysToBirthday: number | null;
  /** 农历生肖 */
  zodiac: ZodiacId | null;
  /** 星座 */
  star: StarId | null;
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

/** 调用 Rust 后端批量解析身份证号 */
export async function parseIdCards(inputs: readonly string[]): Promise<IdParseResult[]> {
  if (inputs.length === 0) return [];
  return invoke<IdParseResult[]>("id_card_parse", { inputs: [...inputs] });
}

/** 调用 Rust 后端解析单个身份证号 */
export async function parseIdCard(input: string): Promise<IdParseResult> {
  const [result] = await parseIdCards([input]);
  return result;
}

/** 最近查询过的号码（18 位），最新的在前，同一个号码只留一条 */
export const addHistory = (list: readonly string[], id18: string, max = 10) =>
  [id18, ...list.filter((x) => x !== id18)].slice(0, max);

/** 按地区码、出生日期、其余部分分段，方便核对：110105 19491231 002X */
export const formatId = (id: string) =>
  id.length === 18
    ? `${id.slice(0, 6)} ${id.slice(6, 14)} ${id.slice(14)}`
    : `${id.slice(0, 6)} ${id.slice(6, 12)} ${id.slice(12)}`;
