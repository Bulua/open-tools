<script setup lang="ts">
import { computed, nextTick, reactive, ref, shallowRef, watch } from "vue";
import { Crop, Download, FlipHorizontal2, FlipVertical2, Lock, LockOpen, RefreshCw, RotateCcw, RotateCw, Undo2 } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useFitFrame } from "@/composables/useFitFrame";
import { saveFile } from "@/utils/saveFile";
import { IMAGE_FORMATS, canvasToBytes, createCanvas, formatInfo, loadImage, outputFormatOf, type ImageFormat } from "../utils";
import { initialCrop, updateCrop, type CropHandle, type Rect } from "../crop";
import { rotatedSize } from "../effects";

/**
 * 单张图片编辑，按 mode 注册为三个工具：
 * - crop：裁剪、调整尺寸
 * - rotate：旋转 90°、任意角度、翻转
 * - adjust：亮度、对比度、饱和度、色相与滤镜预设（预览用 CSS 滤镜，导出时应用到像素）
 * 裁剪、旋转等操作记入历史，可以撤销。没有图片时操作面板也显示，只是不能点。
 */
const props = withDefaults(defineProps<{ mode?: "crop" | "rotate" | "adjust" }>(), { mode: "crop" });

// ---------- 图片与历史 ----------
const fileName = ref("");
const history = shallowRef<HTMLCanvasElement[]>([]);
const dropZone = ref<InstanceType<typeof FileDropZone>>();
const current = computed(() => history.value[history.value.length - 1] ?? null);
const loadError = ref("");

