import type { ToolDefinition } from "./client";
import { makeEntityId } from "./presets";

export type ToolApprovalPolicy = "auto" | "command" | "externalWrite";

export interface BuiltinToolDefinition extends ToolDefinition {
  approval: ToolApprovalPolicy;
}

export interface BuiltinAiContext {
  workspaceDir: string;
  systemPrompt: string;
  tools: BuiltinToolDefinition[];
}

export interface BuiltinToolRunResult {
  text: string;
  isError: boolean;
  outputFile?: {
    path: string;
    content: string;
    kind?: "text" | "image";
    sizeBytes?: number;
  };
}

export interface LocalImagePreview {
  path: string;
  mimeType: string;
  dataUrl: string;
  rawBase64?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface BuiltinToolPathCheck {
  resolvedPath: string;
  outsideWorkspace: boolean;
}

export type BuiltinToolTestExecutor = (
  toolName: string,
  args: Record<string, unknown>,
  workspaceDir: string,
  signal?: AbortSignal,
) => Promise<BuiltinToolRunResult>;

/**
 * 非桌面运行态（仅单元测试/浏览器预览兜底）使用的轻量上下文；
 * 桌面运行态下提示词、工具列表与执行实现均统一由 Rust 后端 `ai_builtin_context` / `ai_tool_execute` 提供。
 */
const FALLBACK_SYSTEM_PROMPT_HEAD = "你是个乐于助人ai助手。";
const FALLBACK_TOOL_DEFS: BuiltinToolDefinition[] = [
  {
    name: "list_dir",
    description: "List files and subdirectories in a directory.",
    parameters: { type: "object", properties: { path: { type: "string" } } },
    approval: "auto",
  },
  {
    name: "read_file",
    description: "Read a UTF-8/GBK text file with line numbers.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    approval: "auto",
  },
  {
    name: "write_file",
    description: "Create or overwrite a UTF-8 text file.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    approval: "externalWrite",
  },
  {
    name: "edit_file",
    description: "Replace an exact snippet in an existing text file.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
        replace_all: { type: "boolean" },
      },
      required: ["path", "old_text", "new_text"],
    },
    approval: "externalWrite",
  },
  {
    name: "run_command",
    description: "Execute a command on Windows (PowerShell / cmd).",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
        shell: { type: "string", enum: ["powershell", "cmd"] },
        cwd: { type: "string" },
        timeout_secs: { type: "integer" },
      },
      required: ["command"],
    },
    approval: "command",
  },
];

let testExecutor: BuiltinToolTestExecutor | null = null;
let testContextProvider: ((conversationId: string, customDir?: string) => Promise<BuiltinAiContext>) | null = null;

export function setBuiltinToolTestExecutor(executor: BuiltinToolTestExecutor | null): void {
  testExecutor = executor;
}

export function setBuiltinContextTestProvider(
  provider: ((conversationId: string, customDir?: string) => Promise<BuiltinAiContext>) | null,
): void {
  testContextProvider = provider;
}

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

/** 从 Rust 后端获取当前会话的工作目录、系统提示词与所有已注册内置工具定义 */
export async function loadBuiltinAiContext(
  conversationId: string,
  customDir?: string,
): Promise<BuiltinAiContext> {
  if (testContextProvider) {
    return testContextProvider(conversationId, customDir);
  }
  const trimmed = customDir?.trim() || "";
  if (hasTauriRuntime()) {
    return tauriInvoke<BuiltinAiContext>("ai_builtin_context", {
      conversationId,
      customWorkspaceDir: trimmed || null,
    });
  }
  const workspaceDir = trimmed || `data/ai/workspaces/${conversationId}`;
  return {
    workspaceDir,
    systemPrompt: `${FALLBACK_SYSTEM_PROMPT_HEAD}\n\n当前会话工作目录：${workspaceDir}`,
    tools: FALLBACK_TOOL_DEFS,
  };
}

