<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";
import { useStoredRef } from "@/composables/useStoredRef";

const props = withDefaults(defineProps<{ storageKey: string; label: string; initial?: number; hidden?: boolean }>(), { initial: 170, hidden: false });
const width = useStoredRef(`mqtt.split.${props.storageKey}`, props.initial);
const root = ref<HTMLElement>();
const available = ref(700);
const min = computed(() => Math.min(110, available.value * 0.35));
const max = computed(() => Math.max(min.value, Math.min(420, available.value - 150, available.value * 0.65)));
const fitted = computed(() => Math.max(min.value, Math.min(max.value, Number(width.value) || props.initial)));
const resizing = ref(false);
let drag: { id: number; x: number; width: number; element: HTMLElement } | undefined;
const stop = (event?: PointerEvent, cancel = false) => {
  if (!drag || (event && event.pointerId !== drag.id)) return;
  const old = drag; drag = undefined; resizing.value = false;
  if (cancel) width.value = old.width;
  if (old.element.hasPointerCapture?.(old.id)) old.element.releasePointerCapture(old.id);
};
const start = (event: PointerEvent) => {
  if (event.button !== 0) return;
  event.preventDefault(); available.value = root.value?.clientWidth || 700;
  const element = event.currentTarget as HTMLElement;
  drag = { id: event.pointerId, x: event.clientX, width: fitted.value, element }; resizing.value = true;
  element.setPointerCapture(event.pointerId);
};
const move = (event: PointerEvent) => { if (drag?.id === event.pointerId) width.value = Math.max(min.value, Math.min(max.value, drag.width + event.clientX - drag.x)); };
const key = (event: KeyboardEvent) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault(); width.value = event.key === "Home" ? min.value : event.key === "End" ? max.value : Math.max(min.value, Math.min(max.value, fitted.value + (event.key === "ArrowRight" ? 10 : -10)));
};
let observer: ResizeObserver | undefined;
onMounted(() => {
  if (typeof ResizeObserver === "undefined" || !root.value) return;
  observer = new ResizeObserver(([entry]) => { if (entry?.contentRect.width) available.value = entry.contentRect.width; }); observer.observe(root.value);
});
onBeforeUnmount(() => { observer?.disconnect(); stop(); });
onDeactivated(() => stop());
</script>

<template>
  <div ref="root" class="mqtt-split" :class="{ resizing }">
    <div v-show="!hidden" class="split-left" :style="{ flexBasis: `${fitted}px` }"><slot name="left" /></div>
    <div v-show="!hidden" class="splitter" role="separator" tabindex="0" aria-orientation="vertical" :aria-label="label" :aria-valuemin="Math.round(min)" :aria-valuemax="Math.round(max)" :aria-valuenow="Math.round(fitted)" @pointerdown="start" @pointermove="move" @pointerup="stop($event)" @pointercancel="stop($event, true)" @lostpointercapture="stop($event)" @dblclick="width = initial" @keydown="key" />
    <div class="split-right"><slot name="right" /></div>
  </div>
</template>

<style scoped>
.mqtt-split { display: flex; flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.split-left, .split-right { display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; }
.split-left { flex-shrink: 0; }
.split-right { flex: 1; }
.splitter { position: relative; flex: 0 0 1px; z-index: 1; background: var(--border); cursor: col-resize; touch-action: none; }
.splitter::before { content: ""; position: absolute; inset: 0 -4px; }
.splitter:hover, .splitter:focus-visible, .resizing .splitter { background: var(--accent); outline: 1px solid var(--accent); }
.resizing, .resizing :deep(*) { cursor: col-resize !important; user-select: none !important; }
</style>