const onFiles = async ([file]: File[]) => {
  if (!file) return;
  loadError.value = "";
  try {
    const img = await loadImage(file);
    const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    fileName.value = file.name;
    exportFormat.value = outputFormatOf(file.type);
    history.value = [canvas];
    resetAdjust();
    angle.value = 0;
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
  angle.value = 0;
  cropping.value = false;
};

// ---------- 任意角度旋转 ----------
const angle = ref(0);
const rotateBg = useStoredRef<"transparent" | "white">("image-rotate.bg", "transparent");

/** 按角度旋转，画布扩大到能完整容纳旋转后的图片 */
const rotateBy = (src: HTMLCanvasElement, deg: number) => {
  const { width, height } = rotatedSize(src.width, src.height, deg);
  const { canvas, ctx } = createCanvas(width, height);
  if (rotateBg.value === "white") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.translate(width / 2, height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return canvas;
};

/** 预览显示的画面：调整角度时显示旋转后的效果 */
const displayed = computed(() => (current.value && angle.value ? rotateBy(current.value, angle.value) : current.value));

// ---------- 预览 ----------
const view = ref<HTMLCanvasElement>();
const { observeArea, frameStyle } = useFitFrame(displayed);

watch(displayed, async (src) => {
  await nextTick();
  if (!src || !view.value) return;
  view.value.width = src.width;
  view.value.height = src.height;
  view.value.getContext("2d")!.drawImage(src, 0, 0);
});
watch(current, (src) => {
  if (!src) return;
  resizeW.value = src.width;
  resizeH.value = src.height;
  if (cropping.value) crop.value = initialCrop(src.width, src.height, ratio.value);
});

// ---------- 旋转 90° / 翻转 ----------
const rotate = (deg: 90 | -90) => {
  const src = current.value;
  if (!src) return;
  const { canvas, ctx } = createCanvas(src.height, src.width);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  push(canvas);
};
const flip = (horizontal: boolean) => {
  const src = current.value;
  if (!src) return;
  const { canvas, ctx } = createCanvas(src.width, src.height);
  ctx.translate(horizontal ? src.width : 0, horizontal ? 0 : src.height);
  ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
  ctx.drawImage(src, 0, 0);
  push(canvas);
};
const applyAngle = () => {
  if (!current.value || !angle.value) return;
  push(rotateBy(current.value, angle.value));
  angle.value = 0;
};

// ---------- 尺寸 ----------
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
  const src = current.value;
  if (!src || (resizeW.value === src.width && resizeH.value === src.height)) return;
  const { canvas, ctx } = createCanvas(resizeW.value, resizeH.value);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  push(canvas);
};
const scaleTo = (percent: number) => {
  const src = current.value;
  if (!src) return;
  resizeW.value = Math.max(1, Math.round((src.width * percent) / 100));
  resizeH.value = Math.max(1, Math.round((src.height * percent) / 100));
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
  const src = current.value;
  if (!src) return;
  crop.value = initialCrop(src.width, src.height, ratio.value);
  cropping.value = true;
};
const setRatio = (r: number | null) => {
  ratio.value = r;
  if (cropping.value) startCrop();
};
const applyCrop = () => {
  const src = current.value;
  if (!src) return;
  const { x, y, w, h } = crop.value;
  const { canvas, ctx } = createCanvas(w, h);
  ctx.drawImage(src, x, y, w, h, 0, 0, w, h);
  cropping.value = false;
  push(canvas);
};
// 打开裁剪工具、放入图片后直接显示裁剪框
watch(current, (src, old) => {
  if (props.mode === "crop" && src && !old) startCrop();
});

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
const NEUTRAL = { brightness: 100, contrast: 100, saturate: 100, hue: 0, grayscale: 0, sepia: 0, invert: 0 };
const adjust = reactive({ ...NEUTRAL });
const resetAdjust = () => Object.assign(adjust, NEUTRAL);
const filter = computed(() =>
  props.mode === "adjust"
    ? `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) saturate(${adjust.saturate}%) hue-rotate(${adjust.hue}deg)` +
      ` grayscale(${adjust.grayscale}) sepia(${adjust.sepia}) invert(${adjust.invert})`
    : "none",
);
const adjusted = computed(() => (Object.keys(NEUTRAL) as (keyof typeof NEUTRAL)[]).some((k) => adjust[k] !== NEUTRAL[k]));
const ADJUST_SLIDERS = [
  { key: "brightness", label: "亮度", min: 0, max: 200, unit: "%" },
  { key: "contrast", label: "对比度", min: 0, max: 200, unit: "%" },
  { key: "saturate", label: "饱和度", min: 0, max: 200, unit: "%" },
  { key: "hue", label: "色相", min: -180, max: 180, unit: "°" },
] as const;
const PRESETS: { label: string; value: Partial<typeof NEUTRAL> }[] = [
  { label: "原图", value: {} },
  { label: "黑白", value: { grayscale: 1, contrast: 110 } },
  { label: "复古", value: { sepia: 0.6, contrast: 95, brightness: 105 } },
  { label: "鲜艳", value: { saturate: 150, contrast: 110 } },
  { label: "柔和", value: { saturate: 80, contrast: 90, brightness: 108 } },
  { label: "冷色", value: { hue: -15, saturate: 110 } },
  { label: "暖色", value: { hue: 12, sepia: 0.2 } },
  { label: "反色", value: { invert: 1 } },
];
const applyPreset = (p: Partial<typeof NEUTRAL>) => Object.assign(adjust, NEUTRAL, p);

// ---------- 导出 ----------
const exportFormat = useStoredRef<ImageFormat>("image-edit.format", "image/png");
const exportQuality = useStoredRef("image-edit.quality", 90);
const saved = ref(false);

const SUFFIX = { crop: "裁剪", rotate: "旋转", adjust: "调色" };
const download = async () => {
  const src = displayed.value;
  if (!src) return;
  const { canvas, ctx } = createCanvas(src.width, src.height);
  ctx.filter = filter.value;
  ctx.drawImage(src, 0, 0);
  const bytes = await canvasToBytes(canvas, exportFormat.value, exportQuality.value / 100);
  const base = fileName.value.replace(/\.[^.]+$/, "") || "image";
  if (await saveFile(bytes, `${base}_${SUFFIX[props.mode]}.${formatInfo(exportFormat.value).ext}`)) {
    saved.value = true;
    setTimeout(() => (saved.value = false), 1500);
  }
};

const HINTS = {
  crop: "拖动裁剪框选择区域，可以固定比例；也可以按像素或百分比调整尺寸",
  rotate: "旋转 90°、任意角度旋转、水平或垂直翻转",
  adjust: "调节亮度、对比度、饱和度、色相，或一键套用滤镜",
};
</script>

<template>
  <div class="editor">
    <!-- 操作面板始终显示，没有图片时不能操作 -->
    <aside class="panel card" :class="{ idle: !current }">
      <template v-if="mode === 'crop'">
        <section class="section">
          <header class="section-head">
            <h3>裁剪</h3>
            <template v-if="cropping">
              <button class="btn small primary" @click="applyCrop">应用裁剪</button>
              <button class="btn small subtle" @click="cropping = false">取消</button>
            </template>
            <button v-else class="btn small" :disabled="!current" @click="startCrop"><Crop :size="13" />开始裁剪</button>
          </header>
          <div class="seg fill">
            <button v-for="r in RATIOS" :key="r.label" :class="{ on: ratio === r.value }" @click="setRatio(r.value)">{{ r.label }}</button>
          </div>
        </section>

        <section class="section">
          <h3>调整尺寸</h3>
          <div class="size-row">
            <input class="field size" type="number" min="1" title="宽" :disabled="!current" :value="resizeW || ''" placeholder="宽" @change="onResizeW" />
            <button
              class="lock"
              :class="{ on: keepRatio }"
              :title="keepRatio ? '保持比例（点击解除）' : '不保持比例（点击锁定）'"
              @click="keepRatio = !keepRatio"
            >
              <Lock v-if="keepRatio" :size="13" />
              <LockOpen v-else :size="13" />
            </button>
            <input class="field size" type="number" min="1" title="高" :disabled="!current" :value="resizeH || ''" placeholder="高" @change="onResizeH" />
            <button class="btn small" :disabled="!current" @click="applyResize">应用</button>
          </div>
          <div class="chips">
            <button v-for="p in [25, 50, 75, 150, 200]" :key="p" :disabled="!current" @click="scaleTo(p)">{{ p }}%</button>
          </div>
        </section>
      </template>

      <template v-else-if="mode === 'rotate'">
        <section class="section">
          <h3>旋转 90°</h3>
          <div class="big-row">
            <button class="btn" :disabled="!current" @click="rotate(-90)"><RotateCcw :size="15" />向左</button>
            <button class="btn" :disabled="!current" @click="rotate(90)"><RotateCw :size="15" />向右</button>
          </div>
        </section>
        <section class="section">
          <h3>翻转</h3>
          <div class="big-row">
            <button class="btn" :disabled="!current" @click="flip(true)"><FlipHorizontal2 :size="15" />水平翻转</button>
            <button class="btn" :disabled="!current" @click="flip(false)"><FlipVertical2 :size="15" />垂直翻转</button>
          </div>
        </section>
        <section class="section">
          <header class="section-head">
            <h3>任意角度</h3>
            <button v-if="angle" class="link" @click="angle = 0">归零</button>
          </header>
          <label class="slider">
            <span>角度</span>
            <input v-model.number="angle" type="range" min="-180" max="180" :disabled="!current" @dblclick="angle = 0" />
            <em>{{ angle }}°</em>
          </label>
          <div class="row">
            <span class="label">空白处</span>
            <div class="seg">
              <button :class="{ on: rotateBg === 'transparent' }" @click="rotateBg = 'transparent'">透明</button>
              <button :class="{ on: rotateBg === 'white' }" @click="rotateBg = 'white'">白色</button>
            </div>
            <button class="btn small push" :disabled="!current || !angle" @click="applyAngle">应用</button>
          </div>
          <p class="tip">导出 JPG 时透明处会变成白色</p>
        </section>
      </template>

      <template v-else>
        <section class="section">
          <h3>滤镜</h3>
          <div class="presets">
            <button v-for="p in PRESETS" :key="p.label" :disabled="!current" @click="applyPreset(p.value)">{{ p.label }}</button>
          </div>
        </section>
        <section class="section">
          <header class="section-head">
            <h3>调节</h3>
            <button v-if="adjusted" class="link" @click="resetAdjust">恢复</button>
          </header>
          <label v-for="s in ADJUST_SLIDERS" :key="s.key" class="slider">
            <span>{{ s.label }}</span>
            <input
              v-model.number="adjust[s.key]"
              type="range"
              :min="s.min"
              :max="s.max"
              :disabled="!current"
              @dblclick="adjust[s.key] = NEUTRAL[s.key]"
            />
            <em>{{ adjust[s.key] }}{{ s.unit }}</em>
          </label>
          <p class="tip">双击滑块恢复默认值</p>
        </section>
      </template>

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
        <button class="btn primary full" :disabled="!current" @click="download"><Download :size="14" />{{ saved ? "已保存" : "下载图片" }}</button>
      </section>
    </aside>

    <section class="stage card">
      <header class="card-title">
        <span class="file" :title="fileName">{{ fileName || "未选择图片" }}</span>
        <span v-if="displayed" class="dims">{{ displayed.width }} × {{ displayed.height }}</span>
        <span class="spacer" />
        <template v-if="current">
          <button class="btn small subtle" :disabled="history.length < 2" title="撤销" @click="undo"><Undo2 :size="14" />撤销</button>
          <button class="btn small subtle" title="恢复到原图" @click="reset">重置</button>
          <button class="btn small subtle" title="更换图片" @click="dropZone?.open()"><RefreshCw :size="14" />更换</button>
        </template>
      </header>

      <!-- 加载后隐藏但保留：「更换」按钮由它打开选择框 -->
      <FileDropZone v-show="!current" ref="dropZone" :paste="!current" class="drop" accept="image/*" title="拖入图片，或点击选择" :hint="`${HINTS[mode]}；也可以按 Ctrl + V 粘贴截图`" @files="onFiles">
        <span v-if="loadError" class="load-error">{{ loadError }}</span>
      </FileDropZone>
      <div v-if="current" :ref="observeArea" class="canvas-area checker">
        <div class="frame" :style="frameStyle">
          <canvas ref="view" :style="{ filter }" />
          <div v-if="cropping" class="crop" :style="cropStyle" @pointerdown="onCropPointerDown($event, 'move')">
            <span v-for="h in ['nw', 'ne', 'sw', 'se'] as const" :key="h" class="handle" :class="h" @pointerdown.stop="onCropPointerDown($event, h)" />
            <span class="crop-size">{{ crop.w }} × {{ crop.h }}</span>
          </div>
        </div>
      </div>
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
.spacer {
  flex: 1;
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
  flex: 0 0 280px;
  align-self: flex-start;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
}
.section + .section {
  border-top: 1px solid var(--border);
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
  color: var(--text-2);
}
.link {
  border: none;
  background: none;
  padding: 0 2px;
  font-size: 12px;
  color: var(--accent);
}
.tip {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row .push {
  margin-left: auto;
}
.label {
  font-size: 12px;
  color: var(--text-2);
}

.btn.small {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
.btn.full {
  justify-content: center;
}
.btn:disabled,
.seg button:disabled,
.chips button:disabled,
.presets button:disabled {
  opacity: 0.45;
  cursor: default;
}
.big-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.big-row .btn {
  justify-content: center;
  height: 36px;
}
/* 分段按钮平均铺满一行 */
.seg.fill {
  display: flex;
}
.seg.fill button {
  flex: 1;
  padding: 0 4px;
}
.chips {
  display: flex;
  gap: 6px;
}
.chips button {
  flex: 1;
  height: 24px;
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
.presets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.presets button {
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  font-size: 12px;
  color: var(--text-2);
}
.presets button:not(:disabled):hover {
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
  flex: 0 0 38px;
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
