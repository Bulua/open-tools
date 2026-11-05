<script setup lang="ts">
import { computed, nextTick, reactive, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Download, FlipHorizontal2, FlipVertical2, RefreshCw, RotateCcw, RotateCw, Undo2 } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useFitFrame } from "@/composables/useFitFrame";
import { saveFile } from "@/utils/saveFile";
import { IMAGE_FORMATS, canvasToBytes, createCanvas, formatInfo, loadImage, outputFormatOf, type ImageFormat } from "../utils";
import { rotatedSize } from "../effects";

/**
 * 单张图片编辑，按 mode 注册为两个工具（裁剪 / 改尺寸在 ImageCrop.vue）：
 * - rotate：旋转 90°、任意角度、翻转
 * - adjust：亮度、对比度、饱和度、色相与滤镜预设（预览用 CSS 滤镜，导出时应用到像素）
 * 旋转、翻转等操作记入历史，可以撤销。没有图片时操作面板也显示，只是不能点。
 */
const props = withDefaults(defineProps<{ mode?: "rotate" | "adjust" }>(), { mode: "rotate" });
const { t } = useI18n();

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
  { key: "brightness", min: 0, max: 200, unit: "%" },
  { key: "contrast", min: 0, max: 200, unit: "%" },
  { key: "saturate", min: 0, max: 200, unit: "%" },
  { key: "hue", min: -180, max: 180, unit: "°" },
] as const;
/** label 是文案 key（image.fGray 等） */
const PRESETS: { label: string; value: Partial<typeof NEUTRAL> }[] = [
  { label: "fOriginal", value: {} },
  { label: "fGray", value: { grayscale: 1, contrast: 110 } },
  { label: "fVintage", value: { sepia: 0.6, contrast: 95, brightness: 105 } },
  { label: "fVivid", value: { saturate: 150, contrast: 110 } },
  { label: "fSoft", value: { saturate: 80, contrast: 90, brightness: 108 } },
  { label: "fCool", value: { hue: -15, saturate: 110 } },
  { label: "fWarm", value: { hue: 12, sepia: 0.2 } },
  { label: "fInvert", value: { invert: 1 } },
];
const applyPreset = (p: Partial<typeof NEUTRAL>) => Object.assign(adjust, NEUTRAL, p);

// ---------- 导出 ----------
const exportFormat = useStoredRef<ImageFormat>("image-edit.format", "image/png");
const exportQuality = useStoredRef("image-edit.quality", 90);
const saved = ref(false);

const SUFFIX = { rotate: "suffixRotate", adjust: "suffixAdjust" };
const download = async () => {
  const src = displayed.value;
  if (!src) return;
  const { canvas, ctx } = createCanvas(src.width, src.height);
  ctx.filter = filter.value;
  ctx.drawImage(src, 0, 0);
  const bytes = await canvasToBytes(canvas, exportFormat.value, exportQuality.value / 100);
  const base = fileName.value.replace(/\.[^.]+$/, "") || "image";
  if (await saveFile(bytes, `${base}_${t(`image.${SUFFIX[props.mode]}`)}.${formatInfo(exportFormat.value).ext}`)) {
    saved.value = true;
    setTimeout(() => (saved.value = false), 1500);
  }
};

const HINTS = { rotate: "hintRotate", adjust: "hintAdjust" };
</script>

