import { t } from "@/locales";
import { createCanvas } from "./utils";
import { runModelRaw, type ModelInput } from "./aiModels";
import type { Box } from "./effects";

/**
 * AI 修补（去水印）：把涂抹的区域交给修补模型补全。
 * 大图只裁出涂抹区域附近的一块，缩放到模型输入尺寸，修补后再贴回原图，只替换涂抹过的像素。
 * 模型在桌面版的 Rust 里运行，和抠图模型一样由用户选择下载（见 aiModels.ts）。
 */
export interface InpaintModel {
  id: "migan" | "lama";
  /** 文件大小（字节） */
  size: number;
}

/**
 * 两个模型都是 512 × 512 输入：
 * - MI-GAN（MIT）：uint8 图片和蒙版（0 是要修补的区域，255 是保留的区域），输出 uint8 图片；
 * - LaMa（Apache-2.0）：图片是 0～1 的 float32，蒙版 1 是要修补的区域，输出 0～255 的 float32 图片。
 */
export const INPAINT_MODELS: InpaintModel[] = [
  { id: "migan", size: 29546882 },
  { id: "lama", size: 208044816 },
];

/** 模型输入的边长 */
export const INPAINT_SIZE = 512;

// ---------- 纯计算 ----------

/** 蒙版（每个像素一个值，大于 0 表示涂抹过）里涂抹区域的外接框；没有涂抹时为空 */
export function maskBounds(mask: ArrayLike<number>, width: number, height: number): Box | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (!mask[row + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * 要交给模型的区域：以涂抹区域为中心的正方形，四周留出和涂抹区域差不多大的背景作为参考，
 * 至少 size × size（小水印不缩放，最清晰）；超出图片时往里移，比图片还大时按图片边界截断。
 */
export function inpaintRegion(bounds: Box, width: number, height: number, size = INPAINT_SIZE): Box {
  const side = Math.max(size, Math.ceil(Math.max(bounds.w, bounds.h) * 2));
  const place = (start: number, length: number, total: number) => {
    const len = Math.min(side, total);
    const from = Math.round(start + length / 2 - len / 2);
    return [Math.max(0, Math.min(total - len, from)), len];
  };
  const [x, w] = place(bounds.x, bounds.w, width);
  const [y, h] = place(bounds.y, bounds.h, height);
  return { x, y, w, h };
}

/**
 * 贴回原图时用的透明度：涂抹区域向外扩 radius 像素后再柔化，
 * 涂抹过的像素完全用修补结果（水印边缘不会残留），往外 2 × radius 像素内逐渐过渡到原图。
 */
export function featherMask(mask: ArrayLike<number>, width: number, height: number, radius: number): Uint8ClampedArray {
  const n = width * height;
  let cur: Float32Array = new Float32Array(n);
  for (let i = 0; i < n; i++) cur[i] = mask[i] ? 255 : 0;
  if (radius <= 0) return Uint8ClampedArray.from(cur);
  // 先按行、再按列：取范围内的最大值（扩大），再取平均值（柔化）
  const pass = (src: Float32Array, horizontal: boolean, op: "max" | "mean") => {
    const out = new Float32Array(n);
    const [len, lines] = horizontal ? [width, height] : [height, width];
    const at = (line: number, k: number) => (horizontal ? line * width + k : k * width + line);
    for (let line = 0; line < lines; line++) {
      for (let k = 0; k < len; k++) {
        let v = 0;
        let count = 0;
        for (let d = Math.max(0, k - radius); d <= Math.min(len - 1, k + radius); d++) {
          const s = src[at(line, d)];
          if (op === "max") v = Math.max(v, s);
          else v += s;
          count++;
        }
        out[at(line, k)] = op === "max" ? v : v / count;
      }
    }
    return out;
  };
  cur = pass(pass(cur, true, "max"), false, "max");
  cur = pass(pass(cur, true, "mean"), false, "mean");
  // 涂抹过的像素保证完全替换
  for (let i = 0; i < n; i++) if (mask[i]) cur[i] = 255;
  return Uint8ClampedArray.from(cur);
}

/** 按透明度把修补结果混合到原图像素上（RGBA，原图的透明度保持不变） */
export function blendPixels(original: Uint8ClampedArray, patch: Uint8ClampedArray, alpha: ArrayLike<number>): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(original.length);
  out.set(original);
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i] / 255;
    if (!a) continue;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = original[i * 4 + c] * (1 - a) + patch[i * 4 + c] * a;
  }
  return out;
}

