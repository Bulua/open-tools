import { computed, nextTick, onBeforeUnmount, ref, type Ref } from "vue";

/**
 * 让图片在预览区内完整显示（等比缩放、不放大）。
 *
 * 用法：
 *   const { observeArea, frameStyle, scale } = useFitFrame(imageSize);
 *   <div :ref="observeArea" class="area"><div class="frame" :style="frameStyle">…</div></div>
 *
 * 注意：函数 ref 在组件每次重新渲染时都会被调用，
 * 所以只在元素真正变化时才重新监听，尺寸也只在数值变化时才更新，否则会无限循环渲染。
 */
export function useFitFrame(imageSize: Ref<{ width: number; height: number } | null>) {
  const areaSize = ref({ width: 0, height: 0 });
  let observer: ResizeObserver | undefined;
  let observed: HTMLElement | null = null;

  const setAreaSize = (width: number, height: number) => {
    if (width !== areaSize.value.width || height !== areaSize.value.height) areaSize.value = { width, height };
  };

  const observeArea = (el: unknown) => {
    const target = el instanceof HTMLElement ? el : null;
    if (target === observed) return;
    observer?.disconnect();
    observer = undefined;
    observed = target;
    if (!target) return;
    // 先立即量一次，之后窗口或布局变化时由 ResizeObserver 更新
    nextTick(() => setAreaSize(target.clientWidth, target.clientHeight));
    observer = new ResizeObserver(([entry]) => setAreaSize(entry.contentRect.width, entry.contentRect.height));
    observer.observe(target);
  };
  onBeforeUnmount(() => observer?.disconnect());

  /** 显示尺寸 / 图片实际尺寸 */
  const scale = computed(() => {
    const img = imageSize.value;
    const { width, height } = areaSize.value;
    if (!img || !width || !height) return 0;
    return Math.min(1, width / img.width, height / img.height);
  });

  const frameStyle = computed(() => {
    const img = imageSize.value;
    if (!img || !scale.value) return {};
    return { width: `${img.width * scale.value}px`, height: `${img.height * scale.value}px` };
  });

  return { observeArea, frameStyle, scale };
}
