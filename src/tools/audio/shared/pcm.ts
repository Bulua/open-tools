/**
 * 音频数据（PCM）的纯计算：剪切、拼接、音量、淡入淡出、波形、WAV 编码。
 * 不依赖浏览器音频接口，便于测试；解码和播放见 audio.ts。
 */

export interface Pcm {
  sampleRate: number;
  /** 每个声道一段采样，取值 -1～1 */
  channels: Float32Array[];
}

export const duration = (p: Pcm) => (p.channels[0]?.length ?? 0) / p.sampleRate;

const toIndex = (p: Pcm, seconds: number) => Math.max(0, Math.min(p.channels[0].length, Math.round(seconds * p.sampleRate)));

/** 截取 start～end 秒 */
export function slice(p: Pcm, start: number, end: number): Pcm {
  const [a, b] = [toIndex(p, Math.min(start, end)), toIndex(p, Math.max(start, end))];
  return { sampleRate: p.sampleRate, channels: p.channels.map((c) => c.slice(a, b)) };
}

/** 删除 start～end 秒，前后两段接起来 */
export function removeRange(p: Pcm, start: number, end: number): Pcm {
  const [a, b] = [toIndex(p, Math.min(start, end)), toIndex(p, Math.max(start, end))];
  return {
    sampleRate: p.sampleRate,
    channels: p.channels.map((c) => {
      const out = new Float32Array(c.length - (b - a));
      out.set(c.subarray(0, a));
      out.set(c.subarray(b), a);
      return out;
    }),
  };
}

/** 统一声道数：单声道复制成多声道，多声道混成单声道 */
export function withChannels(p: Pcm, count: number): Pcm {
  if (p.channels.length === count) return p;
  if (count === 1) {
    const mono = new Float32Array(p.channels[0].length);
    for (const c of p.channels) for (let i = 0; i < c.length; i++) mono[i] += c[i] / p.channels.length;
    return { sampleRate: p.sampleRate, channels: [mono] };
  }
  return { sampleRate: p.sampleRate, channels: Array.from({ length: count }, (_, i) => p.channels[Math.min(i, p.channels.length - 1)]) };
}

/** 按顺序拼接（采样率需相同，声道数取最多的），片段之间可以留 gap 秒空白 */
export function concat(list: Pcm[], gap = 0): Pcm {
  if (!list.length) throw new Error("没有音频");
  const sampleRate = list[0].sampleRate;
  if (list.some((p) => p.sampleRate !== sampleRate)) throw new Error("采样率不一致，请先统一采样率");
  const count = Math.max(...list.map((p) => p.channels.length));
  const parts = list.map((p) => withChannels(p, count));
  const gapLen = Math.round(gap * sampleRate);
  const total = parts.reduce((n, p) => n + p.channels[0].length, 0) + gapLen * (parts.length - 1);
  const channels = Array.from({ length: count }, () => new Float32Array(total));
  let offset = 0;
  parts.forEach((p, i) => {
    p.channels.forEach((c, ch) => channels[ch].set(c, offset));
    offset += p.channels[0].length + (i < parts.length - 1 ? gapLen : 0);
  });
  return { sampleRate, channels };
}

/** 调整音量（倍数），超出范围的部分削顶 */
export function applyGain(p: Pcm, gain: number): Pcm {
  if (gain === 1) return p;
  return { sampleRate: p.sampleRate, channels: p.channels.map((c) => c.map((v) => Math.max(-1, Math.min(1, v * gain)))) };
}

/** 最大音量（0～1） */
export function peakLevel(p: Pcm): number {
  let max = 0;
  for (const c of p.channels) for (let i = 0; i < c.length; i++) max = Math.max(max, Math.abs(c[i]));
  return max;
}

/** 音量标准化：把最响的地方放大（或缩小）到 target */
export function normalize(p: Pcm, target = 0.95): Pcm {
  const peak = peakLevel(p);
  return peak > 0 ? applyGain(p, target / peak) : p;
}

/** 在 start～end 秒范围内淡入（音量从 0 到 1）或淡出（从 1 到 0） */
export function fade(p: Pcm, start: number, end: number, direction: "in" | "out"): Pcm {
  const [a, b] = [toIndex(p, Math.min(start, end)), toIndex(p, Math.max(start, end))];
  const len = b - a;
  if (len <= 0) return p;
  return {
    sampleRate: p.sampleRate,
    channels: p.channels.map((c) => {
      const out = c.slice();
      for (let i = 0; i < len; i++) {
        const t = i / len;
        out[a + i] *= direction === "in" ? t : 1 - t;
      }
      return out;
    }),
  };
}

/** 波形：把采样分成 buckets 段，每段取最小值和最大值（多个声道取最大幅度） */
export function peaks(p: Pcm, buckets: number): { min: Float32Array; max: Float32Array } {
  const len = p.channels[0]?.length ?? 0;
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  const step = len / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * step);
    const to = Math.max(from + 1, Math.floor((b + 1) * step));
    let lo = 0;
    let hi = 0;
    // 每段最多取 2000 个点，长音频也能快速绘制
    const stride = Math.max(1, Math.floor((to - from) / 2000));
    for (const c of p.channels) {
      for (let i = from; i < to && i < len; i += stride) {
        const v = c[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[b] = lo;
    max[b] = hi;
  }
  return { min, max };
}

/** 编码为 16 位 WAV 文件 */
export function encodeWav(p: Pcm): Uint8Array {
  const channels = p.channels.length;
  const frames = p.channels[0]?.length ?? 0;
  const dataSize = frames * channels * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeText = (offset: number, text: string) => [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, p.sampleRate, true);
  view.setUint32(28, p.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const v = Math.max(-1, Math.min(1, p.channels[ch][i]));
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      offset += 2;
    }
  }
  return new Uint8Array(buf);
}

/** 秒数显示为「1:05.3」或「1:02:05」 */
export function formatTime(seconds: number, withTenths = true): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const secText = withTenths && !h ? sec.toFixed(1).padStart(4, "0") : String(Math.floor(sec)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${secText}` : `${m}:${secText}`;
}
