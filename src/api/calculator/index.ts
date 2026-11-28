/**
 * 科学计算器后端求值与历史记录 API 定义。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type {
  AngleUnit,
  BackendEvalResult,
  CalculatorHistoryImportItem,
  CalculatorHistoryItem,
} from "@/types/calculator";
import type { ApiResponsePayload } from "@/types/common";

export const calculatorApi = {
  async evaluate(expression: string, angle: AngleUnit = "deg"): Promise<BackendEvalResult> {
    const res = await requestBackend<ApiResponsePayload<BackendEvalResult>>("calculator_eval", {
      expression,
      angle,
    });
    return unwrapApiResponse(res);
  },

  async listHistory(): Promise<CalculatorHistoryItem[]> {
    const res = await requestBackend<ApiResponsePayload<CalculatorHistoryItem[]>>(
      "calculator_history_list",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: [] }) },
    );
    return unwrapApiResponse(res);
  },

  async addHistory(
    expression: string,
    result: string,
    angleUnit: AngleUnit,
  ): Promise<CalculatorHistoryItem[]> {
    const res = await requestBackend<ApiResponsePayload<CalculatorHistoryItem[]>>(
      "calculator_history_add",
      { expression, result, angleUnit },
    );
    return unwrapApiResponse(res);
  },

  async importHistory(
    items: CalculatorHistoryImportItem[],
  ): Promise<CalculatorHistoryItem[]> {
    const res = await requestBackend<ApiResponsePayload<CalculatorHistoryItem[]>>(
      "calculator_history_import",
      { items },
    );
    return unwrapApiResponse(res);
  },

  async deleteHistory(id: string): Promise<CalculatorHistoryItem[]> {
    const res = await requestBackend<ApiResponsePayload<CalculatorHistoryItem[]>>(
      "calculator_history_delete",
      { id },
    );
    return unwrapApiResponse(res);
  },

  async clearHistory(): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("calculator_history_clear");
    unwrapApiResponse(res);
  },
};
