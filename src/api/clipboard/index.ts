/**
 * 剪贴板历史后端 API 定义（统一经由 `requestBackend` 与 `unwrapApiResponse` 处理 `{ code, msg, data }`）。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type { ClipboardSnapshot, ClipboardUpdate } from "@/types/clipboard";

export const clipboardApi = {
  async list(query: string): Promise<ClipboardSnapshot> {
    const res = await requestBackend<ApiResponsePayload<ClipboardSnapshot>>(
      "clipboard_history_list",
      { query },
    );
    return unwrapApiResponse(res);
  },

  async update(action: ClipboardUpdate): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>(
      "clipboard_history_update",
      { action },
    );
    unwrapApiResponse(res);
  },

  async copy(id: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>(
      "clipboard_history_copy",
      { id },
    );
    unwrapApiResponse(res);
  },

  async open(): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("clipboard_history_open");
    unwrapApiResponse(res);
  },

  async copyPrivate(text: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>(
      "clipboard_copy_private",
      { text },
    );
    unwrapApiResponse(res);
  },
};
