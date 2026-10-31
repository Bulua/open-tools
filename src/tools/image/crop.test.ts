import { describe, expect, it } from "vitest";
import { initialCrop, updateCrop } from "./crop";

describe("裁剪框", () => {
  it("初始框居中，按比例", () => {
    expect(initialCrop(1000, 500, null)).toEqual({ x: 100, y: 50, w: 800, h: 400 });
    expect(initialCrop(1000, 500, 1)).toEqual({ x: 300, y: 50, w: 400, h: 400 });
  });

  it("拖动整个框不会超出图片", () => {
    const start = { x: 100, y: 100, w: 200, h: 100 };
    expect(updateCrop(start, "move", 50, 20, 1000, 500, null)).toEqual({ x: 150, y: 120, w: 200, h: 100 });
    expect(updateCrop(start, "move", 5000, -500, 1000, 500, null)).toEqual({ x: 800, y: 0, w: 200, h: 100 });
  });

  it("拖动右下角时左上角固定", () => {
    const start = { x: 100, y: 100, w: 200, h: 100 };
    expect(updateCrop(start, "se", 50, 30, 1000, 500, null)).toEqual({ x: 100, y: 100, w: 250, h: 130 });
  });

  it("拖动左上角时右下角固定，且不超出边界", () => {
    const start = { x: 100, y: 100, w: 200, h: 100 };
    expect(updateCrop(start, "nw", -500, -500, 1000, 500, null)).toEqual({ x: 0, y: 0, w: 300, h: 200 });
  });

  it("固定比例", () => {
    const start = { x: 0, y: 0, w: 100, h: 100 };
    const r = updateCrop(start, "se", 300, 50, 1000, 500, 1);
    expect(r.w).toBe(r.h);
    expect(r).toEqual({ x: 0, y: 0, w: 150, h: 150 });
  });

  it("不会小于最小尺寸", () => {
    const start = { x: 100, y: 100, w: 200, h: 100 };
    expect(updateCrop(start, "se", -1000, -1000, 1000, 500, null, 16)).toEqual({ x: 100, y: 100, w: 16, h: 16 });
  });
});
