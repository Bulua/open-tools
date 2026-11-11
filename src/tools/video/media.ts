import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  Conversion,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  FlacOutputFormat,
  Input,
  Mp3OutputFormat,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  VideoSampleSink,
  VideoSampleSource,
  WavOutputFormat,
  canEncodeAudio,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type InputAudioTrack,
  type InputVideoTrack,
  type OutputFormat,
  type Rotation,
} from "mediabunny";
import { t } from "@/locales";

/**
 * 视频处理（基于 Mediabunny，使用浏览器自带的 WebCodecs 硬件编解码，不上传文件）：
 * - 读取视频信息
 * - 提取音频：可以直接复制原始音轨（不重新编码，最快、无损），也可以转成 MP3、M4A、WAV
 * - 拼接：格式完全相同的视频直接拼接（不重新编码）；否则统一画面大小重新编码为 MP4（H.264 + AAC）
 *
 * 文件按需读取，不会一次读进内存，几 GB 的视频也可以处理；输出文件保存在内存中。
 */

export const VIDEO_ACCEPT = "video/*,.mp4,.mov,.m4v,.mkv,.webm,.ts,.mts,.m2ts";
/** 无法读取视频时的提示 */
const UNSUPPORTED = () => t("video.unsupported");

export const UNSUPPORTED_VIDEO = UNSUPPORTED;
export const openInput = (file: Blob) => new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

export interface VideoInfo {
  /** 时长（秒） */
  duration: number;
  /** 第一帧的时间，拼接时从这里开始算 */
  start: number;
  width: number;
  height: number;
  rotation: Rotation;
  videoCodec: string | null;
  audio: { codec: string | null; sampleRate: number; channels: number } | null;
}

export async function probeVideo(file: Blob): Promise<VideoInfo> {
  const input = openInput(file);
  try {
    if (!(await input.canRead().catch(() => false))) throw new Error(UNSUPPORTED());
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const tracks = [video, audio].filter((t): t is InputVideoTrack | InputAudioTrack => !!t);
    if (!tracks.length) throw new Error(t("video.noTracks"));
    const start = Math.max(0, await input.getFirstTimestamp(tracks));
    const end = await input.computeDuration(tracks);
    return {
      duration: Math.max(0, end - start),
      start,
      width: video ? await video.getDisplayWidth() : 0,
      height: video ? await video.getDisplayHeight() : 0,
      rotation: video ? await video.getRotation() : 0,
      videoCodec: video ? await video.getCodec() : null,
      audio: audio ? { codec: await audio.getCodec(), sampleRate: await audio.getSampleRate(), channels: await audio.getNumberOfChannels() } : null,
    };
  } finally {
    input.dispose();
  }
}

const CODEC_NAMES: Record<string, string> = { avc: "H.264", hevc: "H.265", vp8: "VP8", vp9: "VP9", av1: "AV1", prores: "ProRes", aac: "AAC", opus: "Opus", mp3: "MP3", vorbis: "Vorbis", flac: "FLAC", ac3: "AC-3", eac3: "E-AC-3" };
export const codecName = (codec: string | null | undefined) => (codec ? (CODEC_NAMES[codec] ?? (codec.startsWith("pcm") ? "PCM" : codec.toUpperCase())) : t("video.unknown"));

// ---------- 提取音频 ----------

export type AudioTarget = "original" | "mp3" | "m4a" | "wav";

let mp3Ready: Promise<void> | null = null;
/** 浏览器不能编码 MP3，注册 LAME 编码器（只注册一次；编码器较大，用到时才载入） */
export const ensureMp3 = () =>
  (mp3Ready ??= canEncodeAudio("mp3").then(async (ok) => {
    if (!ok) (await import("@mediabunny/mp3-encoder")).registerMp3Encoder();
  }));

