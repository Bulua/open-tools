/**
 * 截图与贴图后端 API 定义（统一经由 `requestBackend`、`unwrapApiResponse` 与 `subscribeBackendEvent` 处理通信）。
 */
import { requestBackend, subscribeBackendEvent, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type {
  ScreenshotFinishInput,
  ScreenshotItem,
  ScreenshotTargets,
} from "@/types/screenshot";

export const screenshotApi = {
  async active(): Promise<string | null> {
    const res = await requestBackend<ApiResponsePayload<string | null>>(
      "screenshot_active",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: null }) },
    );
    return unwrapApiResponse(res);
  },

  async begin(): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("screenshot_begin");
    unwrapApiResponse(res);
  },

  async prepare(): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("screenshot_prepare");
    unwrapApiResponse(res);
  },

  async show(draftId: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("screenshot_show", { draftId });
    unwrapApiResponse(res);
  },

  async targets(draftId: string): Promise<ScreenshotTargets> {
    const res = await requestBackend<ApiResponsePayload<ScreenshotTargets>>(
      "screenshot_targets",
      { draftId },
    );
    return unwrapApiResponse(res);
  },

  async capture(draftId: string): Promise<string> {
    const res = await requestBackend<ApiResponsePayload<string>>("screenshot_capture", {
      draftId,
    });
    return unwrapApiResponse(res);
  },

  async finish(input: ScreenshotFinishInput): Promise<ScreenshotItem> {
    const res = await requestBackend<ApiResponsePayload<ScreenshotItem>>(
      "screenshot_finish",
      { ...input },
    );
    return unwrapApiResponse(res);
  },

  async cancel(draftId: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("screenshot_cancel", { draftId });
    unwrapApiResponse(res);
  },

  async list(): Promise<ScreenshotItem[]> {
    const res = await requestBackend<ApiResponsePayload<ScreenshotItem[]>>(
      "screenshot_list",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: [] }) },
    );
    return unwrapApiResponse(res);
  },

  async read(id: string): Promise<string> {
    const res = await requestBackend<ApiResponsePayload<string>>("screenshot_read", { id });
    return unwrapApiResponse(res);
  },

  async remove(id: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("screenshot_delete", { id });
    unwrapApiResponse(res);
  },

  async pin(id: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("screenshot_pin", { id });
    unwrapApiResponse(res);
  },

  async reveal(id: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("screenshot_reveal", { id });
    unwrapApiResponse(res);
  },

  onStart(handler: (draftId: string) => void): Promise<() => void> {
    return subscribeBackendEvent<string>("screenshot-start", handler);
  },

  onSaved(handler: (item: ScreenshotItem) => void): Promise<() => void> {
    return subscribeBackendEvent<ScreenshotItem>("screenshot-saved", handler);
  },
};
