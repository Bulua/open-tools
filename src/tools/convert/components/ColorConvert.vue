<script setup lang="ts">
import { computed, ref } from "vue";
import CopyList from "@/components/common/CopyList.vue";
import { parseColor, rgbToHsl, toHex, toHsl, toRgb } from "../color";

/** HEX / RGB / HSL 互转：输入任意写法或用取色器选择，一次显示所有格式 */
const input = ref("#c96442");
const color = computed(() => parseColor(input.value));

const items = computed(() => {
  const c = color.value;
  if (!c) return [];
  const { h, s, l } = rgbToHsl(c);
  return [
    { label: "HEX", value: toHex(c) },
    { label: "RGB", value: toRgb(c) },
    { label: "HSL", value: toHsl(c) },
    { label: "RGB 数值", value: `${c.r}, ${c.g}, ${c.b}` },
    { label: "HSL 数值", value: `${h}, ${s}%, ${l}%` },
  ];
});

// 取色器只支持不透明的 #rrggbb
const pickerValue = computed(() => (color.value ? toHex({ ...color.value, a: 1 }, false) : "#000000"));
const onPick = (e: Event) => (input.value = (e.target as HTMLInputElement).value);
</script>

<template>
  <div class="color">
    <section class="card picker">
      <label class="swatch" title="点击打开取色器">
        <span class="swatch-color" :style="{ background: color ? toRgb(color) : 'transparent' }" />
        <input type="color" :value="pickerValue" @input="onPick" />
      </label>
      <div class="picker-body">
        <input
          v-model="input"
          class="field mono"
          :class="{ invalid: !color && input.trim() }"
          spellcheck="false"
          placeholder="#c96442、rgb(201, 100, 66)、hsl(15, 56%, 52%)"
        />
        <p v-if="!color && input.trim()" class="error">无法识别，支持 HEX、RGB、HSL 三种写法</p>
        <p v-else class="hint">点击左侧色块打开取色器，也可以直接输入任意写法</p>
      </div>
    </section>

    <section class="card sunken">
      <div class="card-title">结果</div>
      <CopyList :items="items" />
      <p v-if="!items.length" class="empty">输入颜色后显示各种格式</p>
    </section>
  </div>
</template>

<style scoped>
.color {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 820px;
}
.picker {
  flex-direction: row;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
}
/* 色块下面垫棋盘格，半透明颜色也能看出来 */
.swatch {
  position: relative;
  flex-shrink: 0;
  width: 88px;
  height: 88px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--border);
  background-image:
    linear-gradient(45deg, var(--active) 25%, transparent 25%),
    linear-gradient(-45deg, var(--active) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--active) 75%),
    linear-gradient(-45deg, transparent 75%, var(--active) 75%);
  background-size: 12px 12px;
  background-position: 0 0, 0 6px, 6px -6px, -6px 0;
}
.swatch-color {
  position: absolute;
  inset: 0;
}
.swatch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.picker-body {
  flex: 1;
  min-width: 0;
}
.hint,
.error,
.empty {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-3);
}
.error {
  color: var(--danger);
}
.empty {
  margin: 0 16px 14px;
}
</style>
