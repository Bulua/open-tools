import { reactive } from "vue";
import { Stopwatch } from "./stopwatch";

// 工具被缓存或卸载后，当前应用会话中的秒表仍可继续。
export const stopwatch = reactive(new Stopwatch());
