import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from "mediabunny";
import { decodeFile } from "./audio";
import { peaks as pcmPeaks, duration as pcmDuration } from "./pcm";

/**
 * 音轨波形：把整段声音分成 BUCKETS 段，记录每段的最大、最小值。
 * 用 Mediabunny 一块一块地解码，边读边更新，几 GB 的视频也不会占满内存；
 * Mediabunny 读不了的格式（如 WMA）改用浏览器整体解码。
 */
export interface Peaks {
  min: Float32Array;
  max: Float32Array;
  /** 时长（秒） */
  duration: number;
  /** 已读完 */
  done: boolean;
  /** 每次更新加一，用来通知界面重画 */
  version: number;
}

const BUCKETS = 2000;

/** 同一个文件只读一次；读取中再次请求时，也能收到后续的进度 */
const cache = new WeakMap<Blob, { task: Promise<Peaks>; current: Peaks | null; listeners: Set<(p: Peaks) => void> }>();

/**
 * 读取波形。onUpdate 在读取过程中多次调用（同一个对象，version 递增），可以先显示读到的部分。
 * 同一个文件重复调用时共用同一次读取。
 */
export function readPeaks(blob: Blob, onUpdate?: (p: Peaks) => void): Promise<Peaks> {
  let entry = cache.get(blob);
  if (!entry) {
    const e = { task: null as unknown as Promise<Peaks>, current: null as Peaks | null, listeners: new Set<(p: Peaks) => void>() };
    e.task = load(blob, (p) => {
      e.current = p;
      e.listeners.forEach((l) => l(p));
    });
    e.task.catch(() => cache.delete(blob)).finally(() => e.listeners.clear());
    cache.set(blob, (entry = e));
  }
  if (onUpdate) {
    if (entry.current) onUpdate(entry.current);
    entry.listeners.add(onUpdate);
  }
  return entry.task;
}

async function load(blob: Blob, onUpdate?: (p: Peaks) => void): Promise<Peaks> {
  try {
    return await stream(blob, onUpdate);
  } catch {
    const pcm = await decodeFile(blob);
    const { min, max } = pcmPeaks(pcm, BUCKETS);
    const result = { min, max, duration: pcmDuration(pcm), done: true, version: 1 };
    onUpdate?.(result);
    return result;
  }
}

async function stream(blob: Blob, onUpdate?: (p: Peaks) => void): Promise<Peaks> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) throw new Error("无法解码");
    const start = await track.getFirstTimestamp();
    const total = Math.max(0.001, (await track.computeDuration()) - start);
    const result: Peaks = { min: new Float32Array(BUCKETS), max: new Float32Array(BUCKETS), duration: total, done: false, version: 0 };
    let lastUpdate = 0;
    for await (const s of new AudioSampleSink(track).samples()) {
      const frames = s.numberOfFrames;
      const channels = Math.min(2, s.numberOfChannels);
      const t0 = s.timestamp - start;
      for (let c = 0; c < channels; c++) {
        const data = new Float32Array(frames);
        s.copyTo(data, { planeIndex: c, format: "f32-planar" });
        const perBucket = (total / BUCKETS) * s.sampleRate;
        for (let i = 0; i < frames; i++) {
          const b = Math.min(BUCKETS - 1, Math.max(0, Math.floor(((t0 * s.sampleRate + i) / perBucket) | 0)));
          const v = data[i];
          if (v < result.min[b]) result.min[b] = v;
          if (v > result.max[b]) result.max[b] = v;
        }
      }
      s.close();
      // 每 0.2 秒通知一次，边读边显示
      const now = performance.now();
      if (now - lastUpdate > 200) {
        lastUpdate = now;
        result.version++;
        onUpdate?.(result);
      }
    }
    result.done = true;
    result.version++;
    onUpdate?.(result);
    return result;
  } finally {
    input.dispose();
  }
}
