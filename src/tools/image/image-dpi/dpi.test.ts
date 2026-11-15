import { describe, expect, it } from "vitest";
import { crc32, dpiFormatOf, printSizeCm, readDpi, writeDpi } from "./dpi";

const bytesOf = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

/** 拼一个 PNG 块：长度 + 类型 + 数据 + CRC */
function chunk(type: string, data: number[]) {
  const body = [...bytesOf(type), ...data];
  return [...be32(data.length), ...body, ...be32(crc32(Uint8Array.from(body)))];
}

/** 最小的 PNG：IHDR + 可选的其他块 + IDAT + IEND（IDAT 内容不需要真实） */
function png(extra: number[][] = []) {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", [...be32(1), ...be32(1), 8, 6, 0, 0, 0]),
    ...extra.flat(),
    ...chunk("IDAT", [1, 2, 3]),
    ...chunk("IEND", []),
  ]);
}

const phys = (ppm: number, unit = 1) => chunk("pHYs", [...be32(ppm), ...be32(ppm), unit]);

/** 列出 PNG 的块类型，顺便校验每个块的 CRC */
function pngTypes(bytes: Uint8Array) {
  const types: string[] = [];
  for (let p = 8; p < bytes.length; ) {
    const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(p);
    const body = bytes.subarray(p + 4, p + 8 + len);
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(p + 8 + len)).toBe(crc32(body));
    types.push(String.fromCharCode(...body.subarray(0, 4)));
    p += 12 + len;
  }
  return types;
}

const SOI = [0xff, 0xd8];
const SOS_EOI = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9];
const segment = (marker: number, data: number[]) => [0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff, ...data];
const jfif = (units: number, x: number, y: number) => segment(0xe0, [...bytesOf("JFIF\0"), 1, 1, units, x >> 8, x & 0xff, y >> 8, y & 0xff, 0, 0]);
const dqt = segment(0xdb, [0, 1, 2, 3]);

/** 大端 EXIF：IFD0 里有 XResolution、YResolution（RATIONAL）和 ResolutionUnit（SHORT） */
function exif(dpi: number, unit = 2) {
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, ...be32(8), // "MM"、42、IFD0 偏移 8
    0x00, 0x03, // 3 个条目
    0x01, 0x1a, 0x00, 0x05, ...be32(1), ...be32(50), // XResolution → 偏移 50
    0x01, 0x1b, 0x00, 0x05, ...be32(1), ...be32(58), // YResolution → 偏移 58
    0x01, 0x28, 0x00, 0x03, ...be32(1), unit >> 8, unit & 0xff, 0, 0,
    ...be32(0), // 没有下一个 IFD
    ...be32(dpi), ...be32(1),
    ...be32(dpi), ...be32(1),
  ];
  return segment(0xe1, [...bytesOf("Exif\0\0"), ...tiff]);
}

describe("crc32", () => {
  it("与 PNG 标准值一致", () => {
    expect(crc32(bytesOf("IEND"))).toBe(0xae426082);
  });
});

describe("dpiFormatOf", () => {
  it("按文件头识别 PNG 和 JPEG", () => {
    expect(dpiFormatOf(png())).toBe("png");
    expect(dpiFormatOf(Uint8Array.from([...SOI, ...SOS_EOI]))).toBe("jpeg");
    expect(dpiFormatOf(bytesOf("GIF89a"))).toBeNull();
    expect(() => writeDpi(bytesOf("GIF89a"), 300)).toThrow();
  });
});

