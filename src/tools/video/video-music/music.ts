import {
  AudioSampleSink,
  AudioSampleSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableAudioCodec,
} from "mediabunny";
import { t } from "@/locales";
import { resample } from "@/tools/audio/shared/audio";
import { withChannels, type Pcm } from "@/tools/audio/shared/pcm";
import { AudioWriter, SAMPLE_RATE, StreamResampler, UNSUPPORTED_VIDEO, openInput, stereoPlanes } from "../shared/media";

/**
 * 给视频配乐：画面直接复制（不重新编码，画质无损），
 * 原声和音乐按各自的音量混合后重新编码为 AAC，输出 MP4。音乐可以循环，也可以只播放几次；超出视频长度的部分去掉。
 */

/** 循环播放，或播放的次数 */
export type MusicRepeat = "loop" | number;

export interface MusicOptions {
  /** 音乐音量，0～1 */
  musicVolume: number;
  /** 视频原声音量，0～1；0 表示去掉原声 */
  originalVolume: number;
  repeat: MusicRepeat;
  /** 视频结束时音乐还在播放，最后几秒逐渐变小 */
  fadeOut: boolean;
}

/** 结尾淡出的时长（秒） */
export const FADE_SECONDS = 2;

/** 音乐在视频里播放的区间（秒）：每播放一遍一段，超出视频的部分截掉 */
export function musicSegments(videoDuration: number, musicDuration: number, repeat: MusicRepeat): { start: number; end: number }[] {
  if (videoDuration <= 0 || musicDuration <= 0) return [];
  const times = repeat === "loop" ? Math.ceil(videoDuration / musicDuration) : repeat;
  const list = [];
  for (let i = 0; i < times; i++) {
    const start = i * musicDuration;
    if (start >= videoDuration) break;
    list.push({ start, end: Math.min(videoDuration, start + musicDuration) });
  }
  return list;
}

/** 音乐在视频的第 t 秒播放到哪里（秒）；这时已经播完时返回 null。用于预览时让音乐跟着视频走 */
export function musicTimeAt(t: number, musicDuration: number, repeat: MusicRepeat): number | null {
  if (musicDuration <= 0 || t < 0) return null;
  if (repeat !== "loop" && t >= repeat * musicDuration) return null;
  return t % musicDuration;
}

/** 按帧混音：原声乘音量，加上对应位置的音乐 */
export class MusicMixer {
  private readonly end: number;
  private readonly fadeFrom: number;

  constructor(
    private readonly music: [Float32Array, Float32Array],
    /** 视频总帧数 */
    private readonly total: number,
    private readonly o: MusicOptions,
  ) {
    const length = music[0].length;
    this.end = o.repeat === "loop" ? Infinity : o.repeat * length;
    // 结束时音乐还在播放才淡出
    const fadeFrames = Math.round(FADE_SECONDS * SAMPLE_RATE);
    this.fadeFrom = o.fadeOut && this.end > total ? Math.max(0, total - fadeFrames) : Infinity;
  }

  /** 混合从第 start 帧开始的一段原声（左右声道），返回新的数据 */
  mix(left: Float32Array, right: Float32Array, start: number): [Float32Array, Float32Array] {
    const n = left.length;
    const outL = new Float32Array(n);
    const outR = new Float32Array(n);
    const [ml, mr] = this.music;
    const length = ml.length;
    const fadeFrames = this.total - this.fadeFrom;
    for (let i = 0; i < n; i++) {
      const f = start + i;
      let l = left[i] * this.o.originalVolume;
      let r = right[i] * this.o.originalVolume;
      if (length && f < this.end) {
        let gain = this.o.musicVolume;
        if (f >= this.fadeFrom) gain *= Math.max(0, (this.total - f) / fadeFrames);
        const k = f % length;
        l += ml[k] * gain;
        r += mr[k] * gain;
      }
      outL[i] = Math.max(-1, Math.min(1, l));
      outR[i] = Math.max(-1, Math.min(1, r));
    }
    return [outL, outR];
  }
}

/** 音乐统一成 48 kHz 立体声 */
async function prepareMusic(music: Pcm): Promise<[Float32Array, Float32Array]> {
  const p = withChannels(await resample(music, SAMPLE_RATE), 2);
  return [p.channels[0], p.channels[1]];
}

/** 合成配乐后的视频（MP4） */
export async function addMusic(video: Blob, music: Pcm, o: MusicOptions, onProgress?: (p: number) => void): Promise<Uint8Array> {
  const input = openInput(video);
  try {
    if (!(await input.canRead().catch(() => false))) throw new Error(UNSUPPORTED_VIDEO());
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error(t("video.noVideoTrack"));
    const audioTrack = await input.getPrimaryAudioTrack();
    const tracks = audioTrack ? [videoTrack, audioTrack] : [videoTrack];
    const start = Math.max(0, await input.getFirstTimestamp(tracks));
    const duration = (await input.computeDuration(tracks)) - start;
    const total = Math.round(duration * SAMPLE_RATE);

    const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: 2, sampleRate: SAMPLE_RATE });
    if (!audioCodec) throw new Error(t("video.noAudioEncoder"));

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const videoSource = new EncodedVideoPacketSource((await videoTrack.getCodec())!);
    output.addVideoTrack(videoSource, { rotation: await videoTrack.getRotation() });
    const audioSource = new AudioSampleSource({ codec: audioCodec, quality: QUALITY_HIGH });
    output.addAudioTrack(audioSource);
    await output.start();

    const mixer = new MusicMixer(await prepareMusic(music), total, o);
    const writer = new AudioWriter(audioSource);
    const write = (l: Float32Array, r: Float32Array) => writer.write(...mixer.mix(l, r, writer.written));
    /** 没有原声的部分：只有音乐 */
    const fillUntil = async (frame: number) => {
      while (writer.written < frame) {
        const zeros = new Float32Array(Math.min(SAMPLE_RATE / 2, frame - writer.written));
        await write(zeros, zeros);
      }
    };

    const videoConfig = await videoTrack.getDecoderConfig();
    await Promise.all([
      // 画面：数据包直接复制，时间从 0 开始
      (async () => {
        let first = true;
        for await (const p of new EncodedPacketSink(videoTrack).packets()) {
          await videoSource.add(p.clone({ timestamp: p.timestamp - start }), first && videoConfig ? { decoderConfig: videoConfig } : undefined);
          first = false;
        }
      })(),
      // 声音：解码原声，统一成 48 kHz 立体声，和音乐混合
      (async () => {
        if (audioTrack && o.originalVolume > 0 && (await audioTrack.canDecode())) {
          const resampler = new StreamResampler(await audioTrack.getSampleRate());
          let first = true;
          for await (const a of new AudioSampleSink(audioTrack).samples()) {
            if (first) await fillUntil(Math.min(total, Math.round((a.timestamp - start) * SAMPLE_RATE)));
            first = false;
            const [left, right] = stereoPlanes(a);
            a.close();
            let [l, r] = resampler.push(left, right);
            const room = total - writer.written;
            if (room <= 0) break;
            if (l.length > room) [l, r] = [l.subarray(0, room), r.subarray(0, room)];
            await write(l, r);
            onProgress?.(writer.written / total);
          }
        }
        // 原声比画面短、没有原声或去掉原声：剩下的部分只有音乐
        while (writer.written < total) {
          await fillUntil(Math.min(total, writer.written + SAMPLE_RATE * 5));
          onProgress?.(writer.written / total);
        }
      })(),
    ]);
    await output.finalize();
    return new Uint8Array(output.target.buffer!);
  } finally {
    input.dispose();
  }
}
