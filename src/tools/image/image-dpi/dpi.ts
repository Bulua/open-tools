/**
 * 读取和改写图片文件里记录的 DPI，直接处理文件字节，不重新编码，像素和画质完全不变。
 * - PNG：pHYs 块（单位是每米像素数）
 * - JPEG：JFIF APP0 的密度字段，没有 JFIF 头时插入一个；带 EXIF 时同时改写 EXIF 里的分辨率
 */

export type DpiFormat = "png" | "jpeg";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const INCH = 0.0254; // 1 英寸 = 0.0254 米

/** 可以写入的 DPI 范围（JPEG 的密度字段是 16 位） */
export const MIN_DPI = 1;
export const MAX_DPI = 65535;

/** 按文件头判断格式，不支持的格式返回 null */
export function dpiFormatOf(bytes: Uint8Array): DpiFormat | null {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}

/** 读取图片记录的 DPI；没有记录（或只记录了宽高比）时返回 null */
export function readDpi(bytes: Uint8Array): { x: number; y: number } | null {
  const format = dpiFormatOf(bytes);
  if (format === "png") return readPngDpi(bytes);
  if (format === "jpeg") return readJpegDpi(bytes);
  return null;
}

/** 写入 DPI，返回新的文件字节；不支持的格式会抛出错误 */
export function writeDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  const value = Math.min(MAX_DPI, Math.max(MIN_DPI, Math.round(dpi)));
  const format = dpiFormatOf(bytes);
  if (format === "png") return writePngDpi(bytes, value);
  if (format === "jpeg") return writeJpegDpi(bytes, value);
  throw new Error("Unsupported image format");
}

/** 按 DPI 换算打印尺寸（厘米），保留一位小数 */
export const printSizeCm = (pixels: number, dpi: number) => Math.round((pixels / dpi) * 25.4) / 10;

// ---------- 通用 ----------

const u16 = (b: Uint8Array, p: number) => (b[p] << 8) | b[p + 1];
const u32 = (b: Uint8Array, p: number) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
const ascii = (b: Uint8Array, p: number, n: number) => String.fromCharCode(...b.subarray(p, p + n));

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** PNG 块使用的 CRC32 */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- PNG ----------

interface PngChunk {
  type: string;
  /** 块在文件中的起始位置（长度字段处） */
  start: number;
  /** 整个块的字节数：长度 4 + 类型 4 + 数据 + CRC 4 */
  size: number;
  dataStart: number;
  dataLength: number;
}

function pngChunks(bytes: Uint8Array): PngChunk[] {
  const chunks: PngChunk[] = [];
  let p = 8;
  while (p + 12 <= bytes.length) {
    const dataLength = u32(bytes, p);
    const type = ascii(bytes, p + 4, 4);
    const size = 12 + dataLength;
    if (p + size > bytes.length) break;
    chunks.push({ type, start: p, size, dataStart: p + 8, dataLength });
    p += size;
    if (type === "IEND") break;
  }
  return chunks;
}

function readPngDpi(bytes: Uint8Array) {
  const phys = pngChunks(bytes).find((c) => c.type === "pHYs" && c.dataLength >= 9);
  if (!phys || bytes[phys.dataStart + 8] !== 1) return null; // 单位 1 = 米，0 = 只有宽高比
  return {
    x: Math.round(u32(bytes, phys.dataStart) * INCH),
    y: Math.round(u32(bytes, phys.dataStart + 4) * INCH),
  };
}

function makePhysChunk(dpi: number): Uint8Array {
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  const ppm = Math.round(dpi / INCH);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // 单位：米
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

/** 去掉原有的 pHYs，在 IHDR 之后插入新的（pHYs 必须在 IDAT 之前） */
function writePngDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  const chunks = pngChunks(bytes);
  const ihdr = chunks[0];
  if (!ihdr || ihdr.type !== "IHDR") throw new Error("Invalid PNG file");

  const parts: Uint8Array[] = [bytes.subarray(0, ihdr.start + ihdr.size), makePhysChunk(dpi)];
  let p = ihdr.start + ihdr.size;
  for (const c of chunks.slice(1)) {
    if (c.type === "pHYs") {
      parts.push(bytes.subarray(p, c.start));
      p = c.start + c.size;
    }
  }
  parts.push(bytes.subarray(p));
  return concat(parts);
}

// ---------- JPEG ----------

interface JpegSegment {
  marker: number;
  /** 段在文件中的起始位置（0xFF 处） */
  start: number;
  /** 段数据的起始位置（长度字段之后） */
  dataStart: number;
  dataLength: number;
}

