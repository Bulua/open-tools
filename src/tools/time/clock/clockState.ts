import { reactive } from "vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { Stopwatch } from "./stopwatch";

export type ClockTab = "alarm" | "stopwatch" | "timer";

// 工具被缓存或卸载后，当前应用会话中的秒表仍可继续。
export const stopwatch = reactive(new Stopwatch());

export const clockTab = useStoredRef<ClockTab>("clock.tab", "alarm");
if (!["alarm", "stopwatch", "timer"].includes(clockTab.value)) clockTab.value = "alarm";
