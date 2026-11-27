/**
 * 剪贴板历史模块类型定义（与 Rust `clipboard_history::service` 保持字段一致）。
 */

export interface ClipboardEntry {
  id: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClipboardSnapshot {
  enabled: boolean;
  maxItems: number;
  entries: ClipboardEntry[];
  error: string | null;
}

export type ClipboardUpdate =
  | { kind: "recording"; enabled: boolean }
  | { kind: "limit"; count: number }
  | { kind: "delete"; id: string }
  | { kind: "clear" };
