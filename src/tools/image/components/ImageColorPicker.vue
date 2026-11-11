<script setup lang="ts">
import { recordToolUsage } from "@/composables/toolLibrary";
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RefreshCw, Trash2 } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import ZoomControls from "@/components/common/ZoomControls.vue";
import CopyList from "@/components/common/CopyList.vue";
import { toHex, toHsl, toRgb, type Rgba } from "@/utils/color";
import { createCanvas, extractPalette, loadImage, type PaletteColor } from "../utils";
import { useZoomPan } from "@/composables/useZoomPan";
import { showError } from "@/utils/errorToast";

const { t } = useI18n();

/** 图片取色：鼠标移到图片上预览颜色，点击取色；自动提取主色调 */
const loaded = ref(false);
const dropZone = ref<InstanceType<typeof FileDropZone>>();
const fileName = ref("");
const view = ref<HTMLCanvasElement>();
let ctx: CanvasRenderingContext2D | null = null;

const palette = ref<PaletteColor[]>([]);
const picked = ref<Rgba[]>([]);
const selected = ref<Rgba | null>(null);
const hover = ref<{ color: Rgba; x: number; y: number } | null>(null);

const onFiles = async ([file]: File[]) => {
  try {
    const img = await loadImage(file);
    fileName.value = file.name;
    loaded.value = true;
    picked.value = [];
    resetView();
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
    recordToolUsage();
  } catch (e) {
    showError(e);
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

// ---------- 缩放与平移 ----------
const { MIN_ZOOM, MAX_ZOOM, zoom, panning, style: viewStyle, reset: resetView, zoomAt, onWheel: wheel, onDown, onMove: drag, onUp: up } = useZoomPan();

const onWheel = (e: WheelEvent) => {
  wheel(e);
  onMove(e);
};
const onUp = (e: PointerEvent) => up() && pick(e);

// 提示框定位在图片外层容器里，用相对容器的坐标
const onMove = (e: PointerEvent | WheelEvent) => {
  if (e instanceof PointerEvent && drag(e)) {
    hover.value = null;
    return;
  }
  const color = colorAt(e);
  const wrap = view.value?.parentElement?.getBoundingClientRect();
  hover.value = color && wrap ? { color, x: e.clientX - wrap.left, y: e.clientY - wrap.top } : null;
};

const pick = (e: MouseEvent) => {
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
  <div class="picker">
    <aside class="panel card">
      <section class="section">
        <h3>{{ t("image.currentColor") }}</h3>
        <div class="current">
          <span class="big-swatch" :style="{ background: selected ? css(selected) : 'transparent' }" />
          <CopyList :items="items" label-width="36px" />
        </div>
      </section>

      <section class="section">
        <h3>{{ t("image.palette") }}</h3>
        <p v-if="!palette.length" class="empty">{{ t("image.paletteEmpty") }}</p>
        <div v-else class="swatches">
          <button
            v-for="c in palette"
            :key="toHex({ ...c, a: 1 })"
            class="swatch"
            :style="{ background: css(c) }"
            :title="t('image.colorShare', { hex: toHex({ ...c, a: 1 }), n: Math.round(c.ratio * 100) })"
            @click="selected = { ...c, a: 1 }"
          >
            <em>{{ Math.round(c.ratio * 100) }}%</em>
          </button>
        </div>
      </section>

      <section class="section">
        <h3>
          {{ t("image.picked") }}
          <button v-if="picked.length" class="link" :title="t('image.clear')" @click="picked = []"><Trash2 :size="12" /></button>
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
        <p v-else class="empty">{{ t("image.pickedEmpty") }}</p>
      </section>
    </aside>

    <section class="stage card">
      <header class="card-title">
        <span class="file" :title="fileName">{{ fileName || t("image.noImage") }}</span>
        <span v-if="loaded" class="hint">{{ t("image.pickHint") }}</span>
        <ZoomControls v-if="loaded" :zoom="zoom" :min="MIN_ZOOM" :max="MAX_ZOOM" @zoom="zoomAt" @reset="resetView" />
        <button v-if="loaded" class="btn small subtle" :title="t('image.replaceImage')" @click="dropZone?.open()"><RefreshCw :size="14" />{{ t("image.replace") }}</button>
      </header>
      <!-- 加载后隐藏但保留：「更换」按钮由它打开选择框 -->
      <FileDropZone
        v-show="!loaded"
        ref="dropZone"
        :paste="!loaded"
        class="drop"
        accept="image/*"
        :title="t('image.dropImage')"
        :hint="t('image.pickDropHint')"
        @files="onFiles"
      />
      <div v-if="loaded" class="canvas-area">
        <div
          class="canvas-wrap"
          :class="{ panning }"
          @wheel.prevent="onWheel"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
          @pointerleave="hover = null"
        >
          <canvas ref="view" :style="viewStyle" />
          <div v-if="hover" class="loupe" :style="{ left: `${hover.x + 16}px`, top: `${hover.y + 16}px` }">
            <span class="dot" :style="{ background: css(hover.color) }" />
            {{ toHex(hover.color) }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.drop {
  flex: 1;
  margin: 12px;
}
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
.card-title .file {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-title .hint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
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
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}
.canvas-wrap.panning {
  cursor: grabbing;
}
.canvas-wrap canvas {
  max-width: 100%;
  max-height: 100%;
  border-radius: 4px;
  transform-origin: center;
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
/* 窗口较窄时面板收窄，仍保持左右排列 */
@media (max-width: 1100px) {
  .panel {
    flex-basis: 260px;
  }
}
</style>