/** RGBA 像素（size × size）和蒙版 → 模型输入 */
export function toModelInputs(model: InpaintModel, rgba: ArrayLike<number>, mask: ArrayLike<number>, size: number): ModelInput[] {
  const n = size * size;
  const shapes = [
    [1, 3, size, size],
    [1, 1, size, size],
  ];
  if (model.id === "migan") {
    const image = new Uint8Array(3 * n);
    const hole = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) image[c * n + i] = rgba[i * 4 + c];
      hole[i] = mask[i] ? 0 : 255;
    }
    return [
      { data: image, shape: shapes[0] },
      { data: hole, shape: shapes[1] },
    ];
  }
  const image = new Float32Array(3 * n);
  const hole = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) image[c * n + i] = rgba[i * 4 + c] / 255;
    hole[i] = mask[i] ? 1 : 0;
  }
  return [
    { data: image, shape: shapes[0] },
    { data: hole, shape: shapes[1] },
  ];
}

/** 模型输出（按通道排列的 3 × size × size，0～255）→ RGBA 像素 */
export function fromModelOutput(model: InpaintModel, output: ArrayBuffer, size: number): Uint8ClampedArray<ArrayBuffer> {
  const n = size * size;
  const data = model.id === "migan" ? new Uint8Array(output) : new Float32Array(output);
  if (data.length < 3 * n) throw new Error("Unexpected model output");
  const rgba = new Uint8ClampedArray(4 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = data[c * n + i];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

// ---------- 修补一张图片 ----------

/**
 * 修补 source 上 mask 涂抹过的区域（mask 是同样大小的画布，不透明的像素表示涂抹过），返回新的画布；没有涂抹时返回空
 */
export async function inpaint(source: HTMLCanvasElement, mask: HTMLCanvasElement, model: InpaintModel): Promise<HTMLCanvasElement | null> {
  const { width, height } = source;
  const maskData = mask.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = maskData[i * 4 + 3] > 0 ? 255 : 0;
  const bounds = maskBounds(alpha, width, height);
  if (!bounds) return null;
  const region = inpaintRegion(bounds, width, height);
  const size = INPAINT_SIZE;

  // 裁出区域缩放到模型输入尺寸；蒙版只要碰到一点就算要修补，水印边缘不会漏掉
  const { ctx: small } = createCanvas(size, size);
  small.imageSmoothingQuality = "high";
  small.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, size, size);
  const { ctx: smallMask } = createCanvas(size, size);
  smallMask.drawImage(mask, region.x, region.y, region.w, region.h, 0, 0, size, size);
  const holeData = smallMask.getImageData(0, 0, size, size).data;
  const hole = new Uint8Array(size * size);
  for (let i = 0; i < hole.length; i++) hole[i] = holeData[i * 4 + 3] > 0 ? 1 : 0;

  let output: ArrayBuffer;
  try {
    output = await runModelRaw(model.id, toModelInputs(model, small.getImageData(0, 0, size, size).data, hole, size));
  } catch (e) {
    throw new Error(t("image.inpaintFailed", { error: e instanceof Error ? e.message : String(e) }));
  }

  // 修补结果放大回区域尺寸，只把涂抹过的像素（边缘柔化）混合进原图
  const { canvas: outCanvas, ctx: outCtx } = createCanvas(size, size);
  outCtx.putImageData(new ImageData(fromModelOutput(model, output, size), size, size), 0, 0);
  const { ctx: patchCtx } = createCanvas(region.w, region.h);
  patchCtx.imageSmoothingQuality = "high";
  patchCtx.drawImage(outCanvas, 0, 0, region.w, region.h);
  const patch = patchCtx.getImageData(0, 0, region.w, region.h).data;

  const regionMask = new Uint8Array(region.w * region.h);
  for (let y = 0; y < region.h; y++) {
    for (let x = 0; x < region.w; x++) regionMask[y * region.w + x] = alpha[(region.y + y) * width + region.x + x];
  }
  // 区域缩小得越多，修补结果越模糊，过渡也放宽一些
  const radius = Math.max(2, Math.round((2 * Math.max(region.w, region.h)) / size));
  const blendAlpha = featherMask(regionMask, region.w, region.h, radius);

  const { canvas: result, ctx } = createCanvas(width, height);
  ctx.drawImage(source, 0, 0);
  const original = ctx.getImageData(region.x, region.y, region.w, region.h);
  ctx.putImageData(new ImageData(blendPixels(original.data, patch, blendAlpha), region.w, region.h), region.x, region.y);
  return result;
}
