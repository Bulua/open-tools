import { clipboardApi } from "@/api/clipboard";

export const writePrivateClipboardText = (text: string) => clipboardApi.copyPrivate(text);