/** 原始音轨放进哪种文件：AAC → M4A，Opus/Vorbis → OGG，MP3、FLAC、PCM 保持原格式；其他（AC-3 等）转成 M4A */
function originalTarget(codec: AudioCodec | null): { format: OutputFormat; ext: string; codec?: AudioCodec } {
  if (codec === "aac") return { format: new Mp4OutputFormat({ fastStart: "in-memory" }), ext: "m4a" };
  if (codec === "mp3") return { format: new Mp3OutputFormat(), ext: "mp3" };
  if (codec === "opus" || codec === "vorbis") return { format: new OggOutputFormat(), ext: "ogg" };
  if (codec === "flac") return { format: new FlacOutputFormat(), ext: "flac" };
  if (codec?.startsWith("pcm") || codec === "ulaw" || codec === "alaw") return { format: new WavOutputFormat(), ext: "wav" };
  return { format: new Mp4OutputFormat({ fastStart: "in-memory" }), ext: "m4a", codec: "aac" };
}

export interface ExtractResult {
  data: Uint8Array;
  ext: string;
  /** 直接复制了原始音轨，没有重新编码 */
  copied: boolean;
}

/** 从视频中提取声音；bitrate 是 MP3 / M4A 的码率（kbps） */
export async function extractAudio(file: Blob, target: AudioTarget, bitrate: number, onProgress?: (p: number) => void): Promise<ExtractResult> {
  const input = openInput(file);
  try {
    if (!(await input.canRead().catch(() => false))) throw new Error(UNSUPPORTED());
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error(t("video.noAudio"));
    const source = await track.getCodec();

    let format: OutputFormat;
    let ext: string;
    let codec: AudioCodec | undefined;
    if (target === "original") ({ format, ext, codec } = originalTarget(source));
    else if (target === "mp3") {
      await ensureMp3();
      [format, ext, codec] = [new Mp3OutputFormat(), "mp3", "mp3"];
    } else if (target === "m4a") [format, ext, codec] = [new Mp4OutputFormat({ fastStart: "in-memory" }), "m4a", "aac"];
    else [format, ext, codec] = [new WavOutputFormat(), "wav", "pcm-s16"];

    const output = new Output({ format, target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      video: { discard: true },
      // 码率只在需要重新编码时生效；格式相同时直接复制
      audio: { codec, bitrate: codec === "mp3" || codec === "aac" ? bitrate * 1000 : undefined },
      showWarnings: false,
    });
    if (!conversion.isValid) {
      const reason = conversion.discardedTracks[0]?.reason;
      throw new Error(reason === "undecodable_source_codec" ? t("video.cantDecodeAudio", { codec: codecName(source) }) : t("video.cantConvertAudio"));
    }
    conversion.onProgress = (p) => onProgress?.(p);
    await conversion.execute();
    const copied = target === "original" ? !codec : codec === source && target !== "wav";
    return { data: new Uint8Array(output.target.buffer!), ext, copied };
  } finally {
    input.dispose();
  }
}

// ---------- 拼接 ----------

export type ConcatQuality = "medium" | "high" | "very-high";
const QUALITY = { medium: QUALITY_MEDIUM, high: QUALITY_HIGH, "very-high": QUALITY_VERY_HIGH };

export interface ConcatOptions {
  /** 输出画面大小；不同大小的视频按比例缩放、居中，空白处填黑色 */
  width: number;
  height: number;
  quality: ConcatQuality;
  /** 格式相同时也重新编码 */
  forceReencode?: boolean;
}

export interface ConcatResult {
  data: Uint8Array;
  /** 直接拼接，没有重新编码 */
  copied: boolean;
}

/** 解码参数的指纹：完全相同的视频才能直接拼接 */
async function configKey(track: InputVideoTrack | InputAudioTrack | null) {
  if (!track) return "none";
  const config = await track.getDecoderConfig();
  if (!config) return "unknown";
  const d = config.description;
  const desc = d ? Array.from(ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d)).join(",") : "";
  const extra = track.isVideoTrack()
    ? `${await track.getCodedWidth()}x${await track.getCodedHeight()}:${await track.getRotation()}`
    : `${await (track as InputAudioTrack).getSampleRate()}:${await (track as InputAudioTrack).getNumberOfChannels()}`;
  return `${config.codec}|${extra}|${desc}`;
}

