import { useStoredRef } from "@/composables/useStoredRef";
import type { Mp3Quality, OutputFormat } from "./audio";

/** 音频导出格式：各音频工具共用同一份设置（模块级单例，界面和导出逻辑读到的是同一个值） */
const format = useStoredRef<OutputFormat>("audio.format", "mp3");
const quality = useStoredRef<Mp3Quality>("audio.quality", 192);

export const useOutputFormat = () => ({ format, quality });
