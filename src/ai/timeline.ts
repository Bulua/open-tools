import type { ChatMessage } from "@/types/ai";

export interface TimelineItem {
  /** 对应的用户消息 ID */
  id: string;
  /** 提问序号（从 1 开始） */
  index: number;
  /** 提问预览文案（若无正文则回退为附件名） */
  promptPreview: string;
  /** 紧随其后的助手回复纯文本预览（无回复或尚无正文时为空字符串） */
  replyPreview: string;
  /** 发送时间戳 */
  createdAt: number;
}

const MAX_SCAN_CHARS = 1200;
const MAX_PREVIEW_CHARS = 240;

/** 规范化多行文本：保留有意义的换行并压平多余空白 */
function normalizeMultiline(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/** 将 Markdown 回复压成简洁的纯文本预览，避免在浮层里露出原始标记符 */
export function stripMarkdownPreview(raw: string, maxLength = MAX_PREVIEW_CHARS): string {
  if (!raw) return "";
  const slice = raw.length > MAX_SCAN_CHARS ? raw.slice(0, MAX_SCAN_CHARS) : raw;
  const cleaned = slice
    // 去掉代码块围栏行，保留内部代码文本
    .replace(/```[^\n]*\n?/g, "")
    // 图片与链接保留可读文字
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // 行内代码与强调语法
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__|~~)(.*?)\1/g, "$2")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?]|$)/g, "$1$2")
    // 标题、引用与无序列表前缀
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "");

  const normalized = normalizeMultiline(cleaned);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

function extractAssistantText(msg: ChatMessage): string {
  if (msg.content.trim()) return msg.content;
  if (msg.parts?.length) {
    return msg.parts
      .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

/** 从会话消息列表提取左侧时间线节点：每条用户消息对应一个小点 */
export function buildTimelineItems(messages: readonly ChatMessage[], fallbackLabel = ""): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "user") continue;

    const rawPrompt = normalizeMultiline(msg.content);
    const attachmentNames = msg.attachments?.map((att) => att.name).filter(Boolean).join(", ") ?? "";
    const promptPreview = rawPrompt || attachmentNames || fallbackLabel;

    const nextMsg = messages[i + 1];
    const replyPreview =
      nextMsg && nextMsg.role === "assistant"
        ? stripMarkdownPreview(extractAssistantText(nextMsg))
        : "";

    items.push({
      id: msg.id,
      index: items.length + 1,
      promptPreview,
      replyPreview,
      createdAt: msg.createdAt,
    });
  }
  return items;
}

/** 按当前语言格式化浮层右下角的发送时间 */
export function formatTimelineTime(timestamp: number, currentLocale: string): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  try {
    return new Intl.DateTimeFormat(currentLocale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}
