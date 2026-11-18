import { computed, onDeactivated, ref, watch, type Ref } from "vue";
import { useStoredRef } from "./useStoredRef";

/** 分栏宽度调整，支持持久化、键盘操作、指针捕获与取消恢复。 */
export function usePanelResize(root: Ref<HTMLElement | undefined>, options: {
  storageKey: string;
  initial: number;
  available: number;
  pointerScale?: number;
  bounds: (available: number) => { min: number; max: number };
}) {
  const width = useStoredRef(options.storageKey, options.initial);
  const available = ref(options.available);
  const bounds = computed(() => options.bounds(available.value));
  const min = computed(() => bounds.value.min);
  const max = computed(() => bounds.value.max);
  const clamp = (value: number) => Math.max(min.value, Math.min(max.value, value));
  const fitted = computed(() => clamp(Number(width.value) || options.initial));
  const resizing = ref(false);
  let drag: { id: number; x: number; width: number; element: HTMLElement } | undefined;
  const stop = (event?: PointerEvent, cancel = false) => {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const previous = drag;
    drag = undefined; resizing.value = false;
    if (cancel) width.value = previous.width;
    if (previous.element.hasPointerCapture?.(previous.id)) previous.element.releasePointerCapture(previous.id);
  };
  const start = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    available.value = root.value?.clientWidth || options.available;
    const element = event.currentTarget as HTMLElement;
    drag = { id: event.pointerId, x: event.clientX, width: fitted.value, element };
    resizing.value = true; element.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (drag?.id === event.pointerId) {
      width.value = clamp(drag.width + (event.clientX - drag.x) * (options.pointerScale ?? 1));
    }
  };
  const key = (event: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    width.value = event.key === "Home" ? min.value : event.key === "End" ? max.value : clamp(fitted.value + (event.key === "ArrowRight" ? 10 : -10));
  };
  watch(root, (element, _, onCleanup) => {
    if (!element) return;
    available.value = element.clientWidth || options.available;
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width) available.value = entry.contentRect.width;
    });
    observer?.observe(element);
    onCleanup(() => { observer?.disconnect(); stop(); });
  }, { flush: "post" });
  onDeactivated(() => stop());
  return { width, min, max, fitted, resizing, start, move, stop, key };
}
