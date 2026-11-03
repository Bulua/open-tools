import { describe, expect, it } from "vitest";
import { blendPixels, featherMask, fromModelOutput, INPAINT_MODELS, inpaintRegion, maskBounds, toModelInputs } from "./inpaint";

const lama = INPAINT_MODELS.find((m) => m.id === "lama")!;
const migan = INPAINT_MODELS.find((m) => m.id === "migan")!;

describe("AI 去水印", () => {
  it("涂抹区域的外接框；没有涂抹时为空", () => {
    // 4 × 3，涂了 (1,0) 和 (2,2)
    const mask = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
    expect(maskBounds(mask, 4, 3)).toEqual({ x: 1, y: 0, w: 2, h: 3 });
    expect(maskBounds(new Array(12).fill(0), 4, 3)).toBeNull();
  });

  it("修补区域：小水印取 512 的正方形，靠边时往里移", () => {
    expect(inpaintRegion({ x: 1000, y: 1000, w: 100, h: 40 }, 4000, 3000)).toEqual({ x: 794, y: 764, w: 512, h: 512 });
    expect(inpaintRegion({ x: 3950, y: 10, w: 40, h: 20 }, 4000, 3000)).toEqual({ x: 3488, y: 0, w: 512, h: 512 });
  });

  it("修补区域：大水印留出同样大的背景；比图片大时按图片截断", () => {
    expect(inpaintRegion({ x: 1000, y: 1000, w: 600, h: 100 }, 4000, 3000)).toEqual({ x: 700, y: 450, w: 1200, h: 1200 });
    expect(inpaintRegion({ x: 10, y: 10, w: 100, h: 50 }, 300, 200)).toEqual({ x: 0, y: 0, w: 300, h: 200 });
  });

  it("贴回的透明度：涂抹处完全替换，向外逐渐过渡，远处不变", () => {
    // 一行 11 个像素，中间一个涂抹过
    const mask = new Array(11).fill(0);
    mask[5] = 1;
    const a = featherMask(mask, 11, 1, 2);
    expect(a[5]).toBe(255);
    expect(a[4]).toBe(a[6]);
    expect(a[0]).toBe(0);
    expect(a[10]).toBe(0);
    expect(a[3]).toBeGreaterThan(a[2]);
    expect(a[2]).toBeGreaterThan(0);
    expect([...featherMask(mask, 11, 1, 0)]).toEqual(mask.map((v) => (v ? 255 : 0)));
  });

  it("混合：按透明度取修补结果，原图透明度不变", () => {
    const original = Uint8ClampedArray.from([0, 0, 0, 100, 0, 0, 0, 255]);
    const patch = Uint8ClampedArray.from([200, 100, 50, 255, 200, 200, 200, 255]);
    expect([...blendPixels(original, patch, [255, 0])]).toEqual([200, 100, 50, 100, 0, 0, 0, 255]);
    expect([...blendPixels(original, patch, [0, 51])]).toEqual([0, 0, 0, 100, 40, 40, 40, 255]);
  });

  it("模型输入：按通道排列；LaMa 用 0～1 和 1 表示修补，MI-GAN 用 uint8 和 0 表示修补", () => {
    // 2 × 2：红、绿、蓝、白，最后一个像素要修补
    const rgba = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];
    const [img, mask] = toModelInputs(lama, rgba, [0, 0, 0, 1], 2);
    expect(img.data).toBeInstanceOf(Float32Array);
    expect([...img.data]).toEqual([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]);
    expect([...mask.data]).toEqual([0, 0, 0, 1]);
    expect(img.shape).toEqual([1, 3, 2, 2]);

    const [mImg, mMask] = toModelInputs(migan, [10, 20, 30, 255], [1], 1);
    expect(mImg.data).toBeInstanceOf(Uint8Array);
    expect([...mImg.data]).toEqual([10, 20, 30]);
    expect([...mMask.data]).toEqual([0]);
    expect(mMask.shape).toEqual([1, 1, 1, 1]);
  });

  it("模型输出转回 RGBA", () => {
    expect([...fromModelOutput(lama, Float32Array.from([255, 128, 0]).buffer, 1)]).toEqual([255, 128, 0, 255]);
    expect([...fromModelOutput(migan, Uint8Array.from([1, 2, 3]).buffer, 1)]).toEqual([1, 2, 3, 255]);
    expect(() => fromModelOutput(lama, new ArrayBuffer(4), 1)).toThrow();
  });
});
