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

  async listHistory(): Promise<string[]> {
    const res = await requestBackend<ApiResponsePayload<string[]>>(
      "id_card_history_list",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: [] }) },
    );
    return unwrapApiResponse(res);
  },

  async addHistory(idNumber: string): Promise<string[]> {
    const res = await requestBackend<ApiResponsePayload<string[]>>("id_card_history_add", {
      idNumber,
    });
    return unwrapApiResponse(res);
  },

  async importHistory(idNumbers: readonly string[]): Promise<string[]> {
    const res = await requestBackend<ApiResponsePayload<string[]>>("id_card_history_import", {
      idNumbers: [...idNumbers],
    });
    return unwrapApiResponse(res);
  },

  async deleteHistory(idNumber: string): Promise<string[]> {
    const res = await requestBackend<ApiResponsePayload<string[]>>("id_card_history_delete", {
      idNumber,
    });
    return unwrapApiResponse(res);
  },

  async clearHistory(): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("id_card_history_clear");
    unwrapApiResponse(res);
  },
};
