<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{ modelValue: number; count: number; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: number] }>();
const column = ref<HTMLElement>();
const rows = computed(() => Array.from({ length: props.count * 3 }, (_, index) => index % props.count));
const rowHeight = 32;
let settling: ReturnType<typeof setTimeout> | undefined;
let destination: number | undefined;
let wheelDelta = 0;
const valueAt = () => Math.round((column.value?.scrollTop ?? 0) / rowHeight) % props.count;

function reset(focus = false) {
  clearTimeout(settling);
  destination = undefined;
  if (!column.value) return;
  column.value.scrollTop = (props.count + props.modelValue) * rowHeight;
  if (focus) column.value.focus({ preventScroll: true });
}
function onScroll() {
  emit("update:modelValue", valueAt());
  clearTimeout(settling);
  // 停稳后移回中间一轮，边界处继续向上或向下都可以循环选择。
  settling = setTimeout(() => reset(), 140);
}
function moveTo(index: number) {
  const el = column.value;
  if (!el) return;
  destination = Math.max(0, Math.min(rows.value.length - 1, index));
  const top = destination * rowHeight;
  if (typeof el.scrollTo === "function" && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    el.scrollTo({ top, behavior: "smooth" });
  } else {
    el.scrollTop = top;
    emit("update:modelValue", destination % props.count);
  }
}
function choose(value: number) {
  const current = destination ?? Math.round((column.value?.scrollTop ?? 0) / rowHeight);
  moveTo(Math.round((current - value) / props.count) * props.count + value);
}
function onWheel(event: WheelEvent) {
  if (event.ctrlKey || !event.deltaY) return;
  event.preventDefault();
  wheelDelta += event.deltaY * (event.deltaMode === 1 ? rowHeight : event.deltaMode === 2 ? rowHeight * 5 : 1);
  const steps = Math.trunc(wheelDelta / 32);
  if (!steps) return;
  wheelDelta -= steps * 32;
  moveTo((destination ?? Math.round((column.value?.scrollTop ?? 0) / rowHeight)) + steps);
}
function onKey(event: KeyboardEvent) {
  const steps: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 };
  if (!(event.key in steps) && !["Home", "End"].includes(event.key)) return;
  event.preventDefault();
  choose(event.key === "Home" ? 0 : event.key === "End" ? props.count - 1 : (props.modelValue + steps[event.key] + props.count) % props.count);
}
watch(() => props.modelValue, () => { if (valueAt() !== props.modelValue) reset(); });
onBeforeUnmount(() => clearTimeout(settling));
defineExpose({ reset });
</script>

<template>
  <div ref="column" class="time-wheel" role="spinbutton" tabindex="0" :aria-label="label" :aria-valuemin="0"
    :aria-valuemax="count - 1" :aria-valuenow="modelValue" :aria-valuetext="String(modelValue).padStart(2, '0')"
    @scroll="onScroll" @keydown="onKey" @wheel="onWheel">
    <div v-for="(value, index) in rows" :key="index" class="time-wheel-row" :class="{ selected: value === modelValue }"
      aria-hidden="true" @click="choose(value)">{{ String(value).padStart(2, '0') }}</div>
  </div>
</template>

<style scoped>
.time-wheel {
  height: 160px;
  padding: 64px 0;
  overflow-y: auto;
  scrollbar-width: none;
  overscroll-behavior: contain;
  scroll-snap-type: y mandatory;
  font-variant-numeric: tabular-nums;
  text-align: center;
  mask-image: linear-gradient(to bottom, transparent, var(--text) 32%, var(--text) 68%, transparent);
}
.time-wheel::-webkit-scrollbar { display: none; }
.time-wheel:focus-visible { outline: none; background: var(--hover); border-radius: 8px; }
.time-wheel-row { height: 32px; line-height: 32px; scroll-snap-align: center; font-size: 22px; color: var(--text-3); cursor: pointer; user-select: none; }
.time-wheel-row.selected { font-weight: 600; color: var(--text); }
</style>
