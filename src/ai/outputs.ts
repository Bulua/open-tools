import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { isImageFilePath, type LocalImagePreview } from "./builtinTools";
import type { ChatMessage, ChatToolCall } from "@/types/ai";
import { formatNowDateTime } from "@/utils/datetime";

export type OutputPreviewKind = "html" | "svg" | "markdown" | "image" | "code";

export interface AiOutputFile {
  /** 唯一标识（用于选中状态与列表 key） */
  id: string;
  /** 所属助手消息 ID */
  messageId: string;
  /** 文件名（含后缀） */
  fileName: string;
  /** 原始路径（如 docs/README.md） */
  filePath: string;
  /** 语言标识（小写，如 ts / python / html / text） */
  language: string;
  /** 小写扩展名（不含点） */
  ext: string;
  /** 文件完整文本内容（图片文件为空串，按需从磁盘加载） */
  content: string;
  /** 行数 */
  lineCount: number;
  /** 字节数 */
  sizeBytes: number;
  /** 生成时间（`YYYY-MM-DD HH:MM:SS`） */
  createdAt: string;
  /** 支持的预览模式 */
  previewKind: OutputPreviewKind;
  /** 已加载的图片预览数据（按需填充） */
  imagePreview?: LocalImagePreview;
}

const INVALID_FILENAME_CHARS_RE = /[<>:"/\\|?*\x00-\x1f]/;
const FILE_TOOL_NAME_RE = /write|create|save|output|generate|make[_-]?file|put[_-]?file|file[_-]?write/i;

function normalizePath(raw: string): string {
  return raw.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function extractBaseName(normalizedPath: string): string | null {
  if (!normalizedPath) return null;
  const base = normalizedPath.split("/").pop()?.trim() ?? "";
  if (!base || base === "." || base === ".." || INVALID_FILENAME_CHARS_RE.test(base)) return null;
  return base;
}

function getFileExt(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  const dot = lower.lastIndexOf(".");
  return dot > 0 ? lower.slice(dot + 1) : "txt";
}

function detectPreviewKind(ext: string, content: string, explicitKind?: "text" | "image"): OutputPreviewKind {
  if (explicitKind === "image") return "image";
  const e = ext.toLowerCase();
  if (e === "html" || e === "htm") return "html";
  if (e === "svg" || /^<svg\b/i.test(content.trim())) return "svg";
  if (e === "md" || e === "markdown") return "markdown";
  if (isImageFilePath(`a.${e}`)) return "image";
  return "code";
}

function collectToolCalls(msg: ChatMessage): ChatToolCall[] {
  const byId = new Map<string, ChatToolCall>();
  if (msg.parts?.length) {
    for (const part of msg.parts) {
      if (part.type === "tool") byId.set(part.call.id, part.call);
    }
  }
  return Array.from(byId.values());
}

/** 从已完成的文件写入/生成类工具调用中提取真实产生的文件 */
function extractFileFromToolCall(call: ChatToolCall): {
  filePath: string;
  fileName: string;
  content: string;
  kind?: "text" | "image";
  sizeBytes?: number;
} | null {
  if (call.status !== "done") return null;

  // 优先读取工具执行成功后回传的权威文件快照（如内置 write_file / edit_file / image_*）
  if (call.outputFile && typeof call.outputFile.path === "string" && typeof call.outputFile.content === "string") {
    const filePath = normalizePath(call.outputFile.path);
    const fileName = extractBaseName(filePath);
    if (fileName) {
      return {
        filePath,
        fileName,
        content: call.outputFile.content,
        kind: call.outputFile.kind,
        sizeBytes: call.outputFile.sizeBytes,
      };
    }
  }

  if (!FILE_TOOL_NAME_RE.test(call.toolName)) return null;

  try {
    const parsed = JSON.parse(call.argumentsText || "{}") as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const rawPath = parsed.path ?? parsed.filePath ?? parsed.file_path ?? parsed.filename ?? parsed.fileName ?? parsed.targetPath;
      const rawContent = parsed.content ?? parsed.text ?? parsed.code ?? parsed.data ?? parsed.body;
      if (typeof rawPath === "string" && typeof rawContent === "string") {
        const filePath = normalizePath(rawPath);
        const fileName = extractBaseName(filePath);
        if (fileName) {
          return { filePath, fileName, content: rawContent };
        }
      }
    }
  } catch {
    // 忽略非 JSON 参数
  }

  return null;
}

/** 从当前会话的助手工具调用中提取 AI 实际生成的文件列表（同路径自动保留最新版本） */
export function extractConversationOutputs(messages: readonly ChatMessage[]): AiOutputFile[] {
  const byPath = new Map<string, AiOutputFile>();

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const toolCalls = collectToolCalls(msg);

    for (const call of toolCalls) {
      const extracted = extractFileFromToolCall(call);
      if (!extracted) continue;

      const ext = getFileExt(extracted.fileName);
      const key = extracted.filePath.toLowerCase();
      const previewKind = detectPreviewKind(ext, extracted.content, extracted.kind);
      const lineCount = previewKind === "image"
        ? 0
        : extracted.content.length
          ? extracted.content.split(/\r?\n/).length
          : 0;
      const sizeBytes =
        typeof extracted.sizeBytes === "number" && Number.isFinite(extracted.sizeBytes)
          ? extracted.sizeBytes
          : new TextEncoder().encode(extracted.content).length;

      // 同路径重复写入时更新为最新内容，并维持最新顺序
      if (byPath.has(key)) byPath.delete(key);
      byPath.set(key, {
        id: key,
        messageId: msg.id,
        fileName: extracted.fileName,
        filePath: extracted.filePath,
        language: ext,
        ext,
        content: extracted.content,
        lineCount,
        sizeBytes,
        createdAt: msg.createdAt,
        previewKind,
      });
    }
  }

  return Array.from(byPath.values());
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 为右侧代码查看器生成语法高亮后的 HTML */
export function highlightOutputCode(code: string, language: string): string {
  const lang = language.trim().toLowerCase();
  const known = lang && hljs.getLanguage(lang);
  const raw = known
    ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    : escapeHtml(code);
  return DOMPurify.sanitize(raw);
}

/** 清理用于右侧内联预览的 SVG，移除脚本与事件属性 */
export function sanitizeSvgPreview(svg: string): string {
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}

/** 根据路径与文本快照构造可供右侧查看器展示的文件对象 */
export function createOutputFileFromSnapshot(
  rawPath: string,
  content: string,
  messageId = "",
  createdAt = formatNowDateTime(),
): AiOutputFile | null {
  const filePath = normalizePath(rawPath);
  const base = filePath.split("/").pop()?.trim() ?? "";
  if (!base) return null;
  const ext = getFileExt(base);
  const lineCount = content.length ? content.split(/\r?\n/).length : 0;
  const sizeBytes = new TextEncoder().encode(content).length;
  return {
    id: filePath.toLowerCase(),
    messageId,
    fileName: base,
    filePath,
    language: ext,
    ext,
    content,
    lineCount,
    sizeBytes,
    createdAt,
    previewKind: detectPreviewKind(ext, content),
  };
}

/** 根据本地图片预览结果构造右侧查看器展示对象 */
export function createImageOutputFile(
  preview: LocalImagePreview,
  messageId = "",
  createdAt = formatNowDateTime(),
): AiOutputFile | null {
  const filePath = normalizePath(preview.path);
  const base = filePath.split("/").pop()?.trim() ?? "";
  if (!base) return null;
  const ext = getFileExt(base);
  return {
    id: filePath.toLowerCase(),
    messageId,
    fileName: base,
    filePath,
    language: ext,
    ext,
    content: "",
    lineCount: 0,
    sizeBytes: preview.sizeBytes,
    createdAt,
    previewKind: "image",
    imagePreview: preview,
  };
}

/** 格式化文件体积显示 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