interface Clip {
  input: Input;
  video: InputVideoTrack;
  audio: InputAudioTrack | null;
  start: number;
  duration: number;
}

async function openClips(files: Blob[]): Promise<Clip[]> {
  const clips: Clip[] = [];
  try {
    for (const [i, file] of files.entries()) {
      const input = openInput(file);
      clips.push({ input } as Clip);
      if (!(await input.canRead().catch(() => false))) throw new Error(t("video.nthUnsupported", { n: i + 1, error: UNSUPPORTED() }));
      const video = await input.getPrimaryVideoTrack();
      if (!video) throw new Error(t("video.nthNoVideo", { n: i + 1 }));
      const audio = await input.getPrimaryAudioTrack();
      const tracks = audio ? [video, audio] : [video];
      const start = Math.max(0, await input.getFirstTimestamp(tracks));
      Object.assign(clips[i], { video, audio, start, duration: (await input.computeDuration(tracks)) - start });
    }
    return clips;
  } catch (e) {
    clips.forEach((c) => c.input.dispose());
    throw e;
  }
}

/** 是否可以直接拼接：画面、声音的编码参数完全相同 */
export async function canCopyConcat(files: Blob[]): Promise<boolean> {
  if (files.length < 2) return false;
  const clips = await openClips(files);
  try {
    return await sameFormat(clips);
  } finally {
    clips.forEach((c) => c.input.dispose());
  }
}

async function sameFormat(clips: Clip[]) {
  const keys = await Promise.all(clips.map(async (c) => `${await configKey(c.video)}#${await configKey(c.audio)}`));
  return keys.every((k) => k === keys[0] && !k.includes("unknown"));
}

export async function concatVideos(files: Blob[], options: ConcatOptions, onProgress?: (p: number) => void): Promise<ConcatResult> {
  if (files.length < 2) throw new Error(t("video.needTwo"));
  const clips = await openClips(files);
  try {
    const total = clips.reduce((s, c) => s + c.duration, 0) || 1;
    const copy = !options.forceReencode && (await sameFormat(clips));
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    if (copy) await copyClips(clips, output, total, onProgress);
    else await reencodeClips(clips, output, options, total, onProgress);
    return { data: new Uint8Array(output.target.buffer!), copied: copy };
  } finally {
    clips.forEach((c) => c.input.dispose());
  }
}

/** 直接拼接：把各个视频的数据包按顺序接起来，时间戳依次后移 */
async function copyClips(clips: Clip[], output: Output<Mp4OutputFormat, BufferTarget>, total: number, onProgress?: (p: number) => void) {
  const first = clips[0];
  const videoSource = new EncodedVideoPacketSource((await first.video.getCodec())!);
  output.addVideoTrack(videoSource, { rotation: await first.video.getRotation() });
  const audioSource = first.audio ? new EncodedAudioPacketSource((await first.audio.getCodec())!) : null;
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();

  let offset = 0;
  for (const [i, clip] of clips.entries()) {
    const shift = offset - clip.start;
    const videoConfig = i === 0 ? await clip.video.getDecoderConfig() : null;
    const audioConfig = i === 0 && clip.audio ? await clip.audio.getDecoderConfig() : null;
    const done = offset;
    await Promise.all([
      (async () => {
        let firstPacket = true;
        for await (const p of new EncodedPacketSink(clip.video).packets()) {
          await videoSource.add(p.clone({ timestamp: p.timestamp + shift }), firstPacket && videoConfig ? { decoderConfig: videoConfig } : undefined);
          firstPacket = false;
          onProgress?.(Math.min(1, (done + p.timestamp - clip.start) / total));
        }
      })(),
      (async () => {
        if (!clip.audio || !audioSource) return;
        let firstPacket = true;
        for await (const p of new EncodedPacketSink(clip.audio).packets()) {
          await audioSource.add(p.clone({ timestamp: p.timestamp + shift }), firstPacket && audioConfig ? { decoderConfig: audioConfig } : undefined);
          firstPacket = false;
        }
      })(),
    ]);
    offset += clip.duration;
  }
  await output.finalize();
}

export const SAMPLE_RATE = 48000;
const CHANNELS = 2;

