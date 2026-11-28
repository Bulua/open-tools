/**
 * 密码本后端 API 定义（统一经由 `requestBackend` 与 `unwrapApiResponse` 处理 `{ code, msg, data }`）。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type { VaultFile } from "@/types/vault";

export const vaultApi = {
  async read(): Promise<VaultFile> {
    const res = await requestBackend<ApiResponsePayload<VaultFile>>("vault_read");
    return unwrapApiResponse(res);
  },

  async write(data: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("vault_write", { data });
    unwrapApiResponse(res);
  },
};
