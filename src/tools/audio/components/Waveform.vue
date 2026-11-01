<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { duration, formatTime, peaks, type Pcm } from "../pcm";

/**
 * 波形：点击设置播放位置，拖动选择一段区间。
 * selection 为 [开始秒, 结束秒] 或 null；position 为播放位置（秒）。
 */
const props = withDefaults(defineProps<{ pcm: Pcm; position?: number | null; interactive?: boolean }>(), { position: null, interactive: true });
const selection = defineModel<[number, number] | null>("selection", { default: null });
const emit = defineEmits<{ seek: [seconds: number] }>();

const wrap = ref<HTMLDivElement>();
const canvas = ref<HTMLCanvasElement>();
let cache: { width: number; data: ReturnType<typeof peaks> } | null = null;

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const draw = () => {
  const c = canvas.value;
  const w = wrap.value;
  if (!c || !w) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(w.clientWidth));
  const height = Math.max(1, Math.floor(w.clientHeight));
  c.width = width * dpr;
  c.height = height * dpr;
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const total = duration(props.pcm);
  // 每 2 像素一根竖线
  const bars = Math.floor(width / 2);
  if (!cache || cache.width !== bars) cache = { width: bars, data: peaks(props.pcm, bars) };
  const { min, max } = cache.data;
  const mid = height / 2;
  const sel = selection.value;
  const [s0, s1] = sel ? [Math.min(...sel), Math.max(...sel)] : [0, 0];

  if (sel && total) {
    ctx.fillStyle = cssVar("--accent-soft");
    ctx.fillRect((s0 / total) * width, 0, ((s1 - s0) / total) * width, height);
  }
  const accent = cssVar("--accent");
  const muted = cssVar("--text-3");
  for (let i = 0; i < bars; i++) {
    const t = ((i + 0.5) / bars) * total;
    ctx.fillStyle = !sel || (t >= s0 && t <= s1) ? accent : muted;
    const top = mid - Math.max(0.5, max[i] * mid * 0.95);
    const bottom = mid - Math.min(-0.5, min[i] * mid * 0.95);
    ctx.fillRect(i * 2, top, 1.2, bottom - top);
  }
  if (props.position !== null && total) {
    const x = (props.position / total) * width;
    ctx.fillStyle = cssVar("--text");
    ctx.fillRect(x - 0.5, 0, 1.5, height);
  }
};

watch(
  () => props.pcm,
  () => {
    cache = null;
    draw();
  },
);
watch([selection, () => props.position], draw);

let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(draw);
  if (wrap.value) observer.observe(wrap.value);
  draw();
});
onBeforeUnmount(() => observer?.disconnect());

// ---------- 鼠标：点击定位，拖动选区 ----------
const timeAt = (clientX: number) => {
  const r = wrap.value!.getBoundingClientRect();
  return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration(props.pcm);
};
const onPointerDown = (e: PointerEvent) => {
  if (!props.interactive) return;
  e.preventDefault();
  const startX = e.clientX;
  const t0 = timeAt(e.clientX);
  // 拖动中的选区记在本地：外部的 v-model 要到下一次渲染才更新
  let range: [number, number] | null = null;
  const move = (ev: PointerEvent) => {
    if (!range && Math.abs(ev.clientX - startX) < 4) return;
    range = [t0, timeAt(ev.clientX)];
    selection.value = range;
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (range) {
      selection.value = [Math.min(...range), Math.max(...range)];
    } else {
      selection.value = null;
      emit("seek", t0);
    }
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
};
</script>

<template>
  <div class="waveform">
    <div ref="wrap" class="canvas-wrap" :class="{ interactive }" @pointerdown="onPointerDown">
      <canvas ref="canvas" />
    </div>
    <div class="ruler">
      <span>0:00</span>
      <span>{{ formatTime(duration(pcm) / 2, false) }}</span>
      <span>{{ formatTime(duration(pcm), false) }}</span>
    </div>
  </div>
</template>

<style scoped>
.waveform {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}
.canvas-wrap {
  position: relative;
  flex: 1;
  min-height: 60px;
}
.canvas-wrap.interactive {
  cursor: text;
}
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.ruler {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
</style>
