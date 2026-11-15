import { describe, expect, it } from "vitest";
import { fullCrop, initialCrop, outputSize, sizeFromInput, updateCrop } from "./crop";

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

describe("整张裁剪框与导出尺寸", () => {
  it("不固定比例时是整张图，固定比例时取能放下的最大框并居中", () => {
    expect(fullCrop(1000, 500, null)).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
    expect(fullCrop(1000, 500, 1)).toEqual({ x: 250, y: 0, w: 500, h: 500 });
    expect(fullCrop(1000, 500, 9 / 16)).toEqual({ x: 359, y: 0, w: 281, h: 500 });
  });

  it("按百分比缩放裁剪框", () => {
    const crop = { x: 0, y: 0, w: 801, h: 400 };
    expect(outputSize(crop, { scale: 100 })).toEqual({ w: 801, h: 400 });
    expect(outputSize(crop, { scale: 50 })).toEqual({ w: 401, h: 200 });
    expect(outputSize({ x: 0, y: 0, w: 3, h: 3 }, { scale: 1 })).toEqual({ w: 1, h: 1 });
  });

  it("保持比例时填宽度换算成百分比，改裁剪框后跟着变", () => {
    const crop = { x: 0, y: 0, w: 1000, h: 500 };
    const size = sizeFromInput(crop, { scale: 100 }, "w", 300, true);
    expect(outputSize(crop, size)).toEqual({ w: 300, h: 150 });
    expect(outputSize({ x: 0, y: 0, w: 500, h: 500 }, size)).toEqual({ w: 150, h: 150 });
    expect(outputSize(crop, sizeFromInput(crop, { scale: 100 }, "h", 100, true))).toEqual({ w: 200, h: 100 });
  });

  it("不保持比例时固定宽高，只改填的那一边", () => {
    const crop = { x: 0, y: 0, w: 1000, h: 500 };
    const size = sizeFromInput(crop, { scale: 50 }, "w", 300, false);
    expect(size).toEqual({ w: 300, h: 250 });
    expect(sizeFromInput(crop, size, "h", 0, false)).toEqual({ w: 300, h: 1 });
  });
});
