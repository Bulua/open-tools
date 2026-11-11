import { onActivated, onBeforeUnmount, onDeactivated, watch, type WatchSource } from "vue";
import { recordToolUsage } from "./toolLibrary";

/** 实时工具停下输入后计一次；空结果、初始示例和后台时钟刷新不计数。 */
export function useToolUsage() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  const flush = () => { if (timer !== undefined) { cancel(); recordToolUsage(); } };
  const track = () => {
    cancel();
    if (active) timer = setTimeout(flush, 1000);
  };
  onActivated(() => { active = true; });
  onDeactivated(() => { flush(); active = false; });
  onBeforeUnmount(flush);
  return { track, cancel };
}

/** 调用方只提供有效结果对应的输入签名，避免默认结果与语言切换触发统计。 */
export function useToolResult(source: WatchSource<unknown>) {
  const { track, cancel } = useToolUsage();
  watch(source, (value) => { if (value) track(); else cancel(); });
}
