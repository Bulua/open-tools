<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Download, Lock, LockOpen, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import ZoomControls from "@/components/common/ZoomControls.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useFitFrame } from "@/composables/useFitFrame";
import { useZoomPan } from "@/composables/useZoomPan";
import { saveFile, saveFiles } from "@/utils/saveFile";
import { showError } from "@/utils/errorToast";
import { IMAGE_FORMATS, canvasToBytes, createCanvas, formatInfo, loadImage, outputFormatOf, type ImageFormat } from "../utils";
import { fullCrop, outputSize, sizeFromInput, updateCrop, type CropHandle, type OutputSize, type Rect } from "../crop";

/**
 * 图片裁剪 / 改尺寸，可以放入多张图片，在底部缩略图里切换。
 * 每张图各自记住裁剪框、比例和导出尺寸。裁剪框拖完就算数，不改动原图，下载时按当前设置导出。
 * 预览区滚轮缩放，拖动裁剪框以外的地方平移。
 */
const { t } = useI18n();

interface Item {
  id: number;
  name: string;
  /** 缩略图和预览用 */
  url: string;
  img: HTMLImageElement;
  crop: Rect;
  ratio: number | null;
  size: OutputSize;
}
const items = ref<Item[]>([]);
const activeId = ref(0);
const current = computed(() => items.value.find((i) => i.id === activeId.value) ?? null);
let nextId = 1;

const onFiles = async (files: File[]) => {
  const first = !items.value.length;
  // 新加的图片沿用当前这张的比例，方便一批图裁成同样比例
  const ratio = current.value?.ratio ?? null;
  const loaded: Item[] = [];
  for (const file of files) {
    try {
      const img = markRaw(await loadImage(file));
      loaded.push({
        id: nextId++,
        name: file.name,
        url: URL.createObjectURL(file),
        img,
        crop: fullCrop(img.naturalWidth, img.naturalHeight, ratio),
        ratio,
        size: { scale: 100 },
      });
    } catch (e) {
      showError(e);
    }
  }
  if (!loaded.length) return;
  if (first) exportFormat.value = outputFormatOf(files[0].type);
  items.value = [...items.value, ...loaded];
  activeId.value = loaded[0].id;
};

const remove = (item: Item) => {
  URL.revokeObjectURL(item.url);
  const index = items.value.indexOf(item);
  items.value = items.value.filter((i) => i !== item);
  if (activeId.value === item.id) activeId.value = items.value[Math.min(index, items.value.length - 1)]?.id ?? 0;
};
onBeforeUnmount(() => items.value.forEach((i) => URL.revokeObjectURL(i.url)));

const imageSize = computed(() => (current.value ? { width: current.value.img.naturalWidth, height: current.value.img.naturalHeight } : null));

/** 恢复成整张图、原尺寸 */
const reset = () => {
  const item = current.value;
  if (!item) return;
  item.ratio = null;
  item.crop = fullCrop(item.img.naturalWidth, item.img.naturalHeight, null);
  item.size = { scale: 100 };
};

