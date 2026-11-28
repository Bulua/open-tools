/**
 * 笔记本后端 API 定义（统一经由 `requestBackend`、`unwrapApiResponse` 与 `subscribeBackendEvent` 处理通信）。
 */
import { requestBackend, subscribeBackendEvent, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type { NotebookSnapshotRaw } from "@/types/notebook";

export const notebookApi = {
  async read(): Promise<NotebookSnapshotRaw> {
    const res = await requestBackend<ApiResponsePayload<NotebookSnapshotRaw>>(
      "notebook_read",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: null }) },
    );
    return unwrapApiResponse(res);
  },

  async write(data: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("notebook_write", { data });
    unwrapApiResponse(res);
  },

  async saveImage(noteId: string, data: ArrayBuffer | Uint8Array): Promise<string> {
    const encodedNoteId = btoa(String.fromCharCode(...new TextEncoder().encode(noteId)));
    const res = await requestBackend<ApiResponsePayload<string>>("notebook_save_image", data, {
      headers: { "x-note-id": encodedNoteId },
    });
    return unwrapApiResponse(res);
  },

  readImage(id: string, name: string): Promise<ArrayBuffer> {
    return requestBackend<ArrayBuffer>("notebook_read_image", { id, name });
  },

  async reveal(id: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("notebook_reveal", { id });
    unwrapApiResponse(res);
  },

  onChanged(handler: () => void): Promise<() => void> {
    return subscribeBackendEvent("notebook-changed", handler);
  },
};
