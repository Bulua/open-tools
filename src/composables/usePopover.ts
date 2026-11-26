import { nextTick, onBeforeUnmount, ref, type Ref } from "vue";

/**
 * 弹出层：显示在触发元素下方（下方放不下时显示在上方），宽度至少与触发元素相同。
 * 点击外部、按 Esc、窗口大小变化或页面滚动时关闭。弹出层需要用 Teleport 放到 body 下，避免被父元素裁剪。
 */
export function usePopover(
  trigger: Ref<HTMLElement | undefined>,
  panel: Ref<HTMLElement | undefined>,
  options: {
    minWidth?: number;
    maxHeight?: number;
    side?: "left" | "right";
    align?: "left" | "right";
    gap?: number;
    preserve?: () => boolean;
    ignoreEscape?: () => boolean;
  } = {},
) {
  const open = ref(false);
  const style = ref<Record<string, string>>({});
  const placement = ref<"left" | "right" | "vertical">("vertical");

  const place = () => {
    const el = trigger.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, options.minWidth ?? 0);
    const height = panel.value?.offsetHeight ?? options.maxHeight ?? 300;
    const panelWidth = Math.max(width, panel.value?.offsetWidth ?? 0);
    const gap = options.gap ?? 4;
    if (options.side) {
      const right = r.right + 6;
      const left = r.left - panelWidth - 6;
      const fitsRight = right + panelWidth <= window.innerWidth - 8;
      const preferLeft = options.side === "left" && left >= 8;
      const useRight = !preferLeft && fitsRight;
      const x = useRight ? right : left;
      if (x >= 8) {
        placement.value = useRight ? "right" : "left";
        const top = Math.max(8, Math.min(r.top, window.innerHeight - height - 8));
        style.value = { top: `${top}px`, left: `${x}px`, minWidth: `${width}px` };
        return;
      }
    }
    placement.value = "vertical";
    const below = window.innerHeight - r.bottom - 8;
    const top = below >= height || below >= r.top ? r.bottom + gap : Math.max(8, r.top - height - gap);
    // 支持显式右对齐（如右下角策略菜单），或右侧放不下时自动右对齐
    const left =
      options.align === "right"
        ? Math.min(r.right - panelWidth, window.innerWidth - panelWidth - 8)
        : r.left + panelWidth > window.innerWidth - 8
          ? Math.min(r.right - panelWidth, window.innerWidth - panelWidth - 8)
          : r.left;
    const fitTop = options.side ? Math.max(8, Math.min(top, window.innerHeight - height - 8)) : top;
    style.value = { top: `${fitTop}px`, left: `${Math.max(8, left)}px`, minWidth: `${width}px` };
  };

  const onDocDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (options.preserve?.() || trigger.value?.contains(t) || panel.value?.contains(t)) return;
    close();
  };
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && !options.ignoreEscape?.() && close();
  const onLayoutChange = () => options.preserve?.() ? place() : close();
  const onScroll = (e: Event) => {
    if (panel.value?.contains(e.target as Node)) return;
    onLayoutChange();
  };

  const show = async () => {
    if (open.value) return;
    open.value = true;
    place();
    await nextTick();
    if (!open.value) return;
    if (panel.value) panel.value.inert = false;
    // 第一次放置时还不知道弹出层的高度，渲染后再算一次
    place();
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onScroll, true);
  };
  function close() {
    if (!open.value) return;
    open.value = false;
    // Vue 在退场期间还保留面板，及时退出键盘和点击交互。
    if (panel.value) panel.value.inert = true;
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onLayoutChange);
    window.removeEventListener("scroll", onScroll, true);
  }
  const toggle = () => (open.value ? close() : show());
  onBeforeUnmount(close);

  return { open, style, placement, show, close, toggle, place };
}
