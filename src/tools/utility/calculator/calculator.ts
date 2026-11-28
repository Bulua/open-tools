/**
 * 计算器前端类型与后端求值调用封装。
 * 表达式解析与浮点消噪格式化统一由 Rust 后端维护，供界面与 AI 工具共用。
 */
import { calculatorApi } from "@/api/calculator";
import { t as i18n } from "@/locales";
import type { AngleUnit, BackendEvalError, BackendEvalResult } from "@/types/calculator";

export type { AngleUnit, BackendEvalError, BackendEvalResult };

export type LiveEval =
  | { ok: true; text: string }
  | { ok: false; text: string };

function localizeError(err?: BackendEvalError): string {
  if (!err) return i18n("utility.invalidResult");
  switch (err.code) {
    case "unknownName":
      return i18n("utility.unknownName", { name: err.detail ?? "" });
    case "unknownSymbol":
      return i18n("utility.unknownSymbol", { ch: err.detail ?? "" });
    case "badNumber":
    case "factorial":
    case "needExpr":
    case "divZero":
    case "incomplete":
    case "negSqrt":
    case "parenMismatch":
    case "extraContent":
    case "invalidResult":
      return i18n(`utility.${err.code}`);
    default:
      return err.message;
  }
}

/** 调用 Rust 后端求值并返回可直接展示的本地化结果或错误文案 */
export async function evaluateExpression(expression: string, angle: AngleUnit = "deg"): Promise<LiveEval> {
  if (!expression.trim()) return { ok: true, text: "" };
  const res = await calculatorApi.evaluate(expression, angle);
  if (res.ok) return { ok: true, text: res.formatted ?? "" };
  return { ok: false, text: localizeError(res.error) };
}
