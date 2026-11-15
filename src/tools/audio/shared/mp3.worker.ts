import { createEncoder } from "wasm-media-encoders";
import mp3WasmUrl from "wasm-media-encoders/wasm/mp3?url";

/** 在后台线程编码 MP3，长音频也不会让界面卡住 */
type Request = { channels: Float32Array[]; sampleRate: number; bitrate: 128 | 192 | 320 };

self.onmessage = async (e: MessageEvent<Request>) => {
  try {
    const { channels, sampleRate, bitrate } = e.data;
    const encoder = await createEncoder("audio/mpeg", mp3WasmUrl);
    encoder.configure({ channels: channels.length as 1 | 2, sampleRate, bitrate });
    const parts: Uint8Array[] = [];
    const chunk = sampleRate * 10;
    for (let i = 0; i < channels[0].length; i += chunk) {
      // encode 返回的数据会在下次调用时被覆盖，需要复制
      parts.push(encoder.encode(channels.map((c) => c.subarray(i, i + chunk))).slice());
    }
    parts.push(encoder.finalize().slice());
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      out.set(p, offset);
      offset += p.length;
    }
    self.postMessage({ ok: true, data: out }, { transfer: [out.buffer] });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