/** 重新编码：画面统一缩放到输出大小，声音统一为 48 kHz 立体声；没有声音的视频补上静音，保持声画同步 */
async function reencodeClips(clips: Clip[], output: Output<Mp4OutputFormat, BufferTarget>, o: ConcatOptions, total: number, onProgress?: (p: number) => void) {
  const width = o.width - (o.width % 2);
  const height = o.height - (o.height % 2);
  const videoCodec = await getFirstEncodableVideoCodec(["avc", "hevc", "vp9", "av1"], { width, height });
  const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: CHANNELS, sampleRate: SAMPLE_RATE });
  if (!videoCodec) throw new Error(t("video.noVideoEncoder"));
  if (!audioCodec) throw new Error(t("video.noAudioEncoder"));

  const quality = QUALITY[o.quality];
  const videoSource = new VideoSampleSource({ codec: videoCodec, quality, transform: { width, height, fit: "contain" }, sizeChangeBehavior: "contain" });
  // 各段声音的采样率、声道数可能不同，编码器要求输入一致：先自己统一成 48 kHz 立体声再交给编码器
  const audioSource = new AudioSampleSource({ codec: audioCodec, quality });
  const writer = new AudioWriter(audioSource);
  output.addVideoTrack(videoSource);
  output.addAudioTrack(audioSource);
  await output.start();

  let offset = 0;
  for (const clip of clips) {
    const end = offset + clip.duration;
    const shift = offset - clip.start;
    await Promise.all([
      (async () => {
        for await (const s of new VideoSampleSink(clip.video).samples()) {
          const t = s.timestamp + shift;
          if (t < end) {
            s.setTimestamp(t);
            if (t + s.duration > end) s.setDuration(end - t);
            await videoSource.add(s);
            onProgress?.(Math.min(1, t / total));
          }
          s.close();
        }
      })(),
      (async () => {
        const endFrame = Math.round(end * SAMPLE_RATE);
        if (clip.audio && (await clip.audio.canDecode())) {
          const resampler = new StreamResampler(await clip.audio.getSampleRate());
          let first = true;
          for await (const a of new AudioSampleSink(clip.audio).samples()) {
            // 声音比画面晚开始时，前面补静音
            if (first) await writer.silenceUntil(Math.min(endFrame, Math.round((a.timestamp + shift) * SAMPLE_RATE)));
            first = false;
            const [left, right] = stereoPlanes(a);
            a.close();
            let [l, r] = resampler.push(left, right);
            // 超出本段的部分去掉（声音比画面长）
            const room = endFrame - writer.written;
            if (room <= 0) break;
            if (l.length > room) [l, r] = [l.subarray(0, room), r.subarray(0, room)];
            await writer.write(l, r);
          }
        }
        // 没有声音、或者声音比画面短：补静音到本段结尾，保持声画同步
        await writer.silenceUntil(endFrame);
      })(),
    ]);
    offset = end;
  }
  await output.finalize();
}

/** 一段声音的左右声道（单声道复制到两边，多声道取前两个） */
export function stereoPlanes(a: AudioSample): [Float32Array, Float32Array] {
  const read = (plane: number) => {
    const buf = new Float32Array(a.numberOfFrames);
    a.copyTo(buf, { planeIndex: plane, format: "f32-planar" });
    return buf;
  };
  const left = read(0);
  return [left, a.numberOfChannels > 1 ? read(1) : left];
}

/**
 * 流式重新采样（线性插值）：一块一块地输入，输出连续、不丢帧。
 * pos 是下一个输出帧在当前输入块中的位置，可以是 -1～0 之间（落在上一块的最后一帧和这一块的第一帧之间）
 */
export class StreamResampler {
  private pos = 0;
  private prev: [number, number] = [0, 0];
  private readonly step: number;

  constructor(inputRate: number, outputRate = SAMPLE_RATE) {
    this.step = inputRate / outputRate;
  }

