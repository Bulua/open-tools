import { isTauri } from "@tauri-apps/api/core";

export type AppPlatform = "web" | "desktop" | "android";

export function getAppPlatform(): AppPlatform {
  if (!isTauri()) return "web";
  return /Android/i.test(navigator.userAgent) ? "android" : "desktop";
}

/** 当前是否运行在 Android 安装包中。 */
export const isAndroidApp = () => getAppPlatform() === "android";
