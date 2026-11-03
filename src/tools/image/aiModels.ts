import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * AI 抠图模型（来自开源项目 rembg，均可免费商用）。
 * 都不随程序打包，由用户选择下载到本机，之后离线使用；模型在桌面版的 Rust 里运行。
 * 预处理与 rembg 一致：缩放到模型输入尺寸，按最大值归一化后减均值、除以标准差。
 */
export interface AiModel {
  id: string;
  name: string;
  desc: string;
  /** 文件大小（字节） */
  size: number;
  /** 模型输入的边长 */
  input: number;
  mean: [number, number, number];
  std: [number, number, number];
}

const IMAGENET = { mean: [0.485, 0.456, 0.406] as [number, number, number], std: [0.229, 0.224, 0.225] as [number, number, number] };

export const AI_MODELS: AiModel[] = [
  { id: "u2netp", name: "轻量", desc: "体积最小，速度快，边缘稍粗", size: 4574861, input: 320, ...IMAGENET },
  { id: "silueta", name: "标准", desc: "效果较好，速度较快", size: 44173029, input: 320, ...IMAGENET },
  { id: "isnet-general-use", name: "精细", desc: "效果最好，头发等细节更清楚，识别较慢", size: 178648008, input: 1024, mean: [0.5, 0.5, 0.5], std: [1, 1, 1] },
  { id: "u2net_human_seg", name: "人像", desc: "专门识别人物，适合证件照、人像照片", size: 175997641, input: 320, ...IMAGENET },
];

export const modelById = (id: string) => AI_MODELS.find((m) => m.id === id);

// ---------- 预处理 / 后处理（纯计算） ----------

/** RGBA 像素（已缩放到 size × size）→ 模型输入（NCHW，float32） */
export function toInputTensor(rgba: Uint8ClampedArray, size: number, mean: number[], std: number[]): Float32Array {
  const n = size * size;
  let max = 1e-6;
  for (let i = 0; i < n; i++) max = Math.max(max, rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[c * n + i] = (rgba[i * 4 + c] / max - mean[c]) / std[c];
  }
  return out;
}

/** 模型输出 → 0～255 的蒙版（按最小、最大值拉伸） */
export function toMask(output: Float32Array): Uint8ClampedArray {
  let min = Infinity;
  let max = -Infinity;
  for (const v of output) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const mask = new Uint8ClampedArray(output.length);
  for (let i = 0; i < output.length; i++) mask[i] = ((output[i] - min) / range) * 255;
  return mask;
}

// ---------- 模型文件与运行：都在桌面版的 Rust 里（见 src-tauri/src/ai_models.rs、inference.rs） ----------

/** 下载源：auto 先试国内的魔搭，失败时换 Hugging Face；选了其中一个时优先用它 */
export type AiSource = "auto" | "modelscope" | "huggingface";
export const AI_SOURCES: AiSource[] = ["auto", "modelscope", "huggingface"];

export interface AiStatus {
  /** 已下载的模型 id */
  models: string[];
  /** 运行环境是否已下载；第一次下载模型时会一起下载 */
  runtimeReady: boolean;
  /** 运行环境还要下载的大小（字节） */
  runtimeSize: number;
  /** 数据保存的位置 */
  dir: string;
}

export const canDownload = () => isTauri();

/** 模型和运行环境的下载情况 */
export async function aiStatus(): Promise<AiStatus> {
  const empty: AiStatus = { models: [], runtimeReady: false, runtimeSize: 0, dir: "" };
  return isTauri() ? invoke<AiStatus>("ai_status").catch(() => empty) : empty;
}

/** 下载模型（运行环境缺少的文件一起下载）；onProgress 收到 0～1 的进度 */
export async function downloadModel(model: AiModel, source: AiSource, onProgress: (ratio: number) => void): Promise<void> {
  const timer = window.setInterval(async () => {
    const p = await invoke<{ done: number; total: number }>("ai_model_progress", { id: model.id }).catch(() => null);
    if (p?.total) onProgress(Math.min(0.99, p.done / p.total));
  }, 500);
  try {
    await invoke("ai_model_download", { id: model.id, source: source === "auto" ? null : source });
    onProgress(1);
  } finally {
    clearInterval(timer);
  }
}

export const deleteModel = (model: AiModel) => invoke("ai_model_delete", { id: model.id });

/** 运行模型：输入 float32 张量及形状，返回第一个输出 */
export async function runModel(model: AiModel, input: Float32Array, shape: number[]): Promise<Float32Array> {
  const body = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const out = await invoke<ArrayBuffer>("ai_run", body, { headers: { "x-model": model.id, "x-shape": shape.join(",") } });
  return new Float32Array(out);
}