// ---------- 裁剪 ----------
const RATIOS: { label: string; value: number | null }[] = [
  { label: "", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];
const setRatio = (r: number | null) => {
  const item = current.value;
  if (!item) return;
  item.ratio = r;
  // 改成自由比例时保留现在的框
  if (r !== null) item.crop = fullCrop(item.img.naturalWidth, item.img.naturalHeight, r);
};

/** 裁剪框在预览图上的位置（百分比，跟随预览缩放） */
const cropStyle = computed(() => {
  const item = current.value;
  if (!item) return {};
  const { x, y, w, h } = item.crop;
  const { naturalWidth: W, naturalHeight: H } = item.img;
  return { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${(w / W) * 100}%`, height: `${(h / H) * 100}%` };
});

// 拖动裁剪框：屏幕像素换算成图片像素。getBoundingClientRect 已包含缩放，所以放大后照样准确
const frameEl = ref<HTMLElement>();
const onCropPointerDown = (e: PointerEvent, handle: CropHandle) => {
  const item = current.value;
  if (!item || !frameEl.value || e.button !== 0) return;
  e.preventDefault();
  const { naturalWidth: W, naturalHeight: H } = item.img;
  const scale = W / frameEl.value.getBoundingClientRect().width;
  const start = { ...item.crop };
  const [sx, sy] = [e.clientX, e.clientY];
  const move = (ev: PointerEvent) => {
    item.crop = updateCrop(start, handle, (ev.clientX - sx) * scale, (ev.clientY - sy) * scale, W, H, item.ratio);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
};

// ---------- 缩放与平移 ----------
const { observeArea, frameStyle } = useFitFrame(imageSize);
const { MIN_ZOOM, MAX_ZOOM, zoom, panning, style: zoomStyle, reset: resetView, zoomAt, onWheel, onDown, onMove, onUp } = useZoomPan();
watch(activeId, resetView);
/** 裁剪框的边线、角点和尺寸标签不随缩放变大 */
const frameVars = computed(() => ({ "--inv": String(1 / zoom.value) }));

// ---------- 尺寸 ----------
const keepRatio = ref(true);
const outSize = computed(() => (current.value ? outputSize(current.value.crop, current.value.size) : null));
const onSizeInput = (axis: "w" | "h", e: Event) => {
  const item = current.value;
  if (!item) return;
  item.size = sizeFromInput(item.crop, item.size, axis, Number((e.target as HTMLInputElement).value), keepRatio.value);
};
const isScale = (p: number) => !!current.value && "scale" in current.value.size && Math.abs(current.value.size.scale - p) < 1e-6;
const setScale = (p: number) => current.value && (current.value.size = { scale: p });

// ---------- 导出 ----------
const exportFormat = useStoredRef<ImageFormat>("image-edit.format", "image/png");
const exportQuality = useStoredRef("image-edit.quality", 90);
const saved = ref<"one" | "all" | null>(null);
const busy = ref(false);

const render = async (item: Item) => {
  const { x, y, w, h } = item.crop;
  const out = outputSize(item.crop, item.size);
  const { canvas, ctx } = createCanvas(out.w, out.h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(item.img, x, y, w, h, 0, 0, out.w, out.h);
  const data = await canvasToBytes(canvas, exportFormat.value, exportQuality.value / 100);
  const base = item.name.replace(/\.[^.]+$/, "") || "image";
  return { name: `${base}_${t("image.suffixCrop")}.${formatInfo(exportFormat.value).ext}`, data };
};

const run = async (which: "one" | "all", job: () => Promise<boolean>) => {
  busy.value = true;
  try {
    if (await job()) {
      saved.value = which;
      setTimeout(() => (saved.value = null), 1500);
    }
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
};
const download = () =>
  run("one", async () => {
    if (!current.value) return false;
    const file = await render(current.value);
    return saveFile(file.data, file.name);
  });
const downloadAll = () =>
  run("all", async () => {
    const files: { name: string; data: Uint8Array }[] = [];
    for (const item of items.value) files.push(await render(item));
    return saveFiles(files, `${t("image.cropZipName")}.zip`);
  });
</script>

<template>
  <div class="editor">
    <!-- 操作面板始终显示，没有图片时不能操作 -->
    <aside class="panel card" :class="{ idle: !current }">
      <section class="section">
        <h3>{{ t("image.crop") }}</h3>
        <div class="seg fill">
          <button v-for="r in RATIOS" :key="r.label" :class="{ on: current?.ratio === r.value }" :disabled="!current" @click="setRatio(r.value)">
            {{ r.value === null ? t("image.free") : r.label }}
          </button>
        </div>
      </section>

      <section class="section">
        <h3>{{ t("image.resize") }}</h3>
        <div class="size-row">
          <input class="field size" type="number" min="1" :title="t('image.width')" :disabled="!current" :value="outSize?.w ?? ''" :placeholder="t('image.width')" @change="onSizeInput('w', $event)" />
          <button class="lock" :class="{ on: keepRatio }" :title="keepRatio ? t('image.ratioLocked') : t('image.ratioUnlocked')" @click="keepRatio = !keepRatio">
            <Lock v-if="keepRatio" :size="13" />
            <LockOpen v-else :size="13" />
          </button>
          <input class="field size" type="number" min="1" :title="t('image.height')" :disabled="!current" :value="outSize?.h ?? ''" :placeholder="t('image.height')" @change="onSizeInput('h', $event)" />
        </div>
        <div class="chips">
          <button v-for="p in [25, 50, 75, 100, 150, 200]" :key="p" :class="{ on: isScale(p) }" :disabled="!current" @click="setScale(p)">{{ p }}%</button>
        </div>
      </section>

      <section class="section">
        <h3>{{ t("image.export") }}</h3>
        <div class="seg fill">
          <button v-for="f in IMAGE_FORMATS" :key="f.value" :class="{ on: exportFormat === f.value }" @click="exportFormat = f.value">
            {{ f.label }}
          </button>
        </div>
        <label v-if="formatInfo(exportFormat).lossy" class="slider">
          <span>{{ t("image.quality") }}</span>
          <input v-model.number="exportQuality" type="range" min="10" max="100" step="5" />
          <em>{{ exportQuality }}%</em>
        </label>
        <button class="btn primary full" :disabled="!current || busy" @click="download">
          <Download :size="14" />{{ saved === "one" ? t("image.saved") : t("image.downloadImage") }}
        </button>
        <button v-if="items.length > 1" class="btn full" :disabled="busy" @click="downloadAll">
          <Download :size="14" />{{ saved === "all" ? t("image.saved") : t("image.cropDownloadAll", { n: items.length }) }}
        </button>
      </section>
    </aside>

    <section class="stage card">
      <FileDropZone
        v-if="!current"
        class="drop"
        accept="image/*"
        multiple
        :title="t('image.dropMany')"
        :hint="t('image.pasteHint', { hint: t('image.hintCrop') })"
        @files="onFiles"
      />

      <template v-else>
        <header class="card-title">
          <span class="file" :title="current.name">{{ current.name }}</span>
          <span v-if="outSize" class="dims">{{ outSize.w }} × {{ outSize.h }}</span>
          <span class="hint">{{ t("image.cropViewHint") }}</span>
          <button class="btn small subtle" :title="t('image.cropResetTitle')" @click="reset">{{ t("image.reset") }}</button>
          <ZoomControls :zoom="zoom" :min="MIN_ZOOM" :max="MAX_ZOOM" @zoom="zoomAt" @reset="resetView" />
        </header>

        <div
          class="canvas-area checker"
          :class="{ panning }"
          @wheel.prevent="onWheel"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
        >
          <!-- 四周留出空白，放在边上的角点不会被裁掉 -->
          <div :ref="observeArea" class="fit">
            <div ref="frameEl" class="frame" :style="[frameStyle, zoomStyle, frameVars]">
              <img :src="current.url" alt="" draggable="false" />
              <div class="crop" :style="cropStyle" @pointerdown.stop="onCropPointerDown($event, 'move')">
                <span v-for="h in ['nw', 'ne', 'sw', 'se'] as const" :key="h" class="handle" :class="h" @pointerdown.stop="onCropPointerDown($event, h)" />
                <span class="crop-size">{{ current.crop.w }} × {{ current.crop.h }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 多张图片：点击切换，悬停可移除 -->
        <div class="strip">
          <figure v-for="item in items" :key="item.id" class="thumb" :class="{ on: item.id === activeId }" :title="item.name" @click="activeId = item.id">
            <img :src="item.url" :alt="item.name" />
            <button class="thumb-remove" :title="t('image.remove')" @click.stop="remove(item)"><X :size="12" /></button>
          </figure>
          <FileDropZone compact class="add" accept="image/*" multiple title="" :aria-label="t('image.addImages')" @files="onFiles" />
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.editor {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  gap: 14px;
}

.stage {
  flex: 1;
  min-width: 0;
  min-height: 420px;
  overflow: hidden;
}
.card-title .file {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dims {
  flex-shrink: 0;
  font-weight: 400;
  color: var(--text-3);
}
.hint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-weight: 400;
  font-size: 12px;
  color: var(--text-3);
}
.drop {
  flex: 1;
  margin: 12px;
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
  margin: 12px 12px 0;
  border-radius: 8px;
  /* 裁剪框外的暗色遮罩和放大后的图片不要超出预览区 */
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}
.canvas-area.panning {
  cursor: grabbing;
}
.fit {
  position: absolute;
  inset: 12px;
}
/* frame 的大小由脚本按预览区计算，裁剪框按百分比定位在它上面 */
.frame {
  position: absolute;
  inset: 0;
  margin: auto;
}
.frame img {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
  pointer-events: none;
}

.crop {
  position: absolute;
  border: calc(1.5px * var(--inv, 1)) solid #fff;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  cursor: move;
}
.handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  background: var(--accent);
  border-radius: 3px;
  transform: scale(var(--inv, 1));
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
  white-space: nowrap;
  pointer-events: none;
  transform-origin: 0 0;
  transform: scale(var(--inv, 1));
}

/* 底部缩略图 */
.strip {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  padding: 12px;
  overflow-x: auto;
}
.thumb {
  position: relative;
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  margin: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid var(--border);
  cursor: pointer;
  transition: border-color 0.15s ease-out;
}
.thumb.on {
  border-color: var(--accent);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-remove {
  position: absolute;
  right: 3px;
  top: 3px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.9);
  color: #141413;
  opacity: 0;
  transition: opacity 0.15s ease-out;
}
.thumb:hover .thumb-remove {
  opacity: 1;
}
.add {
  flex: 0 0 64px;
  min-height: 64px;
  padding: 0;
  justify-content: center;
}

/* 左侧操作面板：一张卡片，各部分用细线分隔，尽量紧凑 */
.panel {
  flex: 0 0 280px;
  align-self: flex-start;
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.btn:disabled,
.seg button:disabled,
.chips button:disabled {
  opacity: 0.45;
  cursor: default;
}
/* 分段按钮平均铺满一行 */
.seg.fill {
  display: flex;
}
.seg.fill button {
  padding: 0 4px;
}
.chips {
  display: flex;
  gap: 6px;
}
.chips button {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  font-size: 12px;
  color: var(--text-2);
}
.chips button:not(:disabled):hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.chips button.on {
  border-color: var(--accent);
  color: var(--accent);
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
.slider span {
  flex: 0 0 40px;
  color: var(--text-2);
}
.slider input {
  height: 18px;
}
</style>
