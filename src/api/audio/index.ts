/**
 * 音频（文字转语音）后端 API 定义。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type { TtsVoice } from "@/types/audio";
import type { ApiResponsePayload } from "@/types/common";

export const audioApi = {
  async listVoices(): Promise<TtsVoice[]> {
    const res = await requestBackend<ApiResponsePayload<TtsVoice[]>>("tts_voices", undefined, {
      fallback: () => ({ code: "ok", msg: "", data: [] }),
    });
    return unwrapApiResponse(res);
  },

  synthesize(text: string, voice: string, rate: number): Promise<ArrayBuffer> {
    return requestBackend<ArrayBuffer>("tts_synthesize", { text, voice, rate });
  },
};
