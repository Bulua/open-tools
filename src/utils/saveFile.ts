import { isTauri } from "@tauri-apps/api/core";
import { zipSync } from "fflate";

/**
 * 把数据保存为本地文件。
 * - 桌面版：弹出系统「另存为」对话框，写入用户选择的位置
 * - 浏览器（开发预览）：走浏览器下载
 *
 * 返回 true 表示已保存，false 表示用户取消。
 */
export async function saveFile(data: Uint8Array, fileName: string): Promise<boolean> {
  if (isTauri()) {
    // 按需加载，浏览器环境不需要这两个插件
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: fileName });
    if (!path) return false;
    await writeFile(path, data);
    return true;
  }

  const url = URL.createObjectURL(new Blob([data as BlobPart]));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** 保存多个文件：只有一个时直接保存，多个时打包成 ZIP（重名文件自动加序号） */
export async function saveFiles(files: { name: string; data: Uint8Array }[], zipName: string): Promise<boolean> {
  if (files.length === 1) return saveFile(files[0].data, files[0].name);

  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    let name = f.name;
    for (let i = 2; name in entries; i++) name = f.name.replace(/(\.[^.]*)?$/, ` (${i})$1`);
    entries[name] = f.data;
  }
  // 图片本身已经压缩过，ZIP 只打包不再压缩，速度更快
  return saveFile(zipSync(entries, { level: 0 }), zipName);
}
