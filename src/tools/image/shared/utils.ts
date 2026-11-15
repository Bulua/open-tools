/** 图片工具共用的函数。纯计算部分（尺寸、ICO、调色板）不依赖浏览器，便于测试 */
import { t } from "@/locales";

export type ImageFormat = "image/jpeg" | "image/png" | "image/webp";

export const IMAGE_FORMATS: { value: ImageFormat; label: string; ext: string; lossy: boolean }[] = [
  { value: "image/jpeg", label: "JPG", ext: "jpg", lossy: true },
  { value: "image/png", label: "PNG", ext: "png", lossy: false },
  { value: "image/webp", label: "WebP", ext: "webp", lossy: true },
];

export const formatInfo = (format: ImageFormat) => IMAGE_FORMATS.find((f) => f.value === format)!;

/** 把文件扩展名换成新的：photo.jpeg + webp → photo.webp */
export const replaceExtension = (name: string, ext: string) => `${name.replace(/\.[^./\\]+$/, "") || "image"}.${ext}`;

/** 原图的格式，不支持的格式（如 GIF、BMP）按 PNG 输出 */
export const outputFormatOf = (mime: string): ImageFormat =>
  IMAGE_FORMATS.some((f) => f.value === mime) ? (mime as ImageFormat) : "image/png";

// ---------- 尺寸 ----------

/** 等比缩小到不超过最大宽高（0 表示不限制），不会放大 */
export function fitSize(width: number, height: number, maxWidth = 0, maxHeight = 0) {
  let scale = 1;
  if (maxWidth > 0) scale = Math.min(scale, maxWidth / width);
  if (maxHeight > 0) scale = Math.min(scale, maxHeight / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// ---------- 浏览器相关 ----------

/** 读取图片文件，得到可以绘制到 canvas 的图片 */
export function loadImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(t("image.loadFailed")));
    };
    img.src = url;
  });
}

/** 新建指定大小的 canvas */
export function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d")! };
}

/** canvas 导出为文件字节；JPG 不支持透明，透明区域填充白色 */
export async function canvasToBytes(source: HTMLCanvasElement, format: ImageFormat, quality = 0.9): Promise<Uint8Array> {
  let canvas = source;
  if (format === "image/jpeg") {
    const { canvas: flat, ctx } = createCanvas(source.width, source.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(source, 0, 0);
    canvas = flat;
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, quality));
  if (!blob) throw new Error(t("image.exportFailed"));
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------- ICO ----------

/**
 * 把多张 PNG 打包成一个 .ico 文件（Windows Vista 起支持直接内嵌 PNG）。
 * 每张图片需要是正方形，size 最大 256。
 */
export function writeIco(images: { size: number; png: Uint8Array }[]): Uint8Array {
  const headerSize = 6 + images.length * 16;
  const total = headerSize + images.reduce((sum, i) => sum + i.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0, true); // 保留
  view.setUint16(2, 1, true); // 类型：1 = 图标
  view.setUint16(4, images.length, true);

  let offset = headerSize;
  images.forEach((img, i) => {
    const entry = 6 + i * 16;
    out[entry] = img.size >= 256 ? 0 : img.size; // 宽，0 表示 256
    out[entry + 1] = img.size >= 256 ? 0 : img.size; // 高
    out[entry + 2] = 0; // 调色板颜色数
    out[entry + 3] = 0; // 保留
    view.setUint16(entry + 4, 1, true); // 颜色平面
    view.setUint16(entry + 6, 32, true); // 每像素位数
    view.setUint32(entry + 8, img.png.length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(img.png, offset);
    offset += img.png.length;
  });
  return out;
}

// ---------- 主色调 ----------

export interface PaletteColor {
  r: number;
  g: number;
  b: number;
  /** 占比 0 ~ 1 */
  ratio: number;
}

/**
 * 从像素数据（RGBA）中提取主要颜色：
 * 先把颜色量化到 4096 个格子计数，再合并相近的颜色，按占比从高到低返回。
 */
export function extractPalette(pixels: Uint8ClampedArray | Uint8Array, count = 8): PaletteColor[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue; // 跳过透明像素
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n++;
    buckets.set(key, bucket);
    total++;
  }

  const sorted = [...buckets.values()]
    .map((b) => ({ r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n), n: b.n }))
    .sort((a, b) => b.n - a.n);

  // 与已选颜色太接近的合并进去，避免出现一排几乎一样的颜色
  const picked: { r: number; g: number; b: number; n: number }[] = [];
  for (const c of sorted) {
    const near = picked.find((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < 40);
    if (near) near.n += c.n;
    else if (picked.length < count) picked.push({ ...c });
  }
  return picked.sort((a, b) => b.n - a.n).map(({ r, g, b, n }) => ({ r, g, b, ratio: total ? n / total : 0 }));
}
