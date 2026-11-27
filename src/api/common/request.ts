/**
 * 全应用统一的 Rust 后端 IPC 请求基础层与统一错误拦截器。
 *
 * 所有模块/工具统一通过本文件与后端通信：
 * - `executeGeneratedCommand`：包装 `tauri-specta` 自动生成的强类型命令，统一校验 `{ code, msg, data }` 并解包；
 * - `requestBackend` / `requestBackendStream` / `subscribeBackendEvent`：兼容尚未接入 specta 的命令与二进制上传。
 */
import type { InvokeOptions } from "@tauri-apps/api/core";
import type { ApiResponsePayload, AppErrorCode, BackendRequestOptions } from "@/types/common";

const KNOWN_ERROR_CODES = new Set<AppErrorCode>([
  "invalidInput",
  "notFound",
  "unauthorized",
  "network",
  "provider",
  "cancelled",
  "busy",
  "io",
  "internal",
]);

/** 统一的前端后端调用异常类（自动解析 Rust `{ code, msg, data }` 与旧版字符串错误） */
export class BackendError extends Error {
  readonly code: AppErrorCode;
  readonly raw: unknown;

  constructor(code: AppErrorCode, message: string, raw?: unknown) {
    super(message);
    this.name = "BackendError";
    this.code = code;
    this.raw = raw;
  }
}

export function normalizeBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  if (error && typeof error === "object") {
    const rec = error as Record<string, unknown>;
    const rawMessage =
      typeof rec.msg === "string" && rec.msg.trim()
        ? rec.msg
        : typeof rec.message === "string" && rec.message.trim()
          ? rec.message
          : "";
    if (rawMessage) {
      const code =
        typeof rec.code === "string" && KNOWN_ERROR_CODES.has(rec.code as AppErrorCode)
          ? (rec.code as AppErrorCode)
          : "internal";
      return new BackendError(code, rawMessage.trim(), error);
    }
  }
  if (error instanceof Error) {
    return new BackendError("internal", error.message || "Unknown backend error", error);
  }
  const text = typeof error === "string" ? error.trim() : String(error ?? "");
  return new BackendError("internal", text || "Unknown backend error", error);
}

/** 统一校验并解包 Rust `{ code, msg, data }` 响应包装 */
export function unwrapApiResponse<TResult>(res: ApiResponsePayload<TResult>): TResult {
  if (res.code === "ok") {
    return res.data as TResult;
  }
  throw new BackendError(res.code, res.msg.trim() || "Unknown backend error", res);
}

/** 判断当前是否运行在 Tauri 桌面运行时 */
export function hasDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 包装 `tauri-specta` 自动生成的强类型命令，统一处理桌面运行态检查、`{ code, msg, data }` 解包与错误归一化 */
export async function executeGeneratedCommand<TResult>(
  runner: () => Promise<ApiResponsePayload<TResult>>,
  fallback?: () => TResult | Promise<TResult>,
): Promise<TResult> {
  if (!hasDesktopRuntime()) {
    if (fallback) return fallback();
    throw new BackendError("internal", "This operation requires the desktop application runtime.");
  }
  try {
    const res = await runner();
    return unwrapApiResponse(res);
  } catch (error) {
    throw normalizeBackendError(error);
  }
}

/** 统一的一元后端命令调用（支持 JSON 参数与 ArrayBuffer/Uint8Array 二进制载荷） */
export async function requestBackend<TResult>(
  command: string,
  payload?: Record<string, unknown> | ArrayBuffer | Uint8Array,
  options?: BackendRequestOptions<TResult>,
): Promise<TResult> {
  if (!hasDesktopRuntime()) {
    if (options?.fallback) {
      return options.fallback();
    }
    throw new BackendError(
      "internal",
      `Command "${command}" requires the desktop application runtime.`,
    );
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeOptions: InvokeOptions | undefined = options?.headers
      ? { headers: options.headers }
      : undefined;
    return await invoke<TResult>(command, payload, invokeOptions);
  } catch (error) {
    throw normalizeBackendError(error);
  }
}

/** 统一的流式后端命令调用（基于 Tauri Channel 实时接收后端推送事件） */
export async function requestBackendStream<TResult, TEvent>(
  command: string,
  payload: Record<string, unknown>,
  onEvent: (event: TEvent) => void,
  channelKey = "onEvent",
): Promise<TResult> {
  if (!hasDesktopRuntime()) {
    throw new BackendError(
      "internal",
      `Streaming command "${command}" requires the desktop application runtime.`,
    );
  }
  try {
    const { Channel, invoke } = await import("@tauri-apps/api/core");
    const channel = new Channel<TEvent>();
    channel.onmessage = onEvent;
    return await invoke<TResult>(command, { ...payload, [channelKey]: channel });
  } catch (error) {
    throw normalizeBackendError(error);
  }
}

/** 统一的后端广播事件订阅（非桌面运行态自动返回空取消函数） */
export async function subscribeBackendEvent<TPayload = unknown>(
  eventName: string,
  handler: (payload: TPayload) => void,
): Promise<() => void> {
  if (!hasDesktopRuntime()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<TPayload>(eventName, (event) => handler(event.payload));
}
