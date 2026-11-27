/**
 * 时钟后端 API 定义（统一经由 `requestBackend` 与 `unwrapApiResponse` 处理 `{ code, msg, data }`）。
 */
import { requestBackend, subscribeBackendEvent, unwrapApiResponse } from "@/api/common";
import type { CountdownItem } from "@/types/clock";
import type { ApiResponsePayload } from "@/types/common";

export const clockApi = {
  async list(): Promise<CountdownItem[]> {
    const res = await requestBackend<ApiResponsePayload<CountdownItem[]>>(
      "clock_list",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: [] }) },
    );
    return unwrapApiResponse(res);
  },

  async upsert(item: CountdownItem): Promise<CountdownItem[]> {
    const res = await requestBackend<ApiResponsePayload<CountdownItem[]>>(
      "clock_upsert",
      { item },
    );
    return unwrapApiResponse(res);
  },

  async remove(id: string): Promise<CountdownItem[]> {
    const res = await requestBackend<ApiResponsePayload<CountdownItem[]>>(
      "clock_delete",
      { id },
    );
    return unwrapApiResponse(res);
  },

  onChanged(handler: () => void): Promise<() => void> {
    return subscribeBackendEvent("clock-changed", handler);
  },
};