  push(left: Float32Array, right: Float32Array): [Float32Array, Float32Array] {
    const n = left.length;
    if (!n) return [new Float32Array(0), new Float32Array(0)];
    const count = Math.max(0, Math.ceil((n - 1 - this.pos) / this.step));
    const outL = new Float32Array(count);
    const outR = new Float32Array(count);
    let pos = this.pos;
    for (let k = 0; k < count; k++, pos += this.step) {
      const i = Math.floor(pos);
      const f = pos - i;
      const l0 = i < 0 ? this.prev[0] : left[i];
      const r0 = i < 0 ? this.prev[1] : right[i];
      outL[k] = l0 + (left[i + 1] - l0) * f;
      outR[k] = r0 + (right[i + 1] - r0) * f;
    }
    this.pos = pos - n;
    this.prev = [left[n - 1], right[n - 1]];
    return [outL, outR];
  }
}

/** 按帧写入 48 kHz 立体声：时间戳由已写入的帧数决定，前后严格衔接 */
export class AudioWriter {
  written = 0;
  constructor(private source: AudioSampleSource) {}

  async write(left: Float32Array, right: Float32Array) {
    const n = left.length;
    if (!n) return;
    const data = new Float32Array(n * CHANNELS);
    data.set(left, 0);
    data.set(right, n);
    const sample = new AudioSample({ data, format: "f32-planar", numberOfChannels: CHANNELS, sampleRate: SAMPLE_RATE, timestamp: this.written / SAMPLE_RATE });
    await this.source.add(sample);
    sample.close();
    this.written += n;
  }

  /** 补静音直到第 frame 帧 */
  async silenceUntil(frame: number) {
    while (this.written < frame) {
      const n = Math.min(SAMPLE_RATE / 2, frame - this.written);
      const zeros = new Float32Array(n);
      await this.write(zeros, zeros);
    }
  }
}

// ---------- 裁剪 ----------

export interface TrimOptions {
  /** 保留的时间段（秒，相对视频开头） */
  start: number;
  end: number;
  /** 保留的画面区域（显示像素，宽高为偶数）；不裁画面时为 null */
  crop: { left: number; top: number; width: number; height: number } | null;
  /** 精确到帧：重新编码；否则直接复制，从开始时间前最近的关键帧开始 */
  precise: boolean;
  quality: ConcatQuality;
}

export interface TrimResult {
  data: Uint8Array;
  /** 直接复制，没有重新编码 */
  copied: boolean;
}

/**
 * 裁剪视频，输出 MP4。只裁时长且不要求精确时直接复制音视频数据（快、无损），
 * 开头会对齐到最近的关键帧，可能比所选时间多一点；裁画面或要求精确时重新编码。
 * 传入 signal 可以中途取消。
 */
export async function trimVideo(file: Blob, o: TrimOptions, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<TrimResult> {
  const input = openInput(file);
  try {
    if (!(await input.canRead().catch(() => false))) throw new Error(UNSUPPORTED());
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error(t("video.trimNoVideo"));
    const audio = await input.getPrimaryAudioTrack();
    const first = Math.max(0, await input.getFirstTimestamp(audio ? [video, audio] : [video]));
    const copy = !o.crop && !o.precise;
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      trim: { start: first + o.start, end: first + o.end },
      video: { crop: o.crop ?? undefined, bitrate: QUALITY[o.quality], forceTranscode: !copy },
      audio: { bitrate: QUALITY[o.quality], forceTranscode: !copy },
      copy: copy ? {} : false,
      showWarnings: false,
    });
    if (!conversion.isValid) {
      const reason = conversion.discardedTracks.find((d) => d.track.isVideoTrack())?.reason;
      throw new Error(reason === "undecodable_source_codec" ? t("video.trimCantDecode", { codec: codecName(await video.getCodec()) }) : t("video.trimFailed"));
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const abort = () => void conversion.cancel();
    signal?.addEventListener("abort", abort);
    conversion.onProgress = (p) => onProgress?.(p);
    try {
      await conversion.execute();
    } finally {
      signal?.removeEventListener("abort", abort);
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return { data: new Uint8Array(output.target.buffer!), copied: copy };
  } finally {
    input.dispose();
  }
}

/** 时长显示：1:05、1:02:03 */
export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
