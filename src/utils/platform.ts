import { isTauri } from "@tauri-apps/api/core";

/** 当前是否运行在 Android 安装包中。 */
export const isAndroidApp = () => isTauri() && /Android/i.test(navigator.userAgent);
