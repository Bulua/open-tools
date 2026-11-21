export const REPO_URL = "https://github.com/Bulua/open-tools";

/** 用系统默认浏览器打开网址 */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}
