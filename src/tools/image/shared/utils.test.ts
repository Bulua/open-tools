import { describe, expect, it } from "vitest";
import { extractPalette, fitSize, outputFormatOf, replaceExtension, writeIco } from "./utils";

describe("文件名与格式", () => {
  it("替换扩展名", () => {
    expect(replaceExtension("photo.jpeg", "webp")).toBe("photo.webp");
    expect(replaceExtension("my.photo.png", "jpg")).toBe("my.photo.jpg");
    expect(replaceExtension("noext", "png")).toBe("noext.png");
  });

  it("不支持的格式按 PNG 输出", () => {
    expect(outputFormatOf("image/jpeg")).toBe("image/jpeg");
    expect(outputFormatOf("image/gif")).toBe("image/png");
  });
});

describe("fitSize", () => {
  it("等比缩小，不放大", () => {
    expect(fitSize(4000, 3000, 1920)).toEqual({ width: 1920, height: 1440 });
    expect(fitSize(4000, 3000, 1920, 1000)).toEqual({ width: 1333, height: 1000 });
    expect(fitSize(800, 600, 1920)).toEqual({ width: 800, height: 600 });
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("writeIco", () => {
  it("生成正确的文件头和目录", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    const ico = writeIco([
      { size: 16, png: a },
      { size: 256, png: b },
    ]);
    const view = new DataView(ico.buffer);
    expect(ico.length).toBe(6 + 2 * 16 + 5);
    expect(view.getUint16(2, true)).toBe(1); // 图标类型
    expect(view.getUint16(4, true)).toBe(2); // 两张图
    expect(ico[6]).toBe(16); // 第一张宽 16
    expect(ico[22]).toBe(0); // 第二张宽 256 记为 0
    expect(view.getUint32(6 + 8, true)).toBe(3); // 第一张大小
    expect(view.getUint32(6 + 12, true)).toBe(38); // 第一张偏移
    expect(view.getUint32(22 + 12, true)).toBe(41); // 第二张偏移
    expect([...ico.slice(38)]).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("extractPalette", () => {
  it("按占比返回主色，合并相近颜色并忽略透明像素", () => {
    const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];
    const pixels = new Uint8ClampedArray([
      ...Array(6).fill(px(200, 100, 60)).flat(),
      ...Array(2).fill(px(205, 102, 62)).flat(), // 与上面相近，应合并
      ...Array(2).fill(px(20, 40, 200)).flat(),
      ...Array(5).fill(px(0, 255, 0, 0)).flat(), // 透明
    ]);
    const palette = extractPalette(pixels);
    expect(palette).toHaveLength(2);
    expect(palette[0].ratio).toBeCloseTo(0.8);
    expect(palette[1]).toMatchObject({ r: 20, g: 40, b: 200 });
  });
});
