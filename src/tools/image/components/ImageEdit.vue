<script setup lang="ts">
import { computed, nextTick, reactive, ref, shallowRef, watch } from "vue";
import { Crop, Download, FlipHorizontal2, FlipVertical2, Lock, LockOpen, RefreshCw, RotateCcw, RotateCw, Undo2 } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useFitFrame } from "@/composables/useFitFrame";
import { saveFile } from "@/utils/saveFile";
import { IMAGE_FORMATS, canvasToBytes, createCanvas, formatInfo, loadImage, outputFormatOf, type ImageFormat } from "../utils";
import { initialCrop, updateCrop, type CropHandle, type Rect } from "../crop";

/**
 * 图片编辑：裁剪、旋转、翻转、调整尺寸、调色。
 * - 裁剪 / 旋转 / 翻转 / 尺寸：生成新画布并记入历史，可以撤销
 * - 调色：预览时用 CSS 滤镜（拖动滑块很流畅），导出时才真正应用到像素
 */

// ---------- 图片与历史 ----------
const fileName = ref("");
const fileType = ref<ImageFormat>("image/png");
const history = shallowRef<HTMLCanvasElement[]>([]);
const current = computed(() => history.value[history.value.length - 1] ?? null);
const loadError = ref("");
const dropZone = ref<InstanceType<typeof FileDropZone>>();

const onFiles = async ([file]: File[]) => {
  loadError.value = "";
  try {
    const img = await loadImage(file);
    const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    fileName.value = file.name;
    fileType.value = outputFormatOf(file.type);
    exportFormat.value = fileType.value;
    history.value = [canvas];
    resetAdjust();
    cropping.value = false;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
};

const push = (canvas: HTMLCanvasElement) => (history.value = [...history.value, canvas]);
const undo = () => history.value.length > 1 && (history.value = history.value.slice(0, -1));
const reset = () => {
  history.value = history.value.slice(0, 1);
  resetAdjust();
  cropping.value = false;
};

// ---------- 预览 ----------
const view = ref<HTMLCanvasElement>();
// 图片在预览区内完整显示
const { observeArea, frameStyle } = useFitFrame(current);

watch(current, async (src) => {
  await nextTick();
  if (!src || !view.value) return;
  view.value.width = src.width;
  view.value.height = src.height;
  view.value.getContext("2d")!.drawImage(src, 0, 0);
  resizeW.value = src.width;
  resizeH.value = src.height;
  if (cropping.value) crop.value = initialCrop(src.width, src.height, ratio.value);
});

// ---------- 旋转 / 翻转 / 尺寸 ----------
const rotate = (deg: 90 | -90) => {
  const src = current.value!;
  const { canvas, ctx } = createCanvas(src.height, src.width);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  push(canvas);
};

const flip = (horizontal: boolean) => {
  const src = current.value!;
  const { canvas, ctx } = createCanvas(src.width, src.height);
  ctx.translate(horizontal ? src.width : 0, horizontal ? 0 : src.height);
  ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
  ctx.drawImage(src, 0, 0);
  push(canvas);
};

const resizeW = ref(0);
const resizeH = ref(0);
const keepRatio = ref(true);
const onResizeW = (e: Event) => {
  resizeW.value = Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 1));
  if (keepRatio.value && current.value) resizeH.value = Math.max(1, Math.round((resizeW.value * current.value.height) / current.value.width));
};
const onResizeH = (e: Event) => {
  resizeH.value = Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 1));
  if (keepRatio.value && current.value) resizeW.value = Math.max(1, Math.round((resizeH.value * current.value.width) / current.value.height));
};
const applyResize = () => {
  const src = current.value!;
  if (resizeW.value === src.width && resizeH.value === src.height) return;
  const { canvas, ctx } = createCanvas(resizeW.value, resizeH.value);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  push(canvas);
};

