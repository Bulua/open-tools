/**
 * 图片 AI 模型与推理模块前后端通信类型定义。
 */

export type AiSource = "auto" | "modelscope" | "huggingface";

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

export interface AiModelProgress {
  done: number;
  total: number;
}

export interface ModelInput {
  data: Float32Array | Uint8Array;
  shape: number[];
}
