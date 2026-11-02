import * as pdfjs from "pdfjs-dist";
import { openPdf } from "./pdfjs";
import { buildDocx, isBoldFont, isItalicFont, layoutPage, wordFont, type PageImage, type PageLayout, type TextPiece } from "./pdfToWord";

/**
 * 用 PDF.js 读出每一页的文字（位置、字号、字体）和图片，交给 pdfToWord 排版生成 .docx。
 */
type Page = Awaited<ReturnType<Awaited<ReturnType<typeof openPdf>>["getPage"]>>;
type Matrix = number[];
interface ImageData {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8ClampedArray;
  bitmap?: ImageBitmap;
}
interface FontInfo {
  name?: string;
  bold?: boolean;
  black?: boolean;
  italic?: boolean;
}

/** 读取 PDF.js 解析好的对象（字体、图片）；对象一直没有出现时返回 null，不让转换卡住 */
function objectOf<T>(page: Page, id: string): Promise<T | null> {
  const objs = id.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000);
    objs.get(id, (v: T) => {
      clearTimeout(timer);
      resolve(v);
    });
  });
}

/**
 * PDF.js 的图片数据画到画布上（三种像素格式：1 位灰度、RGB、RGBA，或者已经解码好的位图）。
 * 图片比显示大小清晰很多时（例如扫描件）缩小到 maxWidth，编码快、生成的文档也小
 */
function imageCanvas(img: ImageData, maxWidth: number) {
  const { width, height } = img;
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
    return shrink(canvas, maxWidth);
  }
  const src = img.data;
  if (!src) return null;
  const out = ctx.createImageData(width, height);
  const d = out.data;
  if (img.kind === pdfjs.ImageKind.RGBA_32BPP) d.set(src.subarray(0, d.length));
  else if (img.kind === pdfjs.ImageKind.RGB_24BPP) {
    for (let i = 0, j = 0; j < d.length; i += 3, j += 4) {
      d[j] = src[i];
      d[j + 1] = src[i + 1];
      d[j + 2] = src[i + 2];
      d[j + 3] = 255;
    }
  } else if (img.kind === pdfjs.ImageKind.GRAYSCALE_1BPP) {
    // 每行按字节对齐，位为 1 是白色
    const row = (width + 7) >> 3;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const v = src[y * row + (x >> 3)] & (128 >> (x & 7)) ? 255 : 0;
        const j = (y * width + x) * 4;
        d[j] = d[j + 1] = d[j + 2] = v;
        d[j + 3] = 255;
      }
  } else return null;
  ctx.putImageData(out, 0, 0);
  return shrink(canvas, maxWidth);
}

function shrink(canvas: HTMLCanvasElement, maxWidth: number) {
  if (canvas.width <= maxWidth * 1.2) return canvas;
  const small = document.createElement("canvas");
  small.width = Math.round(maxWidth);
  small.height = Math.max(1, Math.round((canvas.height * maxWidth) / canvas.width));
  const ctx = small.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  return small;
}

/** 图片按 200 DPI 保存就足够清晰 */
const DPI = 200;

async function encodeImage(img: ImageData, displayWidth: number): Promise<Pick<PageImage, "data" | "type"> | null> {
  const canvas = imageCanvas(img, Math.max(64, (displayWidth / 72) * DPI));
  if (!canvas) return null;
  // 可能有透明部分的用 PNG，其他用 JPEG（照片、扫描件小得多）
  const png = !!img.bitmap || img.kind === pdfjs.ImageKind.RGBA_32BPP;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, png ? "image/png" : "image/jpeg", 0.92));
  return blob ? { data: new Uint8Array(await blob.arrayBuffer()), type: png ? "png" : "jpg" } : null;
}

/** 跟踪变换矩阵，找出页面上画的每一张图片和它的位置 */
async function readImages(page: Page, viewport: Matrix, ops: { fnArray: number[]; argsArray: unknown[][] }): Promise<PageImage[]> {
  const { OPS, Util } = pdfjs;
  const images: PageImage[] = [];
  let ctm = viewport;
  const stack: Matrix[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = Util.transform(ctm, args as Matrix);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (args[0]) ctm = Util.transform(ctm, args[0] as Matrix);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      // 图片画在单位正方形里，四个角经过变换后就是图片在页面上的范围
      const corners = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map((p) => Util.applyTransform(p, ctm));
      const xs = corners.map((p) => p[0]);
      const ys = corners.map((p) => p[1]);
      const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      if (box.width < 8 || box.height < 8) continue;
      const img = fn === OPS.paintImageXObject ? await objectOf<ImageData>(page, args[0] as string) : (args[0] as ImageData);
      const encoded = img && (await encodeImage(img, box.width).catch(() => null));
      if (encoded) images.push({ ...encoded, ...box });
    }
  }
  return images;
}

async function readPage(page: Page): Promise<PageLayout> {
  const viewport = page.getViewport({ scale: 1 });
  // 先解析绘制指令：字体、图片在这一步载入
  const ops = await page.getOperatorList();
  const content = await page.getTextContent();

  const fonts = new Map<string, FontInfo | null>();
  const pieces: TextPiece[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str) continue;
    const tx = pdfjs.Util.transform(viewport.transform, item.transform);
    // 只要横排的文字：斜着的多半是水印，竖排的无法按行还原
    if (tx[0] <= 0 || Math.abs(tx[1]) > Math.abs(tx[0]) * 0.2) continue;
    if (!fonts.has(item.fontName)) {
      const f = await objectOf<FontInfo>(page, item.fontName);
      fonts.set(item.fontName, f && typeof f === "object" ? f : null);
    }
    const font = fonts.get(item.fontName);
    const name = font?.name ?? content.styles[item.fontName]?.fontFamily;
    pieces.push({
      text: item.str,
      x: tx[4],
      y: tx[5],
      width: item.width,
      size: Math.hypot(tx[2], tx[3]),
      bold: !!(font?.bold || font?.black) || isBoldFont(name),
      italic: !!font?.italic || isItalicFont(name),
      font: wordFont(name),
    });
  }
  const images = await readImages(page, viewport.transform, ops);
  return layoutPage(viewport.width, viewport.height, pieces, images);
}

export interface PdfToDocxResult {
  docx: Uint8Array;
  pages: number;
  /** 没有文字的页数（扫描件），这些页只能得到图片 */
  textless: number;
}

/** PDF 转 .docx；onProgress 报告已处理的页数 */
export async function pdfToDocx(data: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<PdfToDocxResult> {
  const doc = await openPdf(data, { readOnly: true });
  try {
    const layouts: PageLayout[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      layouts.push(await readPage(page));
      page.cleanup();
      onProgress?.(i, doc.numPages);
    }
    const textless = layouts.filter((l) => !l.blocks.some((b) => b.kind === "text")).length;
    return { docx: await buildDocx(layouts), pages: doc.numPages, textless };
  } finally {
    await doc.destroy();
  }
}
