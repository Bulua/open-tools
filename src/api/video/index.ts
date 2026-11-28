/**
 * 视频下载与录屏 HDR 控制后端 API 定义。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type { DownloadPlatform, DouyinCaptureKind } from "@/types/video";

export const videoApi = {
  async captureDouyin(id: string, kind: DouyinCaptureKind): Promise<string> {
    const res = await requestBackend<ApiResponsePayload<string>>("douyin_capture", { id, kind });
    return unwrapApiResponse(res);
  },

  async captureXiaohongshu(url: string): Promise<string> {
    const res = await requestBackend<ApiResponsePayload<string>>("xiaohongshu_capture", { url });
    return unwrapApiResponse(res);
  },

  async downloadDir(platform: DownloadPlatform): Promise<string> {
    const res = await requestBackend<ApiResponsePayload<string>>("video_download_dir", {
      platform,
    });
    return unwrapApiResponse(res);
  },

  async hdrEnabled(): Promise<boolean> {
    const res = await requestBackend<ApiResponsePayload<boolean>>("hdr_enabled", undefined, {
      fallback: () => ({ code: "ok", msg: "", data: false }),
    });
    return unwrapApiResponse(res);
  },

  async hdrDisable(): Promise<number> {
    const res = await requestBackend<ApiResponsePayload<number>>("hdr_disable", undefined, {
      fallback: () => ({ code: "ok", msg: "", data: 0 }),
    });
    return unwrapApiResponse(res);
  },

  async hdrRestore(): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("hdr_restore", undefined, {
      fallback: () => ({ code: "ok", msg: "", data: null }),
    });
    unwrapApiResponse(res);
  },
};
