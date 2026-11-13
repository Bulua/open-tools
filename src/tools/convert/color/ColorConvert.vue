<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import CopyList from "@/components/common/CopyList.vue";
import ColorPicker from "@/components/common/ColorPicker.vue";
import { parseColor, rgbToHsl, toHex, toHsl, toRgb } from "@/utils/color";

/** HEX / RGB / HSL 互转：输入任意写法或用取色器选择，一次显示所有格式 */
const { t } = useI18n();
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
    { label: t("convert.rgbValues"), value: `${c.r}, ${c.g}, ${c.b}` },
    { label: t("convert.hslValues"), value: `${h}, ${s}%, ${l}%` },
  ];
});

// 取色器只支持不透明的 #rrggbb
const pickerValue = computed(() => (color.value ? toHex({ ...color.value, a: 1 }, false) : "#000000"));

useToolResult(() => color.value ? input.value : "");
</script>

<template>
  <div class="color">
    <!-- 左：大色块（点击打开取色器）+ 输入 -->
    <section class="card picker">
      <div class="card-title">{{ t("convert.color") }}</div>
      <ColorPicker class="swatch" :title="t('convert.openPicker')" :model-value="pickerValue" @update:model-value="input = $event">
        <span class="swatch-color" :style="{ background: color ? toRgb(color) : 'transparent' }" />
        <span class="swatch-hint">{{ t("convert.pickColor") }}</span>
      </ColorPicker>
      <div class="picker-body">
        <input
          v-model="input"
          class="field mono"
          :class="{ invalid: !color && input.trim() }"
          spellcheck="false"
          placeholder="#c96442、rgb(201, 100, 66)、hsl(15, 56%, 52%)"
        />
        <p v-if="!color && input.trim()" class="error">{{ t("convert.colorInvalid") }}</p>
        <p v-else class="hint">{{ t("convert.colorHint") }}</p>
      </div>
    </section>

    <!-- 右：各种格式 -->
    <section class="card">
      <div class="card-title">{{ t("convert.result") }}</div>
      <CopyList :items="items" />
      <p v-if="!items.length" class="empty">{{ t("convert.colorEmpty") }}</p>
    </section>
  </div>
</template>

<style scoped>
.color {
  display: grid;
  grid-template-columns: minmax(260px, 2fr) minmax(0, 3fr);
  align-items: start;
  gap: 14px;
}
@media (max-width: 1000px) {
  .color {
    grid-template-columns: 1fr;
  }
}
/* 色块下面垫棋盘格，半透明颜色也能看出来 */
.swatch {
  position: relative;
  display: block;
  height: 160px;
  margin: 14px 16px 0;
  border-radius: 8px;
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
.swatch-hint {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 2px 8px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.15s;
}
.swatch:hover .swatch-hint {
  opacity: 1;
}
.picker-body {
  padding: 12px 16px 14px;
}
.hint,
.error,
.empty {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-3);
}
.empty {
  margin: 0 16px 14px;
}
</style>
