/**
 * 大文件编辑器后端 API 定义（统一经由 `requestBackend`、`unwrapApiResponse` 与 `subscribeBackendEvent` 处理通信）。
 */
import { requestBackend, subscribeBackendEvent, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type {
  FileInfo,
  LargeFileEdit,
  LargeFileSaved,
  OpenedFile,
  SearchResult,
  TaskStatus,
  TextBlock,
} from "@/types/large-file";

export const largeFileApi = {
  async open(path: string, encoding: string): Promise<OpenedFile> {
    const res = await requestBackend<ApiResponsePayload<OpenedFile>>("large_text_open", {
      path,
      encoding,
    });
    return unwrapApiResponse(res);
  },

  async read(params: {
    id: string;
    revision: number;
    start: number;
    end?: number;
  }): Promise<TextBlock> {
    const res = await requestBackend<ApiResponsePayload<TextBlock>>("large_text_read", params);
    return unwrapApiResponse(res);
  },

  async edit(params: {
    id: string;
    revision: number;
    start: number;
    end: number;
    text: string;
    changes: LargeFileEdit[];
  }): Promise<FileInfo> {
    const res = await requestBackend<ApiResponsePayload<FileInfo>>("large_text_edit", params);
    return unwrapApiResponse(res);
  },

  async history(params: { id: string; revision: number; redo: boolean }): Promise<FileInfo> {
    const res = await requestBackend<ApiResponsePayload<FileInfo>>("large_text_history", params);
    return unwrapApiResponse(res);
  },

  async jump(params: { id: string; revision: number; line: number }): Promise<TextBlock> {
    const res = await requestBackend<ApiResponsePayload<TextBlock>>("large_text_jump", params);
    return unwrapApiResponse(res);
  },

  async search(params: {
    id: string;
    revision: number;
    start: number;
    query: string;
  }): Promise<SearchResult> {
    const res = await requestBackend<ApiResponsePayload<SearchResult>>(
      "large_text_search",
      params,
    );
    return unwrapApiResponse(res);
  },

  async save(params: { id: string; revision: number }): Promise<LargeFileSaved> {
    const res = await requestBackend<ApiResponsePayload<LargeFileSaved>>("large_text_save", params);
    return unwrapApiResponse(res);
  },

  async status(id: string): Promise<TaskStatus> {
    const res = await requestBackend<ApiResponsePayload<TaskStatus>>("large_text_status", { id });
    return unwrapApiResponse(res);
  },

  async pending(id: string, pending: boolean): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("large_text_pending", {
      id,
      pending,
    });
    unwrapApiResponse(res);
  },

  async cancel(id: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("large_text_cancel", { id });
    unwrapApiResponse(res);
  },

  async close(id: string, discard: boolean): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("large_text_close", {
      id,
      discard,
    });
    unwrapApiResponse(res);
  },

  async exit(code: number | null): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("large_text_exit", { code });
    unwrapApiResponse(res);
  },

  onExitRequested(handler: (code: number | null) => void): Promise<() => void> {
    return subscribeBackendEvent<number | null>("large-text-exit-requested", handler);
  },
};

export type LargeFileApi = typeof largeFileApi;
