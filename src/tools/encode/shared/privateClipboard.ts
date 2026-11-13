import { invoke } from "@tauri-apps/api/core";
import { getAppPlatform } from "@/utils/platform";
export const writePrivateClipboardText = (text: string) => getAppPlatform() === "desktop"
  ? invoke<void>("clipboard_copy_private", { text })
  : navigator.clipboard.writeText(text);
