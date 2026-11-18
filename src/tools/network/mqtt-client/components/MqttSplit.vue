<script setup lang="ts">
import { ref } from "vue";
import { usePanelResize } from "@/composables/usePanelResize";

const props = withDefaults(defineProps<{ storageKey: string; label: string; initial?: number }>(), { initial: 170 });
const root = ref<HTMLElement>();
const { width, min, max, fitted, resizing, start, move, stop, key } = usePanelResize(root, {
  storageKey: `mqtt.split.${props.storageKey}`, initial: props.initial, available: 700,
  bounds: available => {
    const min = Math.min(110, available * 0.35);
    return { min, max: Math.max(min, Math.min(420, available - 150, available * 0.65)) };
  },
});
</script>

<template>
  <div ref="root" class="mqtt-split" :class="{ resizing }">
    <div class="split-left" :style="{ flexBasis: `${fitted}px` }"><slot name="left" /></div>
    <div class="splitter" role="separator" tabindex="0" aria-orientation="vertical" :aria-label="label" :aria-valuemin="Math.round(min)" :aria-valuemax="Math.round(max)" :aria-valuenow="Math.round(fitted)" @pointerdown="start" @pointermove="move" @pointerup="stop($event)" @pointercancel="stop($event, true)" @lostpointercapture="stop($event)" @dblclick="width = initial" @keydown="key" />
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
