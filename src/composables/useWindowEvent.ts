import { onActivated, onBeforeUnmount, onDeactivated, onMounted } from "vue";

/**
 * 监听 window 上的事件（如 paste），只在工具显示时生效。
 * 工具被 KeepAlive 缓存到后台时自动暂停，回到前台再恢复，
 * 避免在一个工具里粘贴，后台的其他工具也收到。
 */
export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  enabled: () => boolean = () => true,
) {
  let active = false;
  const add = () => {
    if (active || !enabled()) return;
    window.addEventListener(type, handler);
    active = true;
  };
  const remove = () => {
    if (!active) return;
    window.removeEventListener(type, handler);
    active = false;
  };
  onMounted(add);
  onActivated(add);
  onDeactivated(remove);
  onBeforeUnmount(remove);
}
