/**
 * 应用系统级基础能力（远程图标、桌面通知、系统托盘文案）后端 API 定义。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type { BrandingActivatePayload, TrayTextPayload } from "@/types/system";

export const systemApi = {
  async brandingCurrent(): Promise<string | null> {
    const res = await requestBackend<ApiResponsePayload<string | null>>(
      "branding_current",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: null }) },
    );
    return unwrapApiResponse(res);
  },

  brandingLogo(): Promise<ArrayBuffer> {
    return requestBackend<ArrayBuffer>("branding_logo", undefined, {
      fallback: () => new ArrayBuffer(0),
    });
  },

  async brandingActivate(payload: BrandingActivatePayload): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("branding_activate", { ...payload });
    unwrapApiResponse(res);
  },

  async desktopNotify(title: string, body: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("desktop_notify", { title, body });
    unwrapApiResponse(res);
  },

  async setTrayText(payload: TrayTextPayload): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>(
      "set_tray_text",
      { ...payload },
      { fallback: () => ({ code: "ok", msg: "", data: null }) },
    );
    unwrapApiResponse(res);
  },
};
