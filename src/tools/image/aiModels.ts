import { isTauri } from "@tauri-apps/api/core";
import u2netpUrl from "@/assets/models/u2netp.onnx?url";

/**
 * AI 抠图模型（来自开源项目 rembg，均可免费商用）。
 * u2netp 随程序内置；其他模型较大，由用户选择下载到本机，之后离线使用。
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
  builtin?: boolean;
}

const IMAGENET = { mean: [0.485, 0.456, 0.406] as [number, number, number], std: [0.229, 0.224, 0.225] as [number, number, number] };

export const AI_MODELS: AiModel[] = [
  { id: "u2netp", name: "轻量", desc: "内置，速度快，边缘稍粗", size: 4574861, input: 320, ...IMAGENET, builtin: true },
  { id: "silueta", name: "标准", desc: "效果较好，速度较快", size: 44173029, input: 320, ...IMAGENET },
  { id: "isnet-general-use", name: "精细", desc: "效果最好，头发等细节更清楚，识别较慢", size: 178648008, input: 1024, mean: [0.5, 0.5, 0.5], std: [1, 1, 1] },
  { id: "u2net_human_seg", name: "人像", desc: "专门识别人物，适合证件照、人像照片", size: 175997641, input: 320, ...IMAGENET },
];

export const modelById = (id: string) => AI_MODELS.find((m) => m.id === id) ?? AI_MODELS[0];

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

// ---------- 模型文件：内置的直接读取，其他的由桌面版下载到本机 ----------

export const canDownload = () => isTauri();

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** 已下载到本机的模型 id */
export async function downloadedModels(): Promise<string[]> {
  return isTauri() ? invoke<string[]>("ai_models_downloaded").catch(() => []) : [];
}

/** 下载模型；onProgress 收到 0～1 的进度 */
export async function downloadModel(model: AiModel, onProgress: (ratio: number) => void): Promise<void> {
  const timer = window.setInterval(async () => {
    const bytes = await invoke<number>("ai_model_progress", { id: model.id }).catch(() => 0);
    onProgress(Math.min(0.99, bytes / model.size));
  }, 500);
  try {
    await invoke("ai_model_download", { id: model.id });
    onProgress(1);
  } finally {
    clearInterval(timer);
  }
}

export const deleteModel = (model: AiModel) => invoke("ai_model_delete", { id: model.id });

/** 读取模型文件内容 */
export async function loadModelBytes(model: AiModel): Promise<ArrayBuffer> {
  if (model.builtin) return (await fetch(u2netpUrl)).arrayBuffer();
  return invoke<ArrayBuffer>("ai_model_read", { id: model.id });
}
