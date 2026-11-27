/**
 * 本地工作区目录选择与文件/图片预览读取辅助（底层 IPC 统一通过 `aiApi` 发起）。
 */
import { aiApi } from "@/api/ai";
import { hasDesktopRuntime } from "@/api/common";
import type { LocalImagePreview } from "@/types/ai";

export type { LocalImagePreview };

export async function resolveConversationWorkspaceDir(
  conversationId: string,
  customDir?: string,
): Promise<string> {
  const trimmed = customDir?.trim();
  if (trimmed) return trimmed;
  return aiApi.workspaceDir(conversationId);
}

export async function pickWorkspaceFolder(defaultPath?: string): Promise<string | null> {
  if (!hasDesktopRuntime()) return null;
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
  const MAX_PAGES = 5;
  const PAGE_LINES = 600;
  let startLine = 1;
  let resolvedPath = targetPath;
  const chunks: string[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await aiApi.readFile(workspaceDir, targetPath, startLine, startLine + PAGE_LINES - 1);
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
  const cacheKey = `${normalizePosixLike(workspaceDir).toLowerCase()}\0${normalizePosixLike(targetPath).toLowerCase()}`;
  if (!bypassCache) {
    const cached = localImageCache.get(cacheKey);
    if (cached) return cached;
  }

  const res = await aiApi.readImage(workspaceDir, targetPath);
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
