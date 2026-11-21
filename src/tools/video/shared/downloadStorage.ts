import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { saveIntoFolder } from "@/utils/saveFile";
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

/** 原生端负责确定应用数据目录及访问权限。 */
export async function saveDownloadedMedia(platform: DownloadPlatform, name: string, data: Uint8Array, kind: SavedMedia["kind"]): Promise<SavedMedia> {
  name = safeFileName(name);
  const folder = await invoke<string>("video_download_dir", { platform });
  await saveIntoFolder(folder, name, data);
  const { join } = await import("@tauri-apps/api/path");
  const path = await join(folder, name);
  return { name, kind, path, url: convertFileSrc(path) };
}

export async function revealDownloadedMedia(file: SavedMedia): Promise<void> {
  await (await import("@tauri-apps/plugin-opener")).revealItemInDir(file.path);
}