// ---------- 裁剪 ----------
const RATIOS: { label: string; value: number | null }[] = [
  { label: "自由", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];
const cropping = ref(false);
const ratio = ref<number | null>(null);
const crop = ref<Rect>({ x: 0, y: 0, w: 0, h: 0 });

const startCrop = () => {
  const src = current.value!;
  crop.value = initialCrop(src.width, src.height, ratio.value);
  cropping.value = true;
};
const setRatio = (r: number | null) => {
  ratio.value = r;
  if (cropping.value) startCrop();
};
const applyCrop = () => {
  const src = current.value!;
  const { x, y, w, h } = crop.value;
  const { canvas, ctx } = createCanvas(w, h);
  ctx.drawImage(src, x, y, w, h, 0, 0, w, h);
  cropping.value = false;
  push(canvas);
};

/** 裁剪框在预览图上的位置（百分比，跟随预览缩放） */
const cropStyle = computed(() => {
  const src = current.value;
  if (!src) return {};
  const { x, y, w, h } = crop.value;
  return {
    left: `${(x / src.width) * 100}%`,
    top: `${(y / src.height) * 100}%`,
    width: `${(w / src.width) * 100}%`,
    height: `${(h / src.height) * 100}%`,
  };
});

// 拖动：屏幕像素换算成图片像素
const onCropPointerDown = (e: PointerEvent, handle: CropHandle) => {
  const src = current.value;
  if (!src || !view.value) return;
  e.preventDefault();
  const scale = src.width / view.value.getBoundingClientRect().width;
  const start = { ...crop.value };
  const [sx, sy] = [e.clientX, e.clientY];
  const move = (ev: PointerEvent) => {
    crop.value = updateCrop(start, handle, (ev.clientX - sx) * scale, (ev.clientY - sy) * scale, src.width, src.height, ratio.value);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
};

// ---------- 调色 ----------
const adjust = reactive({ brightness: 100, contrast: 100, saturate: 100, grayscale: false });
const resetAdjust = () => Object.assign(adjust, { brightness: 100, contrast: 100, saturate: 100, grayscale: false });
const filter = computed(
  () =>
    `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) saturate(${adjust.saturate}%)${adjust.grayscale ? " grayscale(1)" : ""}`,
);
const adjusted = computed(() => adjust.brightness !== 100 || adjust.contrast !== 100 || adjust.saturate !== 100 || adjust.grayscale);
const ADJUST_SLIDERS = [
  { key: "brightness", label: "亮度" },
  { key: "contrast", label: "对比度" },
  { key: "saturate", label: "饱和度" },
] as const;

// ---------- 导出 ----------
const exportFormat = useStoredRef<ImageFormat>("image-edit.format", "image/png");
const exportQuality = useStoredRef("image-edit.quality", 90);
const saved = ref(false);

const download = async () => {
  const src = current.value!;
  const { canvas, ctx } = createCanvas(src.width, src.height);
  ctx.filter = filter.value;
  ctx.drawImage(src, 0, 0);
  const bytes = await canvasToBytes(canvas, exportFormat.value, exportQuality.value / 100);
  const base = fileName.value.replace(/\.[^.]+$/, "") || "image";
  if (await saveFile(bytes, `${base}_edited.${formatInfo(exportFormat.value).ext}`)) {
    saved.value = true;
    setTimeout(() => (saved.value = false), 1500);
  }
};
</script>

<template>
  <FileDropZone
    v-if="!current"
    ref="dropZone"
    accept="image/*"
    title="拖入图片，或点击选择"
    hint="可以裁剪、旋转、翻转、调整尺寸和颜色，也可以按 Ctrl + V 粘贴截图"
    @files="onFiles"
  >
    <span v-if="loadError" class="load-error">{{ loadError }}</span>
  </FileDropZone>

  <div v-else class="editor">
    <section class="stage card">
      <header class="stage-head">
        <span class="file" :title="fileName">{{ fileName }}</span>
        <span class="dims">{{ current.width }} × {{ current.height }}</span>
        <span class="spacer" />
        <button class="btn subtle" :disabled="history.length < 2" title="撤销" @click="undo"><Undo2 :size="14" />撤销</button>
        <button class="btn subtle" title="恢复到原图" @click="reset">重置</button>
        <label class="btn subtle" title="更换图片">
          <RefreshCw :size="14" />更换
          <input type="file" accept="image/*" hidden @change="onFiles([...(($event.target as HTMLInputElement).files ?? [])])" />
        </label>
      </header>

      <div :ref="observeArea" class="canvas-area checker">
        <div class="frame" :style="frameStyle">
          <canvas ref="view" :style="{ filter }" />
          <div v-if="cropping" class="crop" :style="cropStyle" @pointerdown="onCropPointerDown($event, 'move')">
            <span v-for="h in ['nw', 'ne', 'sw', 'se'] as const" :key="h" class="handle" :class="h" @pointerdown.stop="onCropPointerDown($event, h)" />
            <span class="crop-size">{{ crop.w }} × {{ crop.h }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 所有操作集中在右侧一个面板，常见窗口尺寸下无需滚动 -->
    <aside class="panel card">
      <section class="section">
        <header class="section-head">
          <h3>裁剪</h3>
          <template v-if="cropping">
            <button class="btn small primary" @click="applyCrop">应用</button>
            <button class="btn small subtle" @click="cropping = false">取消</button>
          </template>
          <button v-else class="btn small" @click="startCrop"><Crop :size="13" />开始裁剪</button>
        </header>
        <div class="seg fill">
          <button v-for="r in RATIOS" :key="r.label" :class="{ on: ratio === r.value }" @click="setRatio(r.value)">{{ r.label }}</button>
        </div>
      </section>

      <section class="section inline">
        <h3>旋转翻转</h3>
        <div class="icons">
          <button class="btn small icon" title="向左旋转 90°" @click="rotate(-90)"><RotateCcw :size="14" /></button>
          <button class="btn small icon" title="向右旋转 90°" @click="rotate(90)"><RotateCw :size="14" /></button>
          <button class="btn small icon" title="水平翻转" @click="flip(true)"><FlipHorizontal2 :size="14" /></button>
          <button class="btn small icon" title="垂直翻转" @click="flip(false)"><FlipVertical2 :size="14" /></button>
        </div>
      </section>

      <section class="section">
        <h3>尺寸</h3>
        <div class="size-row">
          <input class="field size" type="number" min="1" title="宽" :value="resizeW" @change="onResizeW" />
          <button
            class="lock"
            :class="{ on: keepRatio }"
            :title="keepRatio ? '保持比例（点击解除）' : '不保持比例（点击锁定）'"
            @click="keepRatio = !keepRatio"
          >
            <Lock v-if="keepRatio" :size="13" />
            <LockOpen v-else :size="13" />
          </button>
          <input class="field size" type="number" min="1" title="高" :value="resizeH" @change="onResizeH" />
          <button class="btn small" @click="applyResize">应用</button>
        </div>
      </section>

      <section class="section">
        <header class="section-head">
          <h3>调色</h3>
          <label class="check small"><input v-model="adjust.grayscale" type="checkbox" />黑白</label>
          <button v-if="adjusted" class="link" @click="resetAdjust">恢复</button>
        </header>
        <label v-for="s in ADJUST_SLIDERS" :key="s.key" class="slider">
          <span>{{ s.label }}</span>
          <input v-model.number="adjust[s.key]" type="range" min="0" max="200" @dblclick="adjust[s.key] = 100" />
          <em>{{ adjust[s.key] }}%</em>
        </label>
      </section>

      <section class="section">
        <h3>导出</h3>
        <div class="seg fill">
          <button v-for="f in IMAGE_FORMATS" :key="f.value" :class="{ on: exportFormat === f.value }" @click="exportFormat = f.value">
            {{ f.label }}
          </button>
        </div>
        <label v-if="formatInfo(exportFormat).lossy" class="slider">
          <span>质量</span>
          <input v-model.number="exportQuality" type="range" min="10" max="100" step="5" />
          <em>{{ exportQuality }}%</em>
        </label>
        <button class="btn primary full" @click="download"><Download :size="14" />{{ saved ? "已保存" : "下载图片" }}</button>
      </section>
    </aside>
  </div>
</template>

<style scoped>
/* 高度跟随右侧操作面板，图片在这个高度内完整显示，不会撑满整个窗口 */
.editor {
  display: flex;
  align-items: stretch;
  gap: 14px;
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
.dims {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-3);
}
.spacer {
  flex: 1;
}

/* 棋盘格背景，透明区域也能看清 */
.checker {
  background-color: var(--bg);
  background-image:
    linear-gradient(45deg, var(--active) 25%, transparent 25%),
    linear-gradient(-45deg, var(--active) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--active) 75%),
    linear-gradient(-45deg, transparent 75%, var(--active) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}
.canvas-area {
  position: relative;
  flex: 1;
  min-height: 200px;
  margin: 12px;
  border-radius: 8px;
  /* 裁剪框外的暗色遮罩不要盖到标题栏 */
  overflow: hidden;
}
/* frame 的大小由脚本按预览区计算，裁剪框按百分比定位在它上面 */
.frame {
  position: absolute;
  inset: 0;
  margin: auto;
}
.frame canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.crop {
  position: absolute;
  border: 1.5px solid #fff;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  cursor: move;
  touch-action: none;
}
.handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  background: var(--accent);
  border-radius: 3px;
}
.handle.nw {
  left: -7px;
  top: -7px;
  cursor: nwse-resize;
}
.handle.ne {
  right: -7px;
  top: -7px;
  cursor: nesw-resize;
}
.handle.sw {
  left: -7px;
  bottom: -7px;
  cursor: nesw-resize;
}
.handle.se {
  right: -7px;
  bottom: -7px;
  cursor: nwse-resize;
}
.crop-size {
  position: absolute;
  left: 4px;
  top: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  pointer-events: none;
}

/* 右侧操作面板：一张卡片，各部分用细线分隔，尽量紧凑 */
.panel {
  flex: 0 0 272px;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 14px;
}
.section + .section {
  border-top: 1px solid var(--border);
}
.section.inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.section-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.section-head h3 {
  flex: 1;
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
}
.link {
  border: none;
  background: none;
  padding: 0 2px;
  font-size: 12px;
  color: var(--accent);
}
.check.small {
  font-size: 12px;
}

.btn.small {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
.btn.icon {
  width: 32px;
  padding: 0;
  justify-content: center;
}
.btn.full {
  justify-content: center;
}
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.icons {
  display: flex;
  gap: 6px;
}
/* 分段按钮平均铺满一行 */
.seg.fill {
  display: flex;
}
.seg.fill button {
  flex: 1;
  padding: 0 4px;
}

.size-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.field.size {
  flex: 1;
  width: 0;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
}
.size-row .btn {
  margin-left: 4px;
}
.lock {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-3);
}
.lock.on {
  color: var(--accent);
}
.lock:hover {
  background: var(--hover);
}

.slider {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.slider span {
  flex: 0 0 40px;
  color: var(--text-2);
}
.slider input {
  flex: 1;
  min-width: 0;
  height: 18px;
  accent-color: var(--accent);
}
.slider em {
  flex: 0 0 36px;
  font-style: normal;
  color: var(--text-3);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.load-error {
  margin-top: 8px;
  color: var(--danger);
}
</style>
