import { invoke, isTauri } from "@tauri-apps/api/core";

/** 与日历共用 Windows Toast，仅在 Windows 桌面版发送。 */
export async function notifyDesktop(title: string, body: string): Promise<void> {
  if (!isTauri() || !/Windows/i.test(navigator.userAgent)) return;
  await invoke("desktop_notify", { title, body });
}
