/**
 * AI 对话附件解析、落盘与多模态按需加载模块。
 * - 图片：保持原图尺寸不压缩，上限 50 MB，发送时原样落盘到工作目录 `uploads/`
 * - 文本/代码：单文件上限 50 MB，完整文件落盘；进入消息上下文的正文上限 100,000 字符，超长时弹出警告提醒
 * - 其他二进制文件（PDF/Word/音视频/压缩包等）：单文件上限 100 MB，落盘后把路径与元信息交给 AI 工具处理
 */
import { aiApi } from "@/api/ai";
import { hasDesktopRuntime } from "@/api/common";
import { t } from "@/locales";
import type { ChatAttachment } from "@/types/ai";
import { showError, showNotice } from "@/utils/errorToast";
import { makeEntityId } from "./presets";

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_TEXT_BYTES = 50 * 1024 * 1024;
export const MAX_BINARY_BYTES = 100 * 1024 * 1024;
export const MAX_TEXT_CHARS = 100_000;

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|ico|tif|tiff|avif)$/i;
const BINARY_SAMPLE_BYTES = 4096;

function encodeHeaderUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function looksBinaryBytes(bytes: Uint8Array): boolean {
  const len = Math.min(bytes.length, BINARY_SAMPLE_BYTES);
  if (len === 0) return false;
  let bad = 0;
  for (let i = 0; i < len; i++) {
    const b = bytes[i];
    if (b === 0) return true;
    if (b < 9 || (b > 13 && b < 32)) bad++;
  }
  return bad / len > 0.1;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

/** 释放待发送附件创建的临时 blob 缩略图链接 */
export function revokeAttachmentPreview(att: ChatAttachment): void {
  if (att.previewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(att.previewUrl);
  }
}

/** 解析用户选择、拖拽或粘贴的文件，返回待发送附件列表（不压缩图片） */
export async function parsePendingFiles(fileList: FileList | File[]): Promise<ChatAttachment[]> {
  const parsed: ChatAttachment[] = [];

  for (const file of Array.from(fileList)) {
    const mime = file.type || "";
    const isImage = mime.startsWith("image/") || IMAGE_EXT_RE.test(file.name);
    try {
      if (isImage) {
        if (file.size > MAX_IMAGE_BYTES) {
          showError(t("ai.errors.fileTooLarge", { name: file.name, limit: "50 MB" }));
          continue;
        }
        const previewUrl = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(file)
          : await readFileAsDataUrl(file);
        parsed.push({
          id: makeEntityId("att"),
          name: file.name || t("common.pastedImage"),
          mimeType: mime || "image/png",
          size: file.size,
          kind: "image",
          previewUrl,
          rawFile: file,
        });
        continue;
      }

      if (file.size > MAX_BINARY_BYTES) {
        showError(t("ai.errors.fileTooLarge", { name: file.name, limit: "100 MB" }));
        continue;
      }

      // 先采样前 4 KB 判断是否为二进制，避免对大体积音视频/压缩包做整文件 UTF-8 解码
      const sampleBuf = await file.slice(0, BINARY_SAMPLE_BYTES).arrayBuffer();
      const isBinary = looksBinaryBytes(new Uint8Array(sampleBuf));
      if (isBinary) {
        parsed.push({
          id: makeEntityId("att"),
          name: file.name,
          mimeType: mime || "application/octet-stream",
          size: file.size,
          kind: "file",
          rawFile: file,
        });
        continue;
      }

      if (file.size > MAX_TEXT_BYTES) {
        showError(t("ai.errors.fileTooLarge", { name: file.name, limit: "50 MB" }));
        continue;
      }

      const rawText = await readFileAsText(file);
      const truncated = rawText.length > MAX_TEXT_CHARS;
      const textContent = truncated
        ? `${rawText.slice(0, MAX_TEXT_CHARS)}\n…`
        : rawText;
      if (truncated) {
        showNotice(
          t("ai.errors.textTruncated", {
            name: file.name,
            limit: MAX_TEXT_CHARS.toLocaleString(),
          }),
        );
      }

      parsed.push({
        id: makeEntityId("att"),
        name: file.name,
        mimeType: mime || "text/plain",
        size: file.size,
        kind: "text",
        textContent,
        ...(truncated ? { truncated: true } : {}),
        rawFile: file,
      });
    } catch (error) {
      showError(error);
    }
  }

  return parsed;
}

/** 发送消息前将附件无损落盘到当前会话工作目录 `uploads/`，并清理临时字段避免会话 JSON 膨胀 */
export async function persistAttachmentsToWorkspace(
  attachments: readonly ChatAttachment[],
  workspaceDir: string,
): Promise<ChatAttachment[]> {
  if (!attachments.length) return [];

  const isDesktop = hasDesktopRuntime();
  const result: ChatAttachment[] = [];

  for (const att of attachments) {
    const clean: ChatAttachment = {
      id: att.id,
      name: att.name,
      mimeType: att.mimeType,
      size: att.size,
      kind: att.kind,
      ...(att.filePath ? { filePath: att.filePath } : {}),
      ...(att.textContent !== undefined ? { textContent: att.textContent } : {}),
      ...(att.truncated ? { truncated: true } : {}),
      ...(att.dataUrl && !att.filePath ? { dataUrl: att.dataUrl } : {}),
    };

    if (att.rawFile) {
      if (isDesktop && workspaceDir.trim()) {
        const buffer = await att.rawFile.arrayBuffer();
        const saved = await aiApi.saveAttachment(buffer, {
          "x-workspace-dir": encodeHeaderUtf8(workspaceDir),
          "x-file-name": encodeHeaderUtf8(att.name || "attachment"),
        });
        clean.filePath = saved.path;
        // 图片已无损落盘，不再把原图 base64 写进会话 JSON
        delete clean.dataUrl;
      } else if (att.kind === "image" && !clean.dataUrl) {
        clean.dataUrl = await readFileAsDataUrl(att.rawFile);
      }
    }

    revokeAttachmentPreview(att);
    result.push(clean);
  }

  return result;
}
