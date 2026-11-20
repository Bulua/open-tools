import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { saveFile, saveIntoFolder } from "@/utils/saveFile";
import { safeFileName } from "./fileName";

export type DownloadPlatform = "douyin" | "bilibili" | "xhs" | "x";
export interface SavedMedia {
  name: string;
  kind: "video" | "image";
  path: string;
  url: string;
}

/** 文件名带作品编号，避免不同作者的同名作品互相覆盖。 */
export const downloadBaseName = (title: string, id: string) => `${safeFileName(title).slice(0, 80)}_${safeFileName(id)}`;

/** 原生端负责确定 data 目录及访问权限，网页预览仍使用浏览器下载。 */
export async function saveDownloadedMedia(platform: DownloadPlatform, name: string, data: Uint8Array, kind: SavedMedia["kind"]): Promise<SavedMedia> {
  name = safeFileName(name);
  if (isTauri()) {
    const folder = await invoke<string>("video_download_dir", { platform });
    await saveIntoFolder(folder, name, data);
    const { join } = await import("@tauri-apps/api/path");
    const path = await join(folder, name);
    return { name, kind, path, url: convertFileSrc(path) };
  }
  await saveFile(data, name);
  const ext = name.split(".").pop()?.toLowerCase();
  const mime = kind === "video" ? (ext === "flv" ? "video/x-flv" : "video/mp4") :
    ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", heic: "image/heic", heif: "image/heif" }[ext ?? ""] ?? "application/octet-stream");
  return { name, kind, path: "", url: URL.createObjectURL(new Blob([data as BlobPart], { type: mime })) };
}

/** 网页预览的 Blob URL 在作品移除或工具销毁时释放。 */
export function releaseSavedMedia(files: SavedMedia[]): void {
  for (const file of files) if (file.url.startsWith("blob:")) URL.revokeObjectURL(file.url);
}

export async function revealDownloadedMedia(file: SavedMedia): Promise<void> {
  if (file.path) await (await import("@tauri-apps/plugin-opener")).revealItemInDir(file.path);
}
