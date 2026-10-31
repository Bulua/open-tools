import { onActivated, onBeforeUnmount, onDeactivated, onMounted } from "vue";
import { useToolActive } from "@/components/tool/toolActions";

/**
 * 监听 window 上的事件（如 paste），只在工具显示时生效：
 * - 工具被 KeepAlive 缓存到后台时自动暂停，回到前台再恢复
 * - 多会话时，只有当前会话会收到事件
 * 避免在一个工具里粘贴，后台的其他工具或会话也收到。
 */
export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  enabled: () => boolean = () => true,
) {
  const toolActive = useToolActive();
  const listener = (event: WindowEventMap[K]) => {
    if (toolActive.value) handler(event);
  };

  let active = false;
  const add = () => {
    if (active || !enabled()) return;
    window.addEventListener(type, listener);
    active = true;
  };
  const remove = () => {
    if (!active) return;
    window.removeEventListener(type, listener);
    active = false;
  };
  onMounted(add);
  onActivated(add);
  onDeactivated(remove);
  onBeforeUnmount(remove);
}
