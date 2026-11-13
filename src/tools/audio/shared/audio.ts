import { onBeforeUnmount, ref } from "vue";
import { t } from "@/locales";
import { encodeWav, withChannels, type Pcm } from "./pcm";

/**
 * 浏览器音频接口的封装：解码文件、统一采样率、编码导出、播放。
 */

let ctx: AudioContext | null = null;
export const audioContext = () => (ctx ??= new AudioContext());

/** 解码音频或视频文件中的声音 */
export async function decodeFile(file: Blob): Promise<Pcm> {
  try {
    const buffer = await audioContext().decodeAudioData(await file.arrayBuffer());
    return fromAudioBuffer(buffer);
  } catch {
    throw new Error(t("audio.decodeFailed"));
  }
}

export const fromAudioBuffer = (b: AudioBuffer): Pcm => ({
  sampleRate: b.sampleRate,
  channels: Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i).slice()),
});

export function toAudioBuffer(p: Pcm): AudioBuffer {
  const b = audioContext().createBuffer(p.channels.length, Math.max(1, p.channels[0].length), p.sampleRate);
  p.channels.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return b;
}

/** 重新采样到 sampleRate（拼接不同采样率的文件、MP3 不支持的采样率时使用） */
export async function resample(p: Pcm, sampleRate: number): Promise<Pcm> {
  if (p.sampleRate === sampleRate) return p;
  const frames = Math.ceil((p.channels[0].length * sampleRate) / p.sampleRate);
  const offline = new OfflineAudioContext(p.channels.length, Math.max(1, frames), sampleRate);
  const src = offline.createBufferSource();
  src.buffer = toAudioBuffer(p);
  src.connect(offline.destination);
  src.start();
  return fromAudioBuffer(await offline.startRendering());
}

// ---------- 导出 ----------

export type OutputFormat = "mp3" | "wav";
export type Mp3Quality = 128 | 192 | 320;

/** MP3 音质，显示名称见文案 audio.q128 等 */
export const QUALITIES: Mp3Quality[] = [128, 192, 320];

const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];

async function encodeMp3(p: Pcm, bitrate: Mp3Quality): Promise<Uint8Array> {
  // MP3 最多两个声道，只支持部分采样率
  let pcm = withChannels(p, Math.min(2, p.channels.length));
  if (!MP3_RATES.includes(pcm.sampleRate)) pcm = await resample(pcm, pcm.sampleRate > 44100 ? 48000 : 44100);
  const worker = new Worker(new URL("./mp3.worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ ok: boolean; data?: Uint8Array; error?: string }>) =>
        e.data.ok ? resolve(e.data.data!) : reject(new Error(t("audio.mp3FailedDetail", { error: e.data.error })));
      worker.onerror = () => reject(new Error(t("audio.mp3Failed")));
      worker.postMessage({ channels: pcm.channels, sampleRate: pcm.sampleRate, bitrate });
    });
  } finally {
    worker.terminate();
  }
}

export async function encodeAudio(p: Pcm, format: OutputFormat, quality: Mp3Quality = 192): Promise<Uint8Array> {
  return format === "mp3" ? encodeMp3(p, quality) : encodeWav(p);
}

/** a.m4a → a.mp3 */
export const outputName = (name: string, format: OutputFormat, suffix = "") => `${name.replace(/\.[^.]+$/, "") || "audio"}${suffix}.${format}`;

// ---------- 播放 ----------

/**
 * 播放器：一次只播放一段，记录当前位置。
 * play(pcm, from, to) 从 from 秒播放到 to 秒（不传则到结尾）。
 */
export function usePlayer() {
  const playing = ref(false);
  const position = ref(0);
  /** 正在播放的是哪一个（列表中用来区分） */
  const playingKey = ref<unknown>(null);
  let source: AudioBufferSourceNode | null = null;
  let gainNode: GainNode | null = null;
  let frame = 0;

  const stop = () => {
    cancelAnimationFrame(frame);
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // 已经停止
      }
    }
    source = null;
    playing.value = false;
    playingKey.value = null;
  };

  const play = async (p: Pcm, from = 0, to?: number, key: unknown = null, gain = 1) => {
    stop();
    const ac = audioContext();
    if (ac.state === "suspended") await ac.resume();
    source = ac.createBufferSource();
    source.buffer = toAudioBuffer(p);
    gainNode = ac.createGain();
    gainNode.gain.value = gain;
    source.connect(gainNode).connect(ac.destination);
    const end = to ?? p.channels[0].length / p.sampleRate;
    const startedAt = ac.currentTime;
    source.start(0, from, Math.max(0, end - from));
    source.onended = () => {
      stop();
      position.value = from;
    };
    playing.value = true;
    playingKey.value = key;
    const tick = () => {
      position.value = Math.min(end, from + (ac.currentTime - startedAt));
      frame = requestAnimationFrame(tick);
    };
    tick();
  };

  /** 播放时调整音量（预览音量效果） */
  const setGain = (g: number) => gainNode && (gainNode.gain.value = g);

  onBeforeUnmount(stop);
  return { playing, position, playingKey, play, stop, setGain };
}
