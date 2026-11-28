/**
 * 网络实用工具（Ping、局域网 IP）后端 API 定义。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";

export const networkApi = {
  async pingOnce(host: string, timeoutMs: number): Promise<string> {
    const res = await requestBackend<ApiResponsePayload<string>>("ping_once", {
      host,
      timeoutMs,
    });
    return unwrapApiResponse(res);
  },

  async localIp(): Promise<string | null> {
    const res = await requestBackend<ApiResponsePayload<string | null>>("local_ip", undefined, {
      fallback: () => ({ code: "ok", msg: "", data: null }),
    });
    return unwrapApiResponse(res);
  },
};