export async function resolveConversationWorkspaceDir(
  conversationId: string,
  customDir?: string,
): Promise<string> {
  const trimmed = customDir?.trim();
  if (trimmed) return trimmed;
  if (hasTauriRuntime()) {
    return tauriInvoke<string>("ai_workspace_dir", { conversationId });
  }
  return `data/ai/workspaces/${conversationId}`;
}

export async function pickWorkspaceFolder(defaultPath?: string): Promise<string | null> {
  if (!hasTauriRuntime()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    directory: true,
    multiple: false,
    ...(defaultPath?.trim() ? { defaultPath: defaultPath.trim() } : {}),
  });
  if (typeof picked === "string" && picked.trim()) {
    return picked.trim();
  }
  return null;
}

function normalizePosixLike(raw: string): string {
  const unified = raw.trim().replace(/\\/g, "/");
  const driveMatch = unified.match(/^([a-zA-Z]:)(\/.*)?$/);
  const prefix = driveMatch ? driveMatch[1].toLowerCase() : unified.startsWith("/") ? "/" : "";
  const rest = driveMatch ? (driveMatch[2] ?? "/") : unified;
  const segments: string[] = [];
  for (const part of rest.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (segments.length && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else if (!prefix) {
        segments.push("..");
      }
    } else {
      segments.push(part);
    }
  }
  if (prefix === "/") return `/${segments.join("/")}`;
  if (prefix) return `${prefix}/${segments.join("/")}`;
  return segments.join("/");
}

function isAbsoluteAnyPath(raw: string): boolean {
  const trimmed = raw.trim();
  return /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\\\");
}

/** 判断目标路径是否超出当前会话工作目录（桌面端直接复用 Rust 规范化逻辑） */
export async function checkBuiltinToolPath(
  workspaceDir: string,
  targetPath: string,
): Promise<BuiltinToolPathCheck> {
  if (hasTauriRuntime()) {
    return tauriInvoke<BuiltinToolPathCheck>("ai_tool_check_path", {
      workspaceDir,
      path: targetPath,
    });
  }
  const wsNorm = normalizePosixLike(workspaceDir);
  const raw = targetPath.trim();
  const combined = isAbsoluteAnyPath(raw) ? raw : `${wsNorm}/${raw}`;
  const resolved = normalizePosixLike(combined);
  const wsPrefix = wsNorm.endsWith("/") ? wsNorm : `${wsNorm}/`;
  const inside =
    resolved.toLowerCase() === wsNorm.toLowerCase() ||
    resolved.toLowerCase().startsWith(wsPrefix.toLowerCase());
  return {
    resolvedPath: resolved,
    outsideWorkspace: !inside,
  };
}