/** 列出图像数据（SOS）之前的所有段 */
function jpegSegments(bytes: Uint8Array): JpegSegment[] {
  const segments: JpegSegment[] = [];
  let p = 2;
  while (p + 4 <= bytes.length && bytes[p] === 0xff) {
    const marker = bytes[p + 1];
    if (marker === 0xff) {
      p++; // 填充字节
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // SOS / EOI
    const length = u16(bytes, p + 2);
    if (length < 2 || p + 2 + length > bytes.length) break;
    segments.push({ marker, start: p, dataStart: p + 4, dataLength: length - 2 });
    p += 2 + length;
  }
  return segments;
}

const isJfif = (bytes: Uint8Array, s: JpegSegment) => s.marker === 0xe0 && s.dataLength >= 14 && ascii(bytes, s.dataStart, 5) === "JFIF\0";
const isExif = (bytes: Uint8Array, s: JpegSegment) => s.marker === 0xe1 && s.dataLength >= 14 && ascii(bytes, s.dataStart, 6) === "Exif\0\0";

function readJpegDpi(bytes: Uint8Array) {
  const segments = jpegSegments(bytes);
  const jfif = segments.find((s) => isJfif(bytes, s));
  if (jfif) {
    const units = bytes[jfif.dataStart + 7];
    const x = u16(bytes, jfif.dataStart + 8);
    const y = u16(bytes, jfif.dataStart + 10);
    // 单位 1 = 每英寸，2 = 每厘米，0 = 只有宽高比
    if (units === 1 && x && y) return { x, y };
    if (units === 2 && x && y) return { x: Math.round(x * 2.54), y: Math.round(y * 2.54) };
  }
  const exif = segments.find((s) => isExif(bytes, s));
  return exif ? readExifDpi(bytes, exif) : null;
}

function writeJpegDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  const out = bytes.slice();
  const segments = jpegSegments(out);
  for (const s of segments) if (isExif(out, s)) writeExifDpi(out, s, dpi);

  const jfif = segments.find((s) => isJfif(out, s));
  if (jfif) {
    out[jfif.dataStart + 7] = 1; // 单位：每英寸
    out.set([dpi >> 8, dpi & 0xff, dpi >> 8, dpi & 0xff], jfif.dataStart + 8);
    return out;
  }
  // 没有 JFIF 头：紧跟在 SOI 之后插入一个
  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, // APP0、长度 16、"JFIF\0"
    0x01, 0x01, // 版本 1.01
    0x01, dpi >> 8, dpi & 0xff, dpi >> 8, dpi & 0xff, // 单位每英寸、横向和纵向密度
    0x00, 0x00, // 不带缩略图
  ]);
  return concat([out.subarray(0, 2), app0, out.subarray(2)]);
}

// ---------- EXIF（JPEG 的 APP1 段，TIFF 结构） ----------

const TAG_X_RESOLUTION = 0x011a;
const TAG_Y_RESOLUTION = 0x011b;
const TAG_RESOLUTION_UNIT = 0x0128;

/** 遍历 EXIF 第一个 IFD（主图）里与分辨率有关的条目 */
function exifResolutionEntries(bytes: Uint8Array, s: JpegSegment) {
  const tiff = s.dataStart + 6;
  const end = s.dataStart + s.dataLength;
  if (tiff + 8 > end) return null;
  const little = bytes[tiff] === 0x49; // "II" 小端，"MM" 大端
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const rd16 = (p: number) => view.getUint16(p, little);
  const rd32 = (p: number) => view.getUint32(p, little);

  const ifd = tiff + rd32(tiff + 4);
  if (ifd + 2 > end) return null;
  const count = rd16(ifd);
  const entries: { tag: number; type: number; valuePos: number }[] = [];
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) break;
    const tag = rd16(e);
    if (tag !== TAG_X_RESOLUTION && tag !== TAG_Y_RESOLUTION && tag !== TAG_RESOLUTION_UNIT) continue;
    const type = rd16(e + 2);
    // RATIONAL（8 字节）放在别处，条目里是偏移；SHORT 直接放在条目里
    const valuePos = type === 5 ? tiff + rd32(e + 8) : e + 8;
    if (valuePos + (type === 5 ? 8 : 2) > end) continue;
    entries.push({ tag, type, valuePos });
  }
  return { entries, view, little };
}

function readExifDpi(bytes: Uint8Array, s: JpegSegment) {
  const found = exifResolutionEntries(bytes, s);
  if (!found) return null;
  const { entries, view, little } = found;
  const rational = (tag: number) => {
    const e = entries.find((x) => x.tag === tag && x.type === 5);
    if (!e) return 0;
    const den = view.getUint32(e.valuePos + 4, little);
    return den ? view.getUint32(e.valuePos, little) / den : 0;
  };
  const unitEntry = entries.find((x) => x.tag === TAG_RESOLUTION_UNIT && x.type === 3);
  const unit = unitEntry ? view.getUint16(unitEntry.valuePos, little) : 2; // 默认是英寸
  const x = rational(TAG_X_RESOLUTION);
  const y = rational(TAG_Y_RESOLUTION);
  if (!x || !y || (unit !== 2 && unit !== 3)) return null;
  const k = unit === 3 ? 2.54 : 1; // 3 = 每厘米
  return { x: Math.round(x * k), y: Math.round(y * k) };
}

/** 原位改写 EXIF 的分辨率（数值长度不变，不移动任何数据） */
function writeExifDpi(bytes: Uint8Array, s: JpegSegment, dpi: number) {
  const found = exifResolutionEntries(bytes, s);
  if (!found) return;
  const { entries, view, little } = found;
  for (const e of entries) {
    if (e.type === 5 && (e.tag === TAG_X_RESOLUTION || e.tag === TAG_Y_RESOLUTION)) {
      view.setUint32(e.valuePos, dpi, little);
      view.setUint32(e.valuePos + 4, 1, little);
    } else if (e.type === 3 && e.tag === TAG_RESOLUTION_UNIT) {
      view.setUint16(e.valuePos, 2, little); // 英寸
    }
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
