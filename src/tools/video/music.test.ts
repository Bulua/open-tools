import { describe, expect, it } from "vitest";
import { FADE_SECONDS, MusicMixer, musicSegments, musicTimeAt, type MusicOptions } from "./music";
import { SAMPLE_RATE } from "./media";

const opts = (o: Partial<MusicOptions>): MusicOptions => ({ musicVolume: 1, originalVolume: 1, repeat: "loop", fadeOut: false, ...o });
const filled = (n: number, v: number) => new Float32Array(n).fill(v);

describe("视频配乐：播放区间", () => {
  it("循环播放到视频结束，最后一遍截断", () => {
    expect(musicSegments(10, 4, "loop")).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 8 },
      { start: 8, end: 10 },
    ]);
  });

  it("指定次数：播完就停，超出视频的部分不算", () => {
    expect(musicSegments(10, 3, 2)).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
    ]);
    expect(musicSegments(10, 6, 3)).toEqual([
      { start: 0, end: 6 },
      { start: 6, end: 10 },
    ]);
  });

  it("预览时音乐的位置：循环取余，播完返回 null", () => {
    expect(musicTimeAt(7, 3, "loop")).toBe(1);
    expect(musicTimeAt(5, 3, 2)).toBe(2);
    expect(musicTimeAt(6, 3, 2)).toBeNull();
  });
});

describe("视频配乐：混音", () => {
  const music: [Float32Array, Float32Array] = [filled(4, 0.2), filled(4, 0.4)];

  it("原声和音乐按音量相加", () => {
    const mixer = new MusicMixer(music, 100, opts({ musicVolume: 0.5, originalVolume: 0.5 }));
    const [l, r] = mixer.mix(filled(2, 0.6), filled(2, 0.2), 0);
    expect(l[0]).toBeCloseTo(0.3 + 0.1);
    expect(r[1]).toBeCloseTo(0.1 + 0.2);
  });

  it("播放指定次数后只剩原声", () => {
    const mixer = new MusicMixer(music, 100, opts({ repeat: 2 }));
    const [l] = mixer.mix(filled(10, 0), filled(10, 0), 0);
    expect(Array.from(l.subarray(0, 8)).every((v) => Math.abs(v - 0.2) < 1e-6)).toBe(true);
    expect(Array.from(l.subarray(8))).toEqual([0, 0]);
  });

  it("超过 1 时截断，不会爆音", () => {
    const mixer = new MusicMixer([filled(4, 0.9), filled(4, 0.9)], 100, opts({}));
    const [l] = mixer.mix(filled(1, 0.9), filled(1, 0.9), 0);
    expect(l[0]).toBe(1);
  });

  it("音乐播到视频结尾时淡出，最后一帧接近静音", () => {
    const total = SAMPLE_RATE * (FADE_SECONDS + 1);
    const mixer = new MusicMixer(music, total, opts({ fadeOut: true, originalVolume: 0 }));
    const [l] = mixer.mix(new Float32Array(total), new Float32Array(total), 0);
    expect(l[SAMPLE_RATE / 2]).toBeCloseTo(0.2);
    expect(l[total - 1]).toBeLessThan(0.001);
  });

  it("音乐在视频结束前就播完时不淡出", () => {
    const total = SAMPLE_RATE * (FADE_SECONDS + 1);
    const long: [Float32Array, Float32Array] = [filled(total - 10, 0.2), filled(total - 10, 0.2)];
    const mixer = new MusicMixer(long, total, opts({ fadeOut: true, repeat: 1 }));
    const [l] = mixer.mix(new Float32Array(total), new Float32Array(total), 0);
    expect(l[total - 20]).toBeCloseTo(0.2);
  });
});
