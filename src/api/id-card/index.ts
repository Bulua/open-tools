/**
 * 身份证号解析后端 API 定义。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type { IdParseResult } from "@/types/id-card";

export const idCardApi = {
  async parse(inputs: readonly string[]): Promise<IdParseResult[]> {
    const res = await requestBackend<ApiResponsePayload<IdParseResult[]>>("id_card_parse", {
      inputs: [...inputs],
    });
    return unwrapApiResponse(res);
  },
};
