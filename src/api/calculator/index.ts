/**
 * 科学计算器后端求值 API 定义。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type { AngleUnit, BackendEvalResult } from "@/types/calculator";
import type { ApiResponsePayload } from "@/types/common";

export const calculatorApi = {
  async evaluate(expression: string, angle: AngleUnit = "deg"): Promise<BackendEvalResult> {
    const res = await requestBackend<ApiResponsePayload<BackendEvalResult>>("calculator_eval", {
      expression,
      angle,
    });
    return unwrapApiResponse(res);
  },
};