/** 统一通过 Rust 后端 `ai_tool_execute` 分发任意已注册的 `AiTool` 实现 */
export async function invokeBuiltinTool(
  toolName: string,
  args: Record<string, unknown>,
  workspaceDir: string,
  signal?: AbortSignal,
): Promise<BuiltinToolRunResult> {
  if (testExecutor) {
    return testExecutor(toolName, args, workspaceDir, signal);
  }
  if (!hasTauriRuntime()) {
    return {
      text: "Built-in local tools require the desktop application runtime.",
      isError: true,
    };
  }

  const runId = makeEntityId("tool");
  const onAbort = () => {
    void tauriInvoke<boolean>("ai_tool_cancel_command", { runId }).catch(() => undefined);
  };
  if (signal?.aborted) {
    return { text: "Tool execution cancelled.", isError: true };
  }
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await tauriInvoke<BuiltinToolRunResult>("ai_tool_execute", {
      runId,
      workspaceDir,
      toolName,
      arguments: args,
    });
  } catch (error) {
    return {
      text: error instanceof Error ? error.message : String(error),
      isError: true,
    };
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

interface ReadFileResult {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
}

function stripNumberedLines(numbered: string): string {
  if (!numbered) return "";
  const raw = numbered.endsWith("\n") ? numbered.slice(0, -1) : numbered;
  return raw
    .split("\n")
    .map((line) => line.replace(/^\d+:\s/, ""))
    .join("\n");
}

/** 读取本地文本文件供右侧输出查看器预览（支持点击 AI 回复中的 file:// 链接直接打开） */
export async function readLocalFileForPreview(
  workspaceDir: string,
  targetPath: string,
): Promise<{ path: string; content: string }> {
  if (testExecutor) {
    const res = await testExecutor("read_file", { path: targetPath }, workspaceDir);
    if (res.isError) throw new Error(res.text);
    return {
      path: res.outputFile?.path ?? targetPath,
      content: res.outputFile?.content ?? res.text,
    };
  }
  if (!hasTauriRuntime()) {
    throw new Error("Reading local files requires the desktop application runtime.");
  }

  const MAX_PAGES = 5;
  const PAGE_LINES = 600;
  let startLine = 1;
  let resolvedPath = targetPath;
  const chunks: string[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await tauriInvoke<ReadFileResult>("ai_tool_read_file", {
      workspaceDir,
      path: targetPath,
      startLine,
      endLine: startLine + PAGE_LINES - 1,
    });
    resolvedPath = res.path;
    if (res.content) {
      chunks.push(stripNumberedLines(res.content));
    }
    if (!res.truncated || res.endLine >= res.totalLines || res.endLine < startLine) {
      break;
    }
    startLine = res.endLine + 1;
  }

  return {
    path: resolvedPath,
    content: chunks.join("\n"),
  };
}

const IMAGE_FILE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|ico|tif|tiff|avif)$/i;
const localImageCache = new Map<string, LocalImagePreview>();
const MAX_IMAGE_CACHE_ENTRIES = 60;

/** 判断路径是否为常见二进制图片文件（不含文本可编辑的 SVG） */
export function isImageFilePath(targetPath: string): boolean {
  const clean = targetPath.trim().split(/[?#]/, 1)[0];
  return IMAGE_FILE_EXT_RE.test(clean);
}

/** 清空本地图片预览缓存（当工具覆盖了同名图片时调用） */
export function invalidateLocalImageCache(targetPath?: string): void {
  if (!targetPath) {
    localImageCache.clear();
    return;
  }
  const norm = normalizePosixLike(targetPath).toLowerCase();
  for (const key of localImageCache.keys()) {
    if (key.toLowerCase().includes(norm)) {
      localImageCache.delete(key);
    }
  }
}

/** 读取本地图片文件供对话内联渲染与右侧输出查看器预览 */
export async function readLocalImageForPreview(
  workspaceDir: string,
  targetPath: string,
  bypassCache = false,
): Promise<LocalImagePreview> {
  if (!hasTauriRuntime()) {
    throw new Error("Reading local images requires the desktop application runtime.");
  }
  const cacheKey = `${normalizePosixLike(workspaceDir).toLowerCase()}\0${normalizePosixLike(targetPath).toLowerCase()}`;
  if (!bypassCache) {
    const cached = localImageCache.get(cacheKey);
    if (cached) return cached;
  }

  const res = await tauriInvoke<LocalImagePreview>("ai_tool_read_image", {
    workspaceDir,
    path: targetPath,
  });
  if (localImageCache.size >= MAX_IMAGE_CACHE_ENTRIES) {
    const oldestKey = localImageCache.keys().next().value;
    if (oldestKey) localImageCache.delete(oldestKey);
  }
  localImageCache.set(cacheKey, res);
  return res;
}

/** 将 Data URL 或纯 Base64 解码为原始二进制字节，供图片下载保存 */
export function decodeImagePreviewBytes(preview: Pick<LocalImagePreview, "dataUrl" | "rawBase64">): Uint8Array {
  const base64 = preview.rawBase64 ?? preview.dataUrl.split(",", 2)[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
