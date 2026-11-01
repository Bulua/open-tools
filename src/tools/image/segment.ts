import { createCanvas } from "./utils";
import { loadModelBytes, toInputTensor, toMask, type AiModel } from "./aiModels";

/**
 * AI 抠图：调用后台线程中的模型，得到与原图同样大小的透明度蒙版。
 */
let worker: Worker | null = null;
/** 后台线程中已经加载的模型 */
const loaded = new Set<string>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./segment.worker.ts", import.meta.url), { type: "module" });
    loaded.clear();
  }
  return worker;
}

function run(model: AiModel, input: Float32Array, modelBytes?: ArrayBuffer): Promise<Float32Array> {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<{ ok: boolean; mask?: Float32Array; error?: string }>) =>
      e.data.ok ? resolve(e.data.mask!) : reject(new Error(`识别失败：${e.data.error}`));
    w.onerror = () => {
      worker?.terminate();
      worker = null;
      reject(new Error("识别失败，模型无法运行"));
    };
    w.postMessage({ modelId: model.id, modelBytes, input, size: model.input }, modelBytes ? [modelBytes] : []);
  });
}

/** 计算图片的前景蒙版（0～255，长度 width × height） */
export async function segment(image: CanvasImageSource, width: number, height: number, model: AiModel): Promise<Uint8ClampedArray> {
  const size = model.input;
  // 缩放到模型输入尺寸（与 rembg 一样直接拉伸，不保持比例）
  const { ctx: small } = createCanvas(size, size);
  small.imageSmoothingQuality = "high";
  small.drawImage(image, 0, 0, size, size);
  const input = toInputTensor(small.getImageData(0, 0, size, size).data, size, model.mean, model.std);

  const bytes = loaded.has(model.id) ? undefined : await loadModelBytes(model);
  const output = await run(model, input, bytes);
  loaded.add(model.id);

  // 蒙版放大回原图尺寸（平滑插值，边缘更自然）
  const mask = toMask(output);
  const { canvas: maskCanvas, ctx: maskCtx } = createCanvas(size, size);
  const img = maskCtx.createImageData(size, size);
  for (let i = 0; i < mask.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = mask[i];
    img.data[i * 4 + 3] = 255;
  }
  maskCtx.putImageData(img, 0, 0);
  const { ctx: full } = createCanvas(width, height);
  full.imageSmoothingQuality = "high";
  full.drawImage(maskCanvas, 0, 0, width, height);
  const data = full.getImageData(0, 0, width, height).data;
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4];
  return alpha;
}

/** 把蒙版应用到原图像素：蒙版作为透明度 */
export function applyMask(rgba: Uint8ClampedArray, alpha: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);
  for (let i = 0; i < alpha.length; i++) out[i * 4 + 3] = Math.round((rgba[i * 4 + 3] * alpha[i]) / 255);
  return out;
}
