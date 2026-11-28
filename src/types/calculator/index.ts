/**
 * 计算器模块前后端通信类型定义。
 */

export type AngleUnit = "deg" | "rad";

export interface BackendEvalError {
  code: string;
  detail?: string;
  message: string;
}

export interface BackendEvalResult {
  ok: boolean;
  value?: number;
  formatted?: string;
  error?: BackendEvalError;
}

export interface CalculatorHistoryItem {
  id: string;
  expression: string;
  result: string;
  angleUnit: AngleUnit;
  createdAt: string;
}

export interface CalculatorHistoryImportItem {
  expression: string;
  result: string;
  angleUnit?: AngleUnit;
}
