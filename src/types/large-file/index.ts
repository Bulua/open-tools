/**
 * 大文件编辑器模块前后端通信类型定义。
 */

export type TextEncoding = "Utf8" | "Utf16Le" | "Utf16Be" | "Gbk";

export interface FileInfo {
  path: string;
  size: number;
  encoding: TextEncoding;
  newline: string;
  revision: number;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  readonly: boolean;
  bom: number;
}

export interface TextBlock {
  start: number;
  end: number;
  firstLine: number;
  continuation: boolean;
  text: string;
  revision: number;
}

export interface TaskStatus {
  busy: boolean;
  kind: string;
  done: number;
  total: number;
  indexed: number;
  indexTotal: number;
  indexComplete: boolean;
  lines: number;
  indexError: string | null;
}

export interface OpenedFile {
  id: string;
  info: FileInfo;
  block: TextBlock;
}

export interface SearchResult {
  found: { start: number; end: number } | null;
  block: TextBlock | null;
}

export interface LargeFileEdit {
  from: number;
  to: number;
  text: string;
}

export interface LargeFileSaved {
  info: FileInfo;
  backup: string;
}
