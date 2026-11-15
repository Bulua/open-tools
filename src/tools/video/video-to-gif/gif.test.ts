import { describe, expect, it } from "vitest";
import { MAX_FRAMES, effectiveFps, frameCount, frameDelays, frameTimestamps, outputSize } from "./gif";

describe("视频转 GIF", () => {
  it("视频太长时自动降低帧率，帧数不超过上限", () => {
    expect(effectiveFps(10, 15)).toBe(15);
    expect(effectiveFps(120, 10)).toBe(MAX_FRAMES / 120);
    expect(frameCount(0, 120, effectiveFps(120, 10))).toBe(MAX_FRAMES);
  });

  it("帧数至少 1 帧，不超过上限", () => {
    expect(frameCount(0, 2, 10)).toBe(20);
    expect(frameCount(1, 1, 10)).toBe(1);
    expect(frameCount(0, 1000, 20)).toBe(MAX_FRAMES);
  });

  it("按帧率取时间点", () => {
    expect(frameTimestamps(2, 3, 5)).toEqual([2, 2.2, 2.4, 2.6, 2.8]);
  });

  it("每帧停留时间是 10 毫秒的倍数，总时长准确", () => {
    const delays = frameDelays(15, 15);
    expect(delays.every((d) => d % 10 === 0)).toBe(true);
    expect(delays.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(frameDelays(3, 10)).toEqual([100, 100, 100]);
  });

  it("按宽度等比缩放，不放大", () => {
    expect(outputSize(1920, 1080, 480)).toEqual({ width: 480, height: 270 });
    expect(outputSize(320, 240, 640)).toEqual({ width: 320, height: 240 });
    expect(outputSize(1280, 720, 0)).toEqual({ width: 1280, height: 720 });
    expect(outputSize(4000, 1, 320)).toEqual({ width: 320, height: 1 });
  });
});
