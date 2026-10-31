<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { RefreshCw, Trash2 } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import CopyList from "@/components/common/CopyList.vue";
import { toHex, toHsl, toRgb, type Rgba } from "@/utils/color";
import { createCanvas, extractPalette, loadImage, type PaletteColor } from "../utils";

/** 图片取色：鼠标移到图片上预览颜色，点击取色；自动提取主色调 */
const loaded = ref(false);
const fileName = ref("");
const loadError = ref("");
const view = ref<HTMLCanvasElement>();
let ctx: CanvasRenderingContext2D | null = null;

const palette = ref<PaletteColor[]>([]);
const picked = ref<Rgba[]>([]);
const selected = ref<Rgba | null>(null);
const hover = ref<{ color: Rgba; x: number; y: number } | null>(null);

const onFiles = async ([file]: File[]) => {
  loadError.value = "";
  try {
    const img = await loadImage(file);
    fileName.value = file.name;
    loaded.value = true;
    picked.value = [];
    await nextTick();
    const canvas = view.value!;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);

    // 缩小后再统计主色调，速度快且结果差别不大
    const scale = Math.min(1, 120 / Math.max(img.naturalWidth, img.naturalHeight));
    const small = createCanvas(Math.max(1, Math.round(img.naturalWidth * scale)), Math.max(1, Math.round(img.naturalHeight * scale)));
    small.ctx.drawImage(img, 0, 0, small.canvas.width, small.canvas.height);
    palette.value = extractPalette(small.ctx.getImageData(0, 0, small.canvas.width, small.canvas.height).data);
    selected.value = palette.value[0] ? { ...palette.value[0], a: 1 } : null;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
};

/** 鼠标位置换算成图片像素，读取该点颜色 */
const colorAt = (e: MouseEvent): Rgba | null => {
  const canvas = view.value;
  if (!canvas || !ctx) return null;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
  const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
  return { r, g, b, a: Math.round((a / 255) * 100) / 100 };
};

// 提示框定位在图片外层容器里，用相对容器的坐标
const onMove = (e: MouseEvent) => {
  const color = colorAt(e);
  const wrap = view.value?.parentElement?.getBoundingClientRect();
  hover.value = color && wrap ? { color, x: e.clientX - wrap.left, y: e.clientY - wrap.top } : null;
};

const onClick = (e: MouseEvent) => {
  const color = colorAt(e);
  if (!color) return;
  selected.value = color;
  if (!picked.value.some((c) => toHex(c) === toHex(color))) picked.value = [color, ...picked.value].slice(0, 16);
};

const items = computed(() => {
  const c = selected.value;
  if (!c) return [];
  return [
    { label: "HEX", value: toHex(c) },
    { label: "RGB", value: toRgb(c) },
    { label: "HSL", value: toHsl(c) },
  ];
});

const css = (c: Rgba | PaletteColor) => toRgb({ a: 1, ...c });
</script>

<template>
  <FileDropZone
    v-if="!loaded"
    accept="image/*"
    title="拖入图片，或点击选择"
    hint="点击图片任意位置取色，并自动提取主色调；也可以按 Ctrl + V 粘贴截图"
    @files="onFiles"
  >
    <span v-if="loadError" class="load-error">{{ loadError }}</span>
  </FileDropZone>

  <div v-else class="picker">
    <section class="stage card">
      <header class="stage-head">
        <span class="file" :title="fileName">{{ fileName }}</span>
        <span class="tip">点击图片取色</span>
        <label class="btn subtle">
          <RefreshCw :size="14" />更换
          <input type="file" accept="image/*" hidden @change="onFiles([...(($event.target as HTMLInputElement).files ?? [])])" />
        </label>
      </header>
      <div class="canvas-area">
        <div class="canvas-wrap">
          <canvas ref="view" @mousemove="onMove" @mouseleave="hover = null" @click="onClick" />
          <div v-if="hover" class="loupe" :style="{ left: `${hover.x + 16}px`, top: `${hover.y + 16}px` }">
            <span class="dot" :style="{ background: css(hover.color) }" />
            {{ toHex(hover.color) }}
          </div>
        </div>
      </div>
    </section>

    <aside class="panel card">
      <section class="section">
        <h3>当前颜色</h3>
        <div class="current">
          <span class="big-swatch" :style="{ background: selected ? css(selected) : 'transparent' }" />
          <CopyList :items="items" label-width="36px" />
        </div>
      </section>

      <section class="section">
        <h3>主色调</h3>
        <div class="swatches">
          <button
            v-for="c in palette"
            :key="toHex({ ...c, a: 1 })"
            class="swatch"
            :style="{ background: css(c) }"
            :title="`${toHex({ ...c, a: 1 })}，约占 ${Math.round(c.ratio * 100)}%`"
            @click="selected = { ...c, a: 1 }"
          >
            <em>{{ Math.round(c.ratio * 100) }}%</em>
          </button>
        </div>
      </section>

      <section class="section">
        <h3>
          已取颜色
          <button v-if="picked.length" class="link" title="清空" @click="picked = []"><Trash2 :size="12" /></button>
        </h3>
        <div v-if="picked.length" class="swatches">
          <button
            v-for="c in picked"
            :key="toHex(c)"
            class="swatch small"
            :class="{ on: selected && toHex(selected) === toHex(c) }"
            :style="{ background: css(c) }"
            :title="toHex(c)"
            @click="selected = c"
          />
        </div>
        <p v-else class="empty">点击图片取到的颜色会出现在这里</p>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.picker {
  flex: 1;
  display: flex;
  gap: 14px;
  min-height: 0;
}
.stage {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.stage-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 4px 8px 4px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
}
.file {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.tip {
  flex: 1;
  font-size: 12px;
  color: var(--text-3);
}
.canvas-area {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 12px;
}
/* 绝对定位让图片按区域大小等比缩放 */
.canvas-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.canvas-wrap canvas {
  max-width: 100%;
  max-height: 100%;
  cursor: crosshair;
  border-radius: 4px;
}
.loupe {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  font-family: var(--font-mono);
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
}
.dot {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid var(--border);
}

/* 右侧一张卡片，各部分用细线分隔（与图片编辑一致） */
.panel {
  flex: 0 0 300px;
  overflow-y: auto;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}
.section + .section {
  border-top: 1px solid var(--border);
}
h3 {
  display: flex;
  justify-content: space-between;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
}
.link {
  border: none;
  background: none;
  padding: 0;
  color: var(--text-3);
}
.link:hover {
  color: var(--text);
}
.current {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.big-swatch {
  height: 56px;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.current :deep(.copy-list) {
  padding: 0;
  margin: 0 -8px;
}
.swatches {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.swatch {
  position: relative;
  height: 44px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.swatch em {
  position: absolute;
  right: 4px;
  bottom: 3px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-style: normal;
  font-size: 10px;
}
.swatch.small {
  height: 32px;
}
.swatch.on {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.empty {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
.load-error {
  margin-top: 8px;
  color: var(--danger);
}
/* 窗口较窄时面板收窄，仍保持左右排列 */
@media (max-width: 1100px) {
  .panel {
    flex-basis: 260px;
  }
}
</style>
