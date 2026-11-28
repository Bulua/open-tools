import { formatBytes } from "@/utils/format";
import type { FileOutputFormat } from "./base64";

export type Base64Mode = "text" | "file";
export type Base64Direction = "encode" | "decode";

export interface LoadedFile {
  name: string;
  size: number;
  mime: string;
  dataUri: string;
  dimensions?: string;
  objectUrl?: string;
}

export interface Base64Record {
  id: string;
  mode: Base64Mode;
  direction: Base64Direction;
  createdAt: number;
  updatedAt: number;
  input?: string;
  output?: string;
  urlSafe?: boolean;
  fileName?: string;
  fileSize?: number;
  fileMime?: string;
  dataUri?: string;
  dimensions?: string;
  objectUrl?: string;
  format?: FileOutputFormat;
  base64Input?: string;
  decodedName?: string;
  decodedMime?: string;
  decodedSize?: number;
}

const STORAGE_KEY = "base64.records";
const MAX_RECORD_CHARS = 200_000;
export const MAX_RECORDS = 30;

/** 生成一条编解码记录的唯一 ID */
export function createRecordId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 从本地存储读取 Base64 编解码记录列表 */
export function loadBase64Records(): Base64Record[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECORDS) : [];
  } catch {
    return [];
  }
}

/** 保存编解码记录到本地存储，先按原始字符串长度 O(1) 跳过超大文件内容 */
export function saveBase64Records(records: Base64Record[]): void {
  try {
    const persistable: Base64Record[] = [];
    for (const item of records) {
      if (persistable.length >= MAX_RECORDS) break;
      const rawLength =
        (item.dataUri?.length ?? 0) +
        (item.base64Input?.length ?? 0) +
        (item.input?.length ?? 0) +
        (item.output?.length ?? 0);
      if (rawLength > MAX_RECORD_CHARS) continue;
      const { objectUrl: _objectUrl, ...rest } = item;
      if (JSON.stringify(rest).length <= MAX_RECORD_CHARS) persistable.push(rest);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // 存储空间不足或不可用时保持当前会话内存可用
  }
}

function previewLine(text: string | undefined, maxLength: number): string {
  const line = text
    ?.split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean) ?? "";
  if (line.length <= maxLength) return line;
  return `${line.slice(0, maxLength - 1)}…`;
}

/** 提取记录主标题用于左侧列表展示 */
export function recordTitle(record: Base64Record): string {
  if (record.mode === "text") return previewLine(record.input, 48);
  if (record.direction === "encode") return record.fileName || record.fileMime || "file";
  return record.decodedName || record.decodedMime || previewLine(record.base64Input, 36);
}

/** 提取记录副标题（结果预览或文件大小/MIME） */
export function recordSubtitle(record: Base64Record): string {
  if (record.mode === "text") return previewLine(record.output, 56);
  if (record.direction === "encode") {
    return [record.fileSize !== undefined ? formatBytes(record.fileSize) : "", record.fileMime ?? ""].filter(Boolean).join(" · ");
  }
  return [record.decodedSize !== undefined ? formatBytes(record.decodedSize) : "", record.decodedMime ?? ""].filter(Boolean).join(" · ");
}

/** 按当前界面语言格式化记录时间 */
export function formatRecordTime(timestamp: number, loc: string): string {
  return new Intl.DateTimeFormat(loc, { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}
