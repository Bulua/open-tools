import { nextTick, onBeforeUnmount, ref, type Ref } from "vue";

/**
 * 弹出层：显示在触发元素下方（下方放不下时显示在上方），宽度至少与触发元素相同。
 * 点击外部、按 Esc、窗口大小变化或页面滚动时关闭。弹出层需要用 Teleport 放到 body 下，避免被父元素裁剪。
 */
export function usePopover(trigger: Ref<HTMLElement | undefined>, panel: Ref<HTMLElement | undefined>, options: { minWidth?: number; maxHeight?: number } = {}) {
  const open = ref(false);
  const style = ref<Record<string, string>>({});

  const place = () => {
    const el = trigger.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, options.minWidth ?? 0);
    const height = panel.value?.offsetHeight ?? options.maxHeight ?? 300;
    const below = window.innerHeight - r.bottom - 8;
    const top = below >= height || below >= r.top ? r.bottom + 4 : Math.max(8, r.top - height - 4);
    // 弹出层比触发元素宽时（如日期选择器），右侧放不下就改为与触发元素右对齐
    const panelWidth = Math.max(width, panel.value?.offsetWidth ?? 0);
    const left = r.left + panelWidth > window.innerWidth - 8 ? Math.min(r.right - panelWidth, window.innerWidth - panelWidth - 8) : r.left;
    style.value = { top: `${top}px`, left: `${Math.max(8, left)}px`, minWidth: `${width}px` };
  };

  const onDocDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (trigger.value?.contains(t) || panel.value?.contains(t)) return;
    close();
  };
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
  const onScroll = (e: Event) => {
    if (panel.value?.contains(e.target as Node)) return;
    close();
  };

  const show = async () => {
    if (open.value) return;
    open.value = true;
    place();
    await nextTick();
    // 第一次放置时还不知道弹出层的高度，渲染后再算一次
    place();
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
  };
  function close() {
    if (!open.value) return;
    open.value = false;
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", close);
    window.removeEventListener("scroll", onScroll, true);
  }
  const toggle = () => (open.value ? close() : show());
  onBeforeUnmount(close);

  return { open, style, show, close, toggle, place };
}
