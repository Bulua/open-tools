import { describe, expect, it } from "vitest";
import {
  anchorPosition,
  contentBounds,
  detectBackgroundColor,
  detectBackgroundColors,
  pixelate,
  removeBackground,
  stitchLayout,
  tilePositions,
} from "./effects";

/** 生成纯色像素，可以指定部分像素的颜色 */
function image(width: number, height: number, fill: number[], paint: (x: number, y: number) => number[] | null = () => null) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(paint(x, y) ?? fill, (y * width + x) * 4);
  }
  return data;
}
const alphaAt = (data: Uint8ClampedArray, width: number, x: number, y: number) => data[(y * width + x) * 4 + 3];

describe("stitchLayout", () => {
  const sizes = [
    { width: 400, height: 200 },
    { width: 100, height: 100 },
  ];
  const base = { columns: 2, gap: 10, padding: 0, unify: false };

  it("横向拼接，高度不同时垂直居中", () => {
    const r = stitchLayout(sizes, { ...base, direction: "horizontal" });
    expect(r).toEqual({
      width: 510,
      height: 200,
      boxes: [
        { x: 0, y: 0, w: 400, h: 200 },
        { x: 410, y: 50, w: 100, h: 100 },
      ],
    });
  });

  it("横向拼接统一高度（以最小为准）", () => {
    const r = stitchLayout(sizes, { ...base, direction: "horizontal", unify: true });
    expect(r.boxes).toEqual([
      { x: 0, y: 0, w: 200, h: 100 },
      { x: 210, y: 0, w: 100, h: 100 },
    ]);
    expect(r.width).toBe(310);
  });

  it("纵向拼接统一宽度，带外边距", () => {
    const r = stitchLayout(sizes, { ...base, direction: "vertical", unify: true, padding: 5 });
    expect(r.boxes).toEqual([
      { x: 5, y: 5, w: 100, h: 50 },
      { x: 5, y: 65, w: 100, h: 100 },
    ]);
    expect(r).toMatchObject({ width: 110, height: 170 });
  });

  it("宫格：按列数换行", () => {
    const four = Array(3).fill({ width: 100, height: 100 });
    const r = stitchLayout(four, { ...base, direction: "grid", columns: 2 });
    expect(r).toMatchObject({ width: 210, height: 210 });
    expect(r.boxes[2]).toEqual({ x: 0, y: 110, w: 100, h: 100 });
  });
});