describe("PNG", () => {
  it("没有 pHYs 时读不到 DPI，写入后插在 IHDR 后面", () => {
    expect(readDpi(png())).toBeNull();
    const out = writeDpi(png(), 300);
    expect(readDpi(out)).toEqual({ x: 300, y: 300 });
    expect(pngTypes(out)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
  });

  it("替换已有的 pHYs，不留下重复的块", () => {
    const src = png([phys(2835), chunk("tEXt", [...bytesOf("a\0b")])]);
    expect(readDpi(src)).toEqual({ x: 72, y: 72 });
    const out = writeDpi(src, 150);
    expect(readDpi(out)).toEqual({ x: 150, y: 150 });
    expect(pngTypes(out)).toEqual(["IHDR", "pHYs", "tEXt", "IDAT", "IEND"]);
  });

  it("单位未知的 pHYs 视为没有 DPI", () => {
    expect(readDpi(png([phys(1, 0)]))).toBeNull();
  });

  it("图像数据保持不变", () => {
    const src = png();
    const out = writeDpi(src, 96);
    expect(out.length).toBe(src.length + 21);
    expect(out.subarray(out.length - 27)).toEqual(src.subarray(src.length - 27));
  });
});

describe("JPEG", () => {
  it("改写已有 JFIF 头的密度，文件长度不变", () => {
    const src = Uint8Array.from([...SOI, ...jfif(1, 72, 72), ...dqt, ...SOS_EOI]);
    expect(readDpi(src)).toEqual({ x: 72, y: 72 });
    const out = writeDpi(src, 300);
    expect(out.length).toBe(src.length);
    expect(readDpi(out)).toEqual({ x: 300, y: 300 });
  });

  it("单位是每厘米时换算成每英寸", () => {
    expect(readDpi(Uint8Array.from([...SOI, ...jfif(2, 118, 118), ...SOS_EOI]))).toEqual({ x: 300, y: 300 });
    expect(readDpi(Uint8Array.from([...SOI, ...jfif(0, 1, 1), ...SOS_EOI]))).toBeNull();
  });

  it("没有 JFIF 头时在 SOI 后插入一个", () => {
    const src = Uint8Array.from([...SOI, ...dqt, ...SOS_EOI]);
    expect(readDpi(src)).toBeNull();
    const out = writeDpi(src, 200);
    expect(out.length).toBe(src.length + 18);
    expect([...out.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(out.subarray(20)).toEqual(src.subarray(2));
    expect(readDpi(out)).toEqual({ x: 200, y: 200 });
  });

  it("带 EXIF 时同时改写 EXIF 的分辨率", () => {
    const src = Uint8Array.from([...SOI, ...exif(72), ...dqt, ...SOS_EOI]);
    expect(readDpi(src)).toEqual({ x: 72, y: 72 });
    const out = writeDpi(src, 300);
    // 去掉插入的 JFIF 头后，只读 EXIF 也应该是 300
    const exifOnly = Uint8Array.from([...out.subarray(0, 2), ...out.subarray(20)]);
    expect(readDpi(exifOnly)).toEqual({ x: 300, y: 300 });
    expect(readDpi(out)).toEqual({ x: 300, y: 300 });
  });

  it("EXIF 单位是厘米时换算并改为英寸", () => {
    const src = Uint8Array.from([...SOI, ...exif(118, 3), ...SOS_EOI]);
    expect(readDpi(src)).toEqual({ x: 300, y: 300 });
    const out = writeDpi(src, 96);
    expect(readDpi(Uint8Array.from([...out.subarray(0, 2), ...out.subarray(20)]))).toEqual({ x: 96, y: 96 });
  });
});

describe("writeDpi", () => {
  it("DPI 限制在 1 ~ 65535 并取整", () => {
    const src = Uint8Array.from([...SOI, ...SOS_EOI]);
    expect(readDpi(writeDpi(src, 0))).toEqual({ x: 1, y: 1 });
    expect(readDpi(writeDpi(src, 99999))).toEqual({ x: 65535, y: 65535 });
    expect(readDpi(writeDpi(src, 299.6))).toEqual({ x: 300, y: 300 });
  });
});

describe("printSizeCm", () => {
  it("按 DPI 换算厘米", () => {
    expect(printSizeCm(300, 300)).toBe(2.5);
    expect(printSizeCm(3000, 300)).toBe(25.4);
  });
});
