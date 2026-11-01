import { isTauri } from "@tauri-apps/api/core";

export const REPO_URL = "https://github.com/Bulua/open-tools";

/** 用系统默认浏览器打开网址（桌面版通过 opener 插件，浏览器中新开标签页） */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}
