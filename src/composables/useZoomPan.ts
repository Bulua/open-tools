import { computed, ref } from "vue";

/**
 * 图片缩放与平移：内容先在区域里等比缩放并居中（zoom = 1），再用 transform 放大和平移。
 * 滚轮以鼠标位置为中心缩放；按住拖动平移，移动超过几个像素才算拖动，否则当作点击。
 * 事件绑定在内容的外层区域上（内容在其中居中），transform 用 style 加到内容上。
 * 默认最小就是适应区域（zoom = 1）；传入 min < 1 时还可以缩得比区域更小，四周留出空间方便摆放。
 */
export function useZoomPan(options: { min?: number; max?: number } = {}) {
  const MIN_ZOOM = options.min ?? 1;
  const MAX_ZOOM = options.max ?? 40;
  const zoom = ref(1);
  /** 相对居中位置的偏移 */
  const pan = ref({ x: 0, y: 0 });
  const panning = ref(false);

  const reset = () => {
    zoom.value = 1;
    pan.value = { x: 0, y: 0 };
  };

  /** 以某一点为中心缩放（m 是相对区域中心的坐标），这一点下的内容保持不动 */
  const zoomAt = (next: number, m = { x: 0, y: 0 }) => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    // 最小就是适应区域时，缩回去顺便居中
    if (z === 1 && MIN_ZOOM === 1) return reset();
    const k = z / zoom.value;
    pan.value = { x: m.x - k * (m.x - pan.value.x), y: m.y - k * (m.y - pan.value.y) };
    zoom.value = z;
  };

  const onWheel = (e: WheelEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    zoomAt(zoom.value * Math.exp(-e.deltaY * 0.002), { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 });
  };

  let dragStart: { x: number; y: number; pan: { x: number; y: number } } | null = null;
  let dragged = false;
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    dragStart = { x: e.clientX, y: e.clientY, pan: { ...pan.value } };
    dragged = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  /** 返回 true 表示正在拖动（调用方不必再处理悬停） */
  const onMove = (e: PointerEvent) => {
    if (!dragStart) return false;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (!dragged && Math.hypot(dx, dy) > 3) dragged = panning.value = true;
    if (dragged) pan.value = { x: dragStart.pan.x + dx, y: dragStart.pan.y + dy };
    return dragged;
  };
  /** 返回 true 表示这是一次点击（没有拖动） */
  const onUp = () => {
    if (!dragStart) return false;
    dragStart = null;
    panning.value = false;
    return !dragged;
  };

  const style = computed(() => ({
    transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`,
    // 放大很多时显示清晰的像素格，方便对准
    imageRendering: zoom.value >= 4 ? ("pixelated" as const) : undefined,
  }));

  return { MIN_ZOOM, MAX_ZOOM, zoom, panning, style, reset, zoomAt, onWheel, onDown, onMove, onUp };
}
