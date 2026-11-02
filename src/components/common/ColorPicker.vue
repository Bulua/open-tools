<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Pipette } from "lucide-vue-next";
import { usePopover } from "@/composables/usePopover";
import { hslToRgb, hsvToRgb, parseColor, rgbToHsl, rgbToHsv, toHex } from "@/utils/color";

/**
 * 取色板：替代系统自带的 input[type=color]，HEX、RGB、HSL 同时显示，都可以直接修改。
 * 值的格式与 input[type=color] 相同：「#rrggbb」。
 * 默认显示一个小色块，也可以通过插槽自定义触发区域。
 */
defineProps<{ disabled?: boolean }>();
const model = defineModel<string>({ default: "#000000" });

const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLDivElement>();
const { open, style, toggle } = usePopover(trigger, panel, { minWidth: 232, maxHeight: 320 });

// 内部用 HSV 保存：调到灰色（饱和度为 0）时色相不丢失
const hsv = ref({ h: 0, s: 0, v: 0 });
const rgb = computed(() => hsvToRgb(hsv.value.h, hsv.value.s, hsv.value.v));
const hex = computed(() => toHex({ ...rgb.value, a: 1 }, false));
const hsl = computed(() => rgbToHsl({ ...rgb.value, a: 1 }));

watch(
  model,
  (v) => {
    const c = parseColor(v);
    if (c && toHex({ ...c, a: 1 }, false) !== hex.value) hsv.value = rgbToHsv(c);
  },
  { immediate: true },
);

const setHsv = (h: number, s: number, v: number) => {
  hsv.value = { h, s, v };
  model.value = hex.value;
};
/** 设置 RGB；hue 传入时保留色相（例如在 HSL 里改成灰色） */
const setRgb = (c: { r: number; g: number; b: number }, hue?: number) => {
  const next = rgbToHsv(c);
  setHsv(next.s ? next.h : (hue ?? hsv.value.h), next.s, next.v);
};

// ---------- 拖动：饱和度/明度区域、色相条 ----------
const drag = (e: PointerEvent, onMove: (x: number, y: number) => void) => {
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const r = el.getBoundingClientRect();
    onMove(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
  };
  move(e);
  el.onpointermove = move;
  el.onpointerup = () => (el.onpointermove = el.onpointerup = null);
};
const onArea = (e: PointerEvent) => drag(e, (x, y) => setHsv(hsv.value.h, x, 1 - y));
const onHue = (e: PointerEvent) => drag(e, (x) => setHsv(x * 360, hsv.value.s, hsv.value.v));

// ---------- 数值输入 ----------
const num = (e: Event, max: number) => {
  const n = Math.round(Number((e.target as HTMLInputElement).value));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : null;
};
const onRgb = (key: "r" | "g" | "b", e: Event) => {
  const n = num(e, 255);
  if (n !== null) setRgb({ ...rgb.value, [key]: n });
};
const onHsl = (key: "h" | "s" | "l", e: Event) => {
  const n = num(e, key === "h" ? 360 : 100);
  if (n === null) return;
  const next = { ...hsl.value, [key]: n };
  setRgb(hslToRgb(next.h, next.s / 100, next.l / 100), next.h);
};
const onHex = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const c = parseColor(input.value.startsWith("#") ? input.value : `#${input.value}`);
  if (c) setRgb(c);
  else input.value = hex.value;
};

// 屏幕取色（Chromium 内核支持）
const canEyeDrop = typeof window !== "undefined" && "EyeDropper" in window;
const eyeDrop = async () => {
  try {
    const { sRGBHex } = await new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper().open();
    const c = parseColor(sRGBHex);
    if (c) setRgb(c);
  } catch {
    // 用户按 Esc 取消
  }
};
</script>

<template>
  <span class="cp" :class="{ 'cp-default': !$slots.default, disabled }">
    <button ref="trigger" type="button" class="cp-trigger" :disabled="disabled" @click="toggle">
      <slot><i class="cp-swatch" :style="{ background: model }" /></slot>
    </button>

    <Teleport to="body">
      <Transition name="pop">
        <div v-if="open" ref="panel" class="cp-panel" :style="style">
          <div class="cp-area" :style="{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }" @pointerdown="onArea">
            <i class="cp-thumb" :style="{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }" />
          </div>
          <div class="cp-bar">
            <span class="cp-preview" :style="{ background: hex }" />
            <div class="cp-hue" @pointerdown="onHue">
              <i class="cp-thumb" :style="{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h}, 100%, 50%)` }" />
            </div>
            <button v-if="canEyeDrop" type="button" class="cp-eye" title="从屏幕上取色" @click="eyeDrop"><Pipette :size="14" /></button>
          </div>
          <div class="cp-fields">
            <label>HEX</label>
            <input class="cp-hex" :value="hex" spellcheck="false" maxlength="7" @change="onHex" @keydown.enter="onHex" />
            <label>RGB</label>
            <div class="cp-nums">
              <input v-for="k in ['r', 'g', 'b'] as const" :key="k" type="number" min="0" max="255" :value="rgb[k]" :title="k.toUpperCase()" @input="onRgb(k, $event)" />
            </div>
            <label>HSL</label>
            <div class="cp-nums">
              <input type="number" min="0" max="360" :value="hsl.h" title="色相 0～360" @input="onHsl('h', $event)" />
              <input type="number" min="0" max="100" :value="hsl.s" title="饱和度 %" @input="onHsl('s', $event)" />
              <input type="number" min="0" max="100" :value="hsl.l" title="亮度 %" @input="onHsl('l', $event)" />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped>
/* 外层的尺寸、位置由使用方决定（插槽自定义时），这里不设置 display */
.cp-trigger {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.cp.disabled {
  opacity: 0.45;
}
.cp.disabled .cp-trigger {
  cursor: default;
}
/* 默认外观：与工具里常用的小色块一致 */
.cp-default {
  display: inline-block;
  flex-shrink: 0;
  width: 32px;
  height: 28px;
  padding: 3px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
}
.cp-swatch {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 3px;
}
</style>

<style>
.cp-panel {
  position: fixed;
  z-index: 100;
  width: 232px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  user-select: none;
}
/* 饱和度/明度区域：底色由 style 给出色相，上面叠白→透明、黑→透明两层渐变 */
.cp-area {
  position: relative;
  height: 140px;
  border-radius: 8px;
  background-image: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent);
  cursor: crosshair;
  touch-action: none;
}
.cp-thumb {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}
.cp-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cp-preview {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.cp-hue {
  position: relative;
  flex: 1;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
  cursor: pointer;
  touch-action: none;
}
.cp-hue .cp-thumb {
  top: 50%;
}
.cp-eye {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  color: var(--text-2);
  cursor: pointer;
}
.cp-eye:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.cp-fields {
  display: grid;
  grid-template-columns: 30px 1fr;
  align-items: center;
  gap: 6px 6px;
}
.cp-fields label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-3);
}
.cp-nums {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.cp-fields input {
  width: 100%;
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  -moz-appearance: textfield;
  appearance: textfield;
}
.cp-fields input::-webkit-inner-spin-button,
.cp-fields input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.cp-fields input:focus {
  outline: none;
  border-color: var(--accent);
}
</style>
