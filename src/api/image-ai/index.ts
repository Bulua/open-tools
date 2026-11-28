/**
 * 图片 AI 模型与本地 ONNX 推理后端 API 定义。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type { AiModelProgress, AiSource, AiStatus, ModelInput } from "@/types/image-ai";

export const imageAiApi = {
  async status(): Promise<AiStatus> {
    const res = await requestBackend<ApiResponsePayload<AiStatus>>("ai_status", undefined, {
      fallback: () => ({
        code: "ok",
        msg: "",
        data: { models: [], runtimeReady: false, runtimeSize: 0, dir: "" },
      }),
    });
    return unwrapApiResponse(res);
  },

  async download(id: string, source: AiSource): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("ai_model_download", {
      id,
      source: source === "auto" ? null : source,
    });
    unwrapApiResponse(res);
  },

  async progress(id: string): Promise<AiModelProgress> {
    const res = await requestBackend<ApiResponsePayload<AiModelProgress>>(
      "ai_model_progress",
      { id },
      { fallback: () => ({ code: "ok", msg: "", data: { done: 0, total: 0 } }) },
    );
    return unwrapApiResponse(res);
  },

  async remove(id: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("ai_model_delete", { id });
    unwrapApiResponse(res);
  },

  runRaw(id: string, inputs: ModelInput[]): Promise<ArrayBuffer> {
    const body = new Uint8Array(inputs.reduce((n, item) => n + item.data.byteLength, 0));
    let offset = 0;
    for (const { data } of inputs) {
      body.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), offset);
      offset += data.byteLength;
    }
    const headers = {
      "x-model": id,
      "x-shape": inputs.map((item) => item.shape.join(",")).join(";"),
      "x-dtype": inputs[0]?.data instanceof Uint8Array ? "u8" : "f32",
    };
    return requestBackend<ArrayBuffer>("ai_run", body, { headers });
  },
};
