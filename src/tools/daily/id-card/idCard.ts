/**
 * 身份证号解析前端类型与界面辅助函数。
 * 核心 GB 11643 校验解析与 GB/T 2260 行政区划码表统一由 Rust 后端维护，供界面与 AI 工具共用。
 */
import { idCardApi } from "@/api/id-card";
import type {
  Birth,
  IdChecks,
  IdError,
  IdInfo,
  IdParseResult,
  Region,
  StarId,
  ZodiacId,
} from "@/types/id-card";

export type {
  Birth,
  IdChecks,
  IdError,
  IdInfo,
  IdParseResult,
  Region,
  StarId,
  ZodiacId,
};

/** 调用 Rust 后端批量解析身份证号 */
export async function parseIdCards(inputs: readonly string[]): Promise<IdParseResult[]> {
  if (inputs.length === 0) return [];
  return idCardApi.parse(inputs);
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
