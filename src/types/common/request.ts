/**
 * 全应用通用前后端通信与统一错误类型定义。
 */
import type { AppError as GeneratedAppError, AppErrorCode as GeneratedAppErrorCode } from "@/api/generated/ai";

export type AppErrorCode = GeneratedAppErrorCode;
export type AppErrorPayload = GeneratedAppError;

export interface BackendRequestOptions<TResult = unknown> {
  /** 非桌面运行态（如纯浏览器预览/单元测试）时的回退实现 */
  fallback?: () => TResult | Promise<TResult>;
  /** 二进制请求等场景附带的自定义请求头 */
  headers?: Record<string, string>;
}