describe("contentBounds", () => {
  it("计算所有图片占据的范围", () => {
    expect(
      contentBounds([
        { x: 50, y: 20, w: 100, h: 100 },
        { x: -10, y: 80, w: 30, h: 200 },
      ]),
    ).toEqual({ x: -10, y: 20, w: 160, h: 260 });
    expect(contentBounds([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("pixelate", () => {
  it("格子内变成平均色", () => {
    // 左半黑、右半白的 4x2 图片，块大小 4 → 整块变成灰色
    const data = image(4, 2, [0, 0, 0, 255], (x) => (x >= 2 ? [255, 255, 255, 255] : null));
    pixelate(data, 4, 2, { x: 0, y: 0, w: 4, h: 2 }, 4);
    expect([...data.slice(0, 4)]).toEqual([128, 128, 128, 255]);
    expect([...data.slice(28, 32)]).toEqual([128, 128, 128, 255]);
  });

  it("区域外不受影响", () => {
    const data = image(8, 2, [0, 0, 0, 255], (x) => (x % 2 ? [255, 255, 255, 255] : null));
    pixelate(data, 8, 2, { x: 0, y: 0, w: 4, h: 2 }, 4);
    expect(data[4 * 4]).toBe(0); // x=4 原本是黑色
    expect(data[5 * 4]).toBe(255); // x=5 原本是白色
  });
});

describe("去背景", () => {
  // 10x10 白底，中间 4x4 红色方块，方块中间 2x2 是白色（与背景同色但不相连）
  const make = () =>
    image(10, 10, [255, 255, 255, 255], (x, y) => {
      if (x >= 4 && x <= 5 && y >= 4 && y <= 5) return [255, 255, 255, 255];
      if (x >= 3 && x <= 6 && y >= 3 && y <= 6) return [220, 30, 30, 255];
      return null;
    });

  it("自动识别背景色", () => {
    expect(detectBackgroundColor(make(), 10, 10)).toEqual([255, 255, 255]);
  });

  it("只去除与边缘相连的背景", () => {
    const out = removeBackground(make(), 10, 10, { colors: [[255, 255, 255]], tolerance: 10, feather: 0, contiguous: true });
    expect(alphaAt(out, 10, 0, 0)).toBe(0); // 背景透明
    expect(alphaAt(out, 10, 3, 3)).toBe(255); // 主体保留
    expect(alphaAt(out, 10, 4, 4)).toBe(255); // 主体内部的白色不被挖掉
  });

  it("去除所有相近颜色", () => {
    const out = removeBackground(make(), 10, 10, { colors: [[255, 255, 255]], tolerance: 10, feather: 0, contiguous: false });
    expect(alphaAt(out, 10, 4, 4)).toBe(0);
    expect(alphaAt(out, 10, 3, 3)).toBe(255);
  });

  describe("多种背景色", () => {
    // 左半白、右半浅蓝的背景，中间一个红色方块
    const twoTone = () =>
      image(20, 10, [255, 255, 255, 255], (x, y) => {
        if (x >= 8 && x <= 11 && y >= 3 && y <= 6) return [220, 30, 30, 255];
        return x >= 10 ? [170, 200, 240, 255] : null;
      });

    it("自动识别出两种背景色", () => {
      const colors = detectBackgroundColors(twoTone(), 20, 10);
      expect(colors).toHaveLength(2);
      expect(colors).toContainEqual([255, 255, 255]);
      expect(colors).toContainEqual([170, 200, 240]);
    });

    it("只选一种颜色时，另一半背景保留", () => {
      const out = removeBackground(twoTone(), 20, 10, { colors: [[255, 255, 255]], tolerance: 5, feather: 0, contiguous: true });
      expect(alphaAt(out, 20, 0, 0)).toBe(0);
      expect(alphaAt(out, 20, 19, 0)).toBe(255);
    });

    it("两种颜色都去除，主体保留", () => {
      const out = removeBackground(twoTone(), 20, 10, {
        colors: [
          [255, 255, 255],
          [170, 200, 240],
        ],
        tolerance: 5,
        feather: 0,
        contiguous: true,
      });
      expect(alphaAt(out, 20, 0, 0)).toBe(0);
      expect(alphaAt(out, 20, 19, 9)).toBe(0);
      expect(alphaAt(out, 20, 9, 4)).toBe(255);
    });
  });

  it("边缘柔化产生半透明", () => {
    const data = image(3, 1, [255, 255, 255, 255], (x) => (x === 1 ? [200, 200, 200, 255] : x === 2 ? [0, 0, 0, 255] : null));
    // 灰色与白色相差约 95，容差约 22，柔化范围约 110 → 落在渐变区间内
    const out = removeBackground(data, 3, 1, { colors: [[255, 255, 255]], tolerance: 5, feather: 50, contiguous: false });
    const a = alphaAt(out, 3, 1, 0);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(255);
  });
});

describe("水印位置", () => {
  const img = { width: 1000, height: 500 };
  const mark = { width: 100, height: 40 };

  it("九宫格位置（中心点）", () => {
    expect(anchorPosition("tl", img, mark, 20)).toEqual({ x: 70, y: 40 });
    expect(anchorPosition("c", img, mark, 20)).toEqual({ x: 500, y: 250 });
    expect(anchorPosition("br", img, mark, 20)).toEqual({ x: 930, y: 460 });
    expect(anchorPosition("l", img, mark, 20)).toEqual({ x: 70, y: 250 });
    expect(anchorPosition("t", img, mark, 20)).toEqual({ x: 500, y: 40 });
  });

  it("平铺覆盖整张图", () => {
    const points = tilePositions(img, mark, 50);
    expect(points.length).toBeGreaterThan(20);
    expect(points.some((p) => p.x <= 0 && p.y <= 0)).toBe(true);
    expect(points.some((p) => p.x >= 1000 && p.y >= 500)).toBe(true);
  });
});
