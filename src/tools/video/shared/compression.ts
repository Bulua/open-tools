import { BufferTarget, Conversion, Mp3OutputFormat, Mp4OutputFormat, Output } from "mediabunny";
import { t } from "@/locales";
import { ensureMp3, openInput, UNSUPPORTED_VIDEO } from "./media";

export type AudioCompressionFormat = "mp3" | "m4a";

export type CompressionOptions =
  | { mode: "audio"; format: AudioCompressionFormat; audioBitrate: number }
  | { mode: "video"; videoBitrate: number; audioBitrate: number; shortEdge: number };

export interface CompressionResult {
  data: Uint8Array;
  ext: AudioCompressionFormat | "mp4";
}

/** 限制短边、保持横竖方向；H.264 的输出尺寸取偶数。 */
export function compressedVideoSize(width: number, height: number, shortEdge: number) {
  const scale = shortEdge ? Math.min(1, shortEdge / Math.min(width, height)) : 1;
  const even = (value: number) => Math.max(2, Math.floor(value * scale / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** 明确重新编码主轨，确保即使输入和输出编码相同也应用所选码率。 */
export async function compressMedia(
  file: Blob,
  options: CompressionOptions,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<CompressionResult> {
  signal.throwIfAborted();
  const input = openInput(file);
  try {
    if (!(await input.canRead().catch(() => false))) throw new Error(UNSUPPORTED_VIDEO());
    const audio = await input.getPrimaryAudioTrack();
    const video = options.mode === "video" ? await input.getPrimaryVideoTrack() : null;
    if (options.mode === "audio" && !audio) throw new Error(t("video.compressNoAudio"));
    if (options.mode === "video" && !video) throw new Error(t("video.trimNoVideo"));

    const ext = options.mode === "audio" ? options.format : "mp4";
    if (ext === "mp3") await ensureMp3();
    const channels = audio ? Math.min(2, await audio.getNumberOfChannels()) : undefined;
    const sourceRate = ext === "mp3" ? await audio?.getSampleRate() : undefined;
    // MPEG-1 的常见采样率支持完整的 MP3 码率选项。
    const sampleRate = ext === "mp3" && sourceRate && ![32000, 44100, 48000].includes(sourceRate) ? 44100 : undefined;
    const dimensions = video && options.mode === "video"
      ? compressedVideoSize(await video.getDisplayWidth(), await video.getDisplayHeight(), options.shortEdge)
      : null;

    signal.throwIfAborted();
    const output = new Output({
      format: ext === "mp3" ? new Mp3OutputFormat() : new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      video: dimensions && options.mode === "video"
        ? { codec: "avc", ...dimensions, fit: "contain", bitrate: options.videoBitrate * 1000, forceTranscode: true }
        : { discard: true },
      audio: { codec: ext === "mp3" ? "mp3" : "aac", bitrate: options.audioBitrate * 1000, numberOfChannels: channels, sampleRate, forceTranscode: true },
      showWarnings: false,
    });
    const abort = () => void conversion.cancel().catch(() => undefined);
    if (signal.aborted) {
      await conversion.cancel().catch(() => undefined);
      signal.throwIfAborted();
    }
    if (!conversion.isValid || conversion.discardedTracks.some(({ reason }) => reason !== "discarded_by_user")) {
      throw new Error(t("video.compressCodecFailed"));
    }
    signal.addEventListener("abort", abort, { once: true });
    conversion.onProgress = onProgress;
    try {
      await conversion.execute();
    } finally {
      signal.removeEventListener("abort", abort);
    }
    signal.throwIfAborted();
    if (!output.target.buffer?.byteLength) throw new Error(t("video.compressCodecFailed"));
    return { data: new Uint8Array(output.target.buffer), ext };
  } finally {
    input.dispose();
  }
}
