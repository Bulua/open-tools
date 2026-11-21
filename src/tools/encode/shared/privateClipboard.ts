import { invoke } from "@tauri-apps/api/core";

export const writePrivateClipboardText = (text: string) => invoke<void>("clipboard_copy_private", { text });
