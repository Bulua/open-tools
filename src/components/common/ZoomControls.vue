<script setup lang="ts">
import { ZoomIn, ZoomOut } from "lucide-vue-next";

/**
 * 缩放控件：缩小、当前比例（点击恢复为适应窗口）、放大。配合 useZoomPan 使用：
 * <ZoomControls :zoom="zoom" :min="MIN_ZOOM" :max="MAX_ZOOM" @zoom="zoomAt" @reset="resetView" />
 */
const props = defineProps<{ zoom: number; min: number; max: number }>();
const emit = defineEmits<{ zoom: [value: number]; reset: [] }>();

const STEP = 1.5;
</script>

<template>
  <div class="zoom">
    <button class="icon-btn" title="缩小" :disabled="props.zoom <= props.min" @click="emit('zoom', props.zoom / STEP)"><ZoomOut :size="14" /></button>
    <button class="zoom-value" title="恢复为适应窗口" @click="emit('reset')">{{ Math.round(props.zoom * 100) }}%</button>
    <button class="icon-btn" title="放大" :disabled="props.zoom >= props.max" @click="emit('zoom', props.zoom * STEP)"><ZoomIn :size="14" /></button>
  </div>
</template>

<style scoped>
.zoom {
  display: flex;
  align-items: center;
  gap: 2px;
}
.icon-btn {
  width: 26px;
  height: 26px;
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.zoom-value {
  min-width: 48px;
  height: 26px;
  padding: 0 4px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.zoom-value:hover {
  background: var(--hover);
}
</style>
