export type {
  FileInfo,
  LargeFileEdit,
  LargeFileSaved,
  OpenedFile,
  SearchResult,
  TaskStatus,
  TextBlock,
  TextEncoding,
} from "@/types/large-file";

export interface ViewportAnchor { position: number; offset: number; left: number; anchor: number; head: number; focused?: boolean }
export interface EditorCache { generation: number; json: Record<string, unknown>; viewport?: ViewportAnchor }
