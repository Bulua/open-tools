import { describe, expect, it } from "vitest";
import { applyGain, concat, duration, encodeWav, fade, formatTime, normalize, peakLevel, peaks, removeRange, slice, withChannels, type Pcm } from "./pcm";

/** 采样率 10，每个采样的值就是它的序号 / 100，方便核对 */
const ramp = (n: number, channels = 1): Pcm => ({
  sampleRate: 10,
  channels: Array.from({ length: channels }, () => Float32Array.from({ length: n }, (_, i) => i / 100)),
});
const values = (p: Pcm, ch = 0) => [...p.channels[ch]].map((v) => Math.round(v * 100));

describe("剪切与拼接", () => {
  it("截取、删除片段", () => {
    const p = ramp(20);
    expect(duration(p)).toBe(2);
    expect(values(slice(p, 0.5, 1))).toEqual([5, 6, 7, 8, 9]);
    expect(values(removeRange(p, 0.2, 1.8))).toEqual([0, 1, 18, 19]);
    // 起止顺序反了也可以
    expect(values(slice(p, 1, 0.5))).toHaveLength(5);
  });

  it("拼接：声道数统一、中间留空白", () => {
    const joined = concat([ramp(3, 1), ramp(2, 2)], 0.2);
    expect(joined.channels).toHaveLength(2);
    expect(values(joined, 1)).toEqual([0, 1, 2, 0, 0, 0, 1]);
    expect(() => concat([ramp(2), { sampleRate: 20, channels: [new Float32Array(2)] }])).toThrow("采样率不一致");
  });

  it("多声道混成单声道", () => {
    const p: Pcm = { sampleRate: 10, channels: [Float32Array.from([0.2, 0.4]), Float32Array.from([0, 0])] };
    expect([...withChannels(p, 1).channels[0]].map((v) => Number(v.toFixed(2)))).toEqual([0.1, 0.2]);
  });
});

describe("音量", () => {
  it("增益、削顶、标准化", () => {
    const p = ramp(11);
    expect(peakLevel(applyGain(p, 200))).toBe(1);
    expect(peakLevel(normalize(p, 0.5))).toBeCloseTo(0.5);
  });

  it("淡入淡出", () => {
    const p: Pcm = { sampleRate: 10, channels: [new Float32Array(10).fill(1)] };
    expect([...fade(p, 0, 0.5, "in").channels[0]].slice(0, 6).map((v) => Number(v.toFixed(1)))).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(fade(p, 0.5, 1, "out").channels[0][9]).toBeCloseTo(0.2);
  });
});

describe("波形与编码", () => {
  it("波形分段取最大最小值", () => {
    const { min, max } = peaks({ sampleRate: 10, channels: [Float32Array.from([-0.5, 0.2, 0.1, 0.9])] }, 2);
    expect([...min]).toEqual([-0.5, 0]);
    expect([...max].map((v) => Number(v.toFixed(1)))).toEqual([0.2, 0.9]);
  });

  it("WAV 文件头", () => {
    const wav = encodeWav(ramp(10, 2));
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(10);
    expect(wav.length).toBe(44 + 10 * 2 * 2);
  });

  it("时间显示", () => {
    expect(formatTime(65.34)).toBe("1:05.3");
    expect(formatTime(3725, false)).toBe("1:02:05");
    expect(formatTime(9.96)).toBe("0:10.0");
  });
});