<template>
  <div class="editor">
    <!-- 操作面板始终显示，没有图片时不能操作 -->
    <aside class="panel card" :class="{ idle: !current }">
      <template v-if="mode === 'rotate'">
        <section class="section">
          <h3>{{ t("image.rotate90") }}</h3>
          <div class="big-row">
            <button class="btn" :disabled="!current" @click="rotate(-90)"><RotateCcw :size="15" />{{ t("image.left") }}</button>
            <button class="btn" :disabled="!current" @click="rotate(90)"><RotateCw :size="15" />{{ t("image.right") }}</button>
          </div>
        </section>
        <section class="section">
          <h3>{{ t("image.flip") }}</h3>
          <div class="big-row">
            <button class="btn" :disabled="!current" @click="flip(true)"><FlipHorizontal2 :size="15" />{{ t("image.flipH") }}</button>
            <button class="btn" :disabled="!current" @click="flip(false)"><FlipVertical2 :size="15" />{{ t("image.flipV") }}</button>
          </div>
        </section>
        <section class="section">
          <header class="section-head">
            <h3>{{ t("image.anyAngle") }}</h3>
            <button v-if="angle" class="link" @click="angle = 0">{{ t("image.zero") }}</button>
          </header>
          <label class="slider">
            <span>{{ t("image.angle") }}</span>
            <input v-model.number="angle" type="range" min="-180" max="180" :disabled="!current" @dblclick="angle = 0" />
            <em>{{ angle }}°</em>
          </label>
          <div class="row">
            <span class="label">{{ t("image.blank") }}</span>
            <div class="seg">
              <button :class="{ on: rotateBg === 'transparent' }" @click="rotateBg = 'transparent'">{{ t("image.transparent") }}</button>
              <button :class="{ on: rotateBg === 'white' }" @click="rotateBg = 'white'">{{ t("image.white") }}</button>
            </div>
            <button class="btn small push" :disabled="!current || !angle" @click="applyAngle">{{ t("image.apply") }}</button>
          </div>
          <p class="tip">{{ t("image.jpgWhite") }}</p>
        </section>
      </template>

      <template v-else>
        <section class="section">
          <h3>{{ t("image.filters") }}</h3>
          <div class="presets">
            <button v-for="p in PRESETS" :key="p.label" :disabled="!current" @click="applyPreset(p.value)">{{ t(`image.${p.label}`) }}</button>
          </div>
        </section>
        <section class="section">
          <header class="section-head">
            <h3>{{ t("image.adjust") }}</h3>
            <button v-if="adjusted" class="link" @click="resetAdjust">{{ t("image.restore") }}</button>
          </header>
          <label v-for="s in ADJUST_SLIDERS" :key="s.key" class="slider">
            <span>{{ t(`image.${s.key}`) }}</span>
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
          <p class="tip">{{ t("image.dblclickReset") }}</p>
        </section>
      </template>

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
        <button class="btn primary full" :disabled="!current" @click="download"><Download :size="14" />{{ saved ? t("image.saved") : t("image.downloadImage") }}</button>
      </section>
    </aside>

    <section class="stage card">
      <header class="card-title">
        <span class="file" :title="fileName">{{ fileName || t("image.noImage") }}</span>
        <span v-if="displayed" class="dims">{{ displayed.width }} × {{ displayed.height }}</span>
        <span class="spacer" />
        <template v-if="current">
          <button class="btn small subtle" :disabled="history.length < 2" :title="t('image.undo')" @click="undo"><Undo2 :size="14" />{{ t("image.undo") }}</button>
          <button class="btn small subtle" :title="t('image.resetTitle')" @click="reset">{{ t("image.reset") }}</button>
          <button class="btn small subtle" :title="t('image.replaceImage')" @click="dropZone?.open()"><RefreshCw :size="14" />{{ t("image.replace") }}</button>
        </template>
      </header>

      <!-- 加载后隐藏但保留：「更换」按钮由它打开选择框 -->
      <FileDropZone v-show="!current" ref="dropZone" :paste="!current" class="drop" accept="image/*" :title="t('image.dropImage')" :hint="t('image.pasteHint', { hint: t(`image.${HINTS[mode]}`) })" @files="onFiles">
        <span v-if="loadError" class="load-error">{{ loadError }}</span>
      </FileDropZone>
      <div v-if="current" :ref="observeArea" class="canvas-area checker">
        <div class="frame" :style="frameStyle">
          <canvas ref="view" :style="{ filter }" />
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
  overflow: hidden;
}
/* frame 的大小由脚本按预览区计算 */
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

/* 右侧操作面板：一张卡片，各部分用细线分隔，尽量紧凑 */
.panel {
  flex: 0 0 280px;
  align-self: flex-start;
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

.btn:disabled,
.seg button:disabled,
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
  padding: 0 4px;
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

.slider span {
  flex: 0 0 40px;
  color: var(--text-2);
}
.slider input {
  height: 18px;
}
.load-error {
  margin-top: 8px;
  color: var(--danger);
}
</style>
