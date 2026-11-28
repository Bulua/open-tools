/**
 * HTTP 请求历史后端 API 定义。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type { HttpHistoryRecord, HttpHistorySaveInput } from "@/types/http-client";

export const httpClientApi = {
  async listHistory(): Promise<HttpHistoryRecord[]> {
    const res = await requestBackend<ApiResponsePayload<HttpHistoryRecord[]>>(
      "http_history_list",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: [] }) },
    );
    return unwrapApiResponse(res);
  },

  async saveHistory(input: HttpHistorySaveInput): Promise<HttpHistoryRecord[]> {
    const res = await requestBackend<ApiResponsePayload<HttpHistoryRecord[]>>(
      "http_history_save",
      { input },
    );
    return unwrapApiResponse(res);
  },

  async importHistory(entries: HttpHistorySaveInput[]): Promise<HttpHistoryRecord[]> {
    const res = await requestBackend<ApiResponsePayload<HttpHistoryRecord[]>>(
      "http_history_import",
      { entries },
    );
    return unwrapApiResponse(res);
  },

  async deleteHistory(id: string): Promise<HttpHistoryRecord[]> {
    const res = await requestBackend<ApiResponsePayload<HttpHistoryRecord[]>>(
      "http_history_delete",
      { id },
    );
    return unwrapApiResponse(res);
  },

  async clearHistory(): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("http_history_clear");
    unwrapApiResponse(res);
  },
};
