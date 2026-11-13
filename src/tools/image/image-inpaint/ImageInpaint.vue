<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Brush, CircleCheck, Download, Eye, LoaderCircle, RefreshCw, Sparkles, SquareDashed, Trash2, Undo2 } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import ProgressBar from "@/components/common/ProgressBar.vue";
import ZoomControls from "@/components/common/ZoomControls.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useFitFrame } from "@/composables/useFitFrame";
import { useZoomPan } from "@/composables/useZoomPan";
import { saveFile } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { showError } from "@/utils/errorToast";
import { canvasToBytes, createCanvas, formatInfo, loadImage, outputFormatOf, type ImageFormat } from "../shared/utils";
import { AI_SOURCES, aiStatus, canDownload, deleteModel, downloadModel, type AiSource, type AiStatus } from "../shared/aiModels";
import { INPAINT_MODELS, inpaint, type InpaintModel } from "./inpaint";

/**
 * 图片去水印：用画笔涂抹或框选水印、文字、杂物，松开后由 AI 修补模型补全背景。
 * 每次修补生成新画布记入历史，可以撤销，也可以按住「对比」查看原图。
 */
const { t } = useI18n();
const modelId = useStoredRef("inpaint.model", "lama");
/** 下载源，各个 AI 工具共用 */
const downloadSource = useStoredRef<AiSource>("ai.source", "auto");
const tool = useStoredRef<"brush" | "rect">("inpaint.tool", "brush");
const brushSize = useStoredRef("inpaint.brush", 40);

const MODEL_TEXT: Record<InpaintModel["id"], string> = { migan: "modelMigan", lama: "modelLama" };
const modelName = (m: InpaintModel) => t(`image.${MODEL_TEXT[m.id]}`);
const modelDesc = (m: InpaintModel) => t(`image.${MODEL_TEXT[m.id]}Desc`);
const sourceText = (s: AiSource) => t(`image.source${s[0].toUpperCase()}${s.slice(1)}`);
const sourceTitle = (s: AiSource) => t(`image.source${s[0].toUpperCase()}${s.slice(1)}Title`);

// ---------- 模型 ----------
const status = ref<AiStatus>({ models: [], runtimeReady: false, runtimeSize: 0, dir: "" });
const progress = ref<Record<string, number>>({});
const refreshStatus = async () => (status.value = await aiStatus());
onMounted(refreshStatus);

const isReady = (m: InpaintModel) => status.value.runtimeReady && status.value.models.includes(m.id);
/** 正在使用的模型：选中的模型还没下载时用另一个已下载的；一个都没有时为空 */
const currentModel = computed(() => {
  const chosen = INPAINT_MODELS.find((m) => m.id === modelId.value);
  return chosen && isReady(chosen) ? chosen : (INPAINT_MODELS.find(isReady) ?? null);
});
const selectModel = (m: InpaintModel) => isReady(m) && (modelId.value = m.id);

const download = async (m: InpaintModel) => {
  progress.value = { ...progress.value, [m.id]: 0 };
  try {
    await downloadModel(m, downloadSource.value, (ratio) => (progress.value = { ...progress.value, [m.id]: ratio }));
    await refreshStatus();
    modelId.value = m.id;
  } catch (e) {
    showError(e);
  } finally {
    const { [m.id]: _, ...rest } = progress.value;
    progress.value = rest;
  }
};

const remove = async (m: InpaintModel) => {
  await deleteModel(m);
  await refreshStatus();
};

// ---------- 图片与历史 ----------
const fileName = ref("");
const fileType = ref<ImageFormat>("image/png");
const dropZone = ref<InstanceType<typeof FileDropZone>>();
const history = shallowRef<HTMLCanvasElement[]>([]);
const current = computed(() => history.value[history.value.length - 1] ?? null);
const working = ref(false);
/** 按住「对比」时显示原图 */
const comparing = ref(false);

const onFiles = async ([file]: File[]) => {
  try {
    const img = await loadImage(file);
    const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    fileName.value = file.name;
    fileType.value = outputFormatOf(file.type);
    resetView();
    history.value = [canvas];
  } catch (e) {
    showError(e);
  }
};

const undo = () => history.value.length > 1 && (history.value = history.value.slice(0, -1));
const reset = () => (history.value = history.value.slice(0, 1));

// ---------- 预览 ----------
const view = ref<HTMLCanvasElement>();
/** 涂抹的区域，叠在图片上半透明显示，也作为修补的蒙版 */
const maskView = ref<HTMLCanvasElement>();
const { observeArea, frameStyle, scale } = useFitFrame(current);
// 左键用来涂抹，右键或中键拖动平移，滚轮缩放
const { MIN_ZOOM, MAX_ZOOM, zoom, panning, style: zoomStyle, reset: resetView, zoomAt, onWheel, onDown, onMove, onUp } = useZoomPan({ buttons: [1, 2] });

const paint = () => {
  const v = view.value;
  const src = comparing.value ? history.value[0] : current.value;
  if (!v || !src) return;
  if (v.width !== src.width || v.height !== src.height) {
    v.width = src.width;
    v.height = src.height;
  }
  v.getContext("2d")!.drawImage(src, 0, 0);
  const m = maskView.value;
  if (m && (m.width !== src.width || m.height !== src.height)) {
    m.width = src.width;
    m.height = src.height;
  }
};
watch([current, comparing], async () => {
  await nextTick();
  paint();
});

const clearMask = () => {
  const m = maskView.value;
  m?.getContext("2d")!.clearRect(0, 0, m.width, m.height);
};

// ---------- 涂抹与框选 ----------
const canPaint = computed(() => !!current.value && !!currentModel.value && !working.value && !comparing.value);
let stroke: { start: { x: number; y: number }; last: { x: number; y: number } } | null = null;
const brushCursor = ref<{ x: number; y: number } | null>(null);

/** 屏幕坐标 → 图片像素坐标（放大、平移后也准确） */
const toImage = (e: PointerEvent) => {
  const rect = view.value!.getBoundingClientRect();
  const s = current.value!.width / rect.width;
  return { x: (e.clientX - rect.left) * s, y: (e.clientY - rect.top) * s };
};

const maskContext = () => {
  const ctx = maskView.value!.getContext("2d")!;
  // 涂抹的颜色跟随主题强调色，透明度由样式控制
  ctx.fillStyle = ctx.strokeStyle = getComputedStyle(maskView.value!).getPropertyValue("--accent").trim();
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.lineWidth = brushSize.value;
  return ctx;
};

const drawTo = (p: { x: number; y: number }) => {
  if (!stroke || !maskView.value) return;
  const ctx = maskContext();
  if (tool.value === "rect") {
    const { start } = stroke;
    ctx.clearRect(0, 0, maskView.value.width, maskView.value.height);
    ctx.fillRect(Math.min(start.x, p.x), Math.min(start.y, p.y), Math.abs(p.x - start.x), Math.abs(p.y - start.y));
  } else {
    ctx.beginPath();
    ctx.moveTo(stroke.last.x, stroke.last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  stroke.last = p;
};

const onPointerDown = (e: PointerEvent) => {
  if (e.button !== 0) return onDown(e);
  if (!canPaint.value || !view.value) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const p = toImage(e);
  stroke = { start: p, last: p };
  if (tool.value === "brush") {
    const ctx = maskContext();
    ctx.beginPath();
    ctx.arc(p.x, p.y, brushSize.value / 2, 0, Math.PI * 2);
    ctx.fill();
  }
};

const onPointerMove = (e: PointerEvent) => {
  if (stroke) drawTo(toImage(e));
  else onMove(e);
  const area = e.currentTarget as HTMLElement;
  if (tool.value !== "brush" || panning.value) return (brushCursor.value = null);
  const rect = area.getBoundingClientRect();
  brushCursor.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

const onPointerUp = async () => {
  onUp();
  if (!stroke) return;
  stroke = null;
  await run();
};

/** 修补涂抹的区域，结果记入历史 */
const run = async () => {
  const src = current.value;
  const model = currentModel.value;
  if (!src || !model || !maskView.value) return clearMask();
  working.value = true;
  try {
    const next = await inpaint(src, maskView.value, model);
    if (next) history.value = [...history.value, next];
  } catch (e) {
    showError(e);
  } finally {
    clearMask();
    working.value = false;
  }
};

const hint = computed(() => {
  if (working.value) return t("image.inpainting");
  if (!currentModel.value) return t("image.inpaintNoModel");
  return tool.value === "rect" ? t("image.inpaintRectHint") : t("image.inpaintBrushHint");
});

// ---------- 导出 ----------
const saved = ref(false);
const save = async () => {
  if (!current.value) return;
  const bytes = await canvasToBytes(current.value, fileType.value, 0.95);
  const base = fileName.value.replace(/\.[^.]+$/, "") || "image";
  if (await saveFile(bytes, `${base}_${t("image.inpaintSuffix")}.${formatInfo(fileType.value).ext}`)) {
    saved.value = true;
    setTimeout(() => (saved.value = false), 1500);
  }
};
</script>

<template>
  <div class="inpaint">
    <aside class="card panel">
      <section class="section">
        <h3><Sparkles :size="13" />{{ t("image.inpaintModel") }}</h3>
        <div class="models">
          <div
            v-for="m in INPAINT_MODELS"
            :key="m.id"
            class="model"
            :class="{ on: currentModel?.id === m.id, ready: isReady(m) }"
            @click="selectModel(m)"
          >
            <div class="model-head">
              <b>{{ modelName(m) }}</b>
              <span v-if="isReady(m)" class="badge ok"><CircleCheck :size="11" />{{ t("image.downloaded") }}</span>
              <span class="size">{{ formatBytes(m.size) }}</span>
              <!-- 右侧操作：未下载时下载，已下载时悬停显示删除 -->
              <template v-if="progress[m.id] === undefined">
                <button v-if="isReady(m)" class="icon-btn act del" :title="t('image.deleteModel')" @click.stop="remove(m)"><Trash2 :size="13" /></button>
                <button v-else-if="canDownload()" class="icon-btn act" :title="t('image.downloadModel')" @click.stop="download(m)"><Download :size="13" /></button>
              </template>
            </div>
            <p>{{ modelDesc(m) }}</p>
            <ProgressBar v-if="progress[m.id] !== undefined" :value="progress[m.id]" />
            <span v-else-if="!isReady(m) && !canDownload()" class="hint-text">{{ t("image.desktopOnly") }}</span>
          </div>
        </div>
        <div v-if="canDownload()" class="source">
          <span>{{ t("image.downloadSource") }}</span>
          <div class="seg">
            <button v-for="s in AI_SOURCES" :key="s" :class="{ on: downloadSource === s }" :title="sourceTitle(s)" @click="downloadSource = s">
              {{ sourceText(s) }}
            </button>
          </div>
        </div>
        <template v-if="canDownload()">
          <p v-if="!status.runtimeReady" class="tip">
            {{ status.runtimeSize ? t("image.runtimeTip", { size: formatBytes(status.runtimeSize) }) : t("image.runtimeTipNoSize") }}
          </p>
          <p v-else-if="!currentModel" class="tip">{{ t("image.inpaintNoModel") }}</p>
        </template>
      </section>

      <section class="section">
        <h3>{{ t("image.inpaintSelect") }}</h3>
        <div class="seg fill">
          <button :class="{ on: tool === 'brush' }" @click="tool = 'brush'"><Brush :size="14" />{{ t("image.brush") }}</button>
          <button :class="{ on: tool === 'rect' }" @click="tool = 'rect'"><SquareDashed :size="14" />{{ t("image.rect") }}</button>
        </div>
        <label v-if="tool === 'brush'" class="slider">
          <span>{{ t("image.brushSize") }}</span>
          <input v-model.number="brushSize" type="range" min="5" max="300" step="5" />
          <em>{{ brushSize }}</em>
        </label>
      </section>

      <section class="section">
        <p class="tip">{{ current ? t("image.inpaintDone", { n: history.length - 1, format: formatInfo(fileType).label }) : t("image.inpaintEmpty") }}</p>
        <button class="btn primary full" :disabled="!current || working" @click="save">
          <Download :size="14" />{{ saved ? t("image.saved") : t("image.downloadImage") }}
        </button>
      </section>
    </aside>

    <section class="card stage">
      <header class="card-title">
        <span class="file" :title="fileName">{{ fileName || t("image.noImage") }}</span>
        <template v-if="current">
          <span class="hint">{{ hint }}</span>
          <ZoomControls :zoom="zoom" :min="MIN_ZOOM" :max="MAX_ZOOM" @zoom="zoomAt" @reset="resetView" />
          <button
            class="btn small subtle"
            :class="{ on: comparing }"
            :disabled="history.length < 2 || working"
            :title="t('image.compareTitle')"
            @pointerdown="comparing = true"
            @pointerup="comparing = false"
            @pointerleave="comparing = false"
          >
            <Eye :size="14" />{{ t("image.compare") }}
          </button>
          <button class="btn small subtle" :disabled="history.length < 2 || working" @click="undo"><Undo2 :size="14" />{{ t("image.undo") }}</button>
          <button class="btn small subtle" :disabled="history.length < 2 || working" :title="t('image.resetTitle')" @click="reset">{{ t("image.reset") }}</button>
          <button class="btn small subtle" :disabled="working" :title="t('image.replaceImage')" @click="dropZone?.open()"><RefreshCw :size="14" />{{ t("image.replace") }}</button>
        </template>
      </header>
      <!-- 加载后隐藏但保留：「更换」按钮由它打开选择框 -->
      <FileDropZone
        v-show="!current"
        ref="dropZone"
        :paste="!current"
        class="drop"
        accept="image/*"
        :title="t('image.dropImage')"
        :hint="t('image.inpaintDropHint')"
        @files="onFiles"
      />
      <div
        v-if="current"
        :ref="observeArea"
        class="area"
        :class="[`tool-${tool}`, { painting: canPaint, panning }]"
        @wheel.prevent="onWheel"
        @contextmenu.prevent
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="brushCursor = null"
      >
        <div class="frame" :style="[frameStyle, zoomStyle]">
          <canvas ref="view" />
          <canvas ref="maskView" class="mask" />
        </div>
        <div
          v-if="brushCursor && canPaint"
          class="brush-cursor"
          :style="{
            left: `${brushCursor.x}px`,
            top: `${brushCursor.y}px`,
            width: `${brushSize * scale * zoom}px`,
            height: `${brushSize * scale * zoom}px`,
          }"
        />
        <div v-if="working" class="busy"><LoaderCircle :size="16" class="spin" />{{ t("image.inpainting") }}</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.inpaint {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.panel {
  flex: 0 0 300px;
  align-self: flex-start;
}
h3 {
  display: flex;
  align-items: center;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
h3 svg {
  margin-right: 5px;
}
.tip {
  line-height: 1.5;
}

/* 模型卡片，与图片去背景一致 */
.models {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.model {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: default;
}
.model.ready {
  cursor: pointer;
}
.model.ready:hover {
  border-color: var(--border-strong);
}
.model.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.model-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.model-head b {
  font-size: 13px;
  font-weight: 600;
}
.model.on .model-head b {
  color: var(--accent);
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
}
.badge.ok {
  background: var(--success-soft);
  color: var(--success);
}
.model-head .size {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
}
.model p {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
.model .act {
  width: 22px;
  height: 22px;
  margin-right: -4px;
}
.model .del {
  opacity: 0;
}
.model:hover .del {
  opacity: 1;
}
.hint-text {
  font-size: 11px;
  color: var(--text-3);
}
.progress {
  margin-top: 4px;
}
.source {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.seg.fill button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.stage {
  flex: 1;
  min-width: 0;
  min-height: 380px;
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
.btn.on {
  color: var(--accent);
}
.drop {
  flex: 1;
  margin: 12px;
}
.area {
  position: relative;
  flex: 1;
  min-height: 200px;
  margin: 12px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-sunken);
  touch-action: none;
  user-select: none;
}
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
.frame .mask {
  position: absolute;
  inset: 0;
  opacity: 0.5;
  pointer-events: none;
}
.area.painting.tool-rect {
  cursor: crosshair;
}
/* 画笔模式隐藏系统光标，用圆圈表示笔刷大小 */
.area.painting.tool-brush {
  cursor: none;
}
.area.panning {
  cursor: grabbing;
}
.brush-cursor {
  position: absolute;
  transform: translate(-50%, -50%);
  border: 1.5px solid var(--accent);
  border-radius: 50%;
  background: var(--accent-soft);
  pointer-events: none;
}
.busy {
  position: absolute;
  left: 50%;
  top: 12px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow);
  font-size: 13px;
  color: var(--text);
}
</style>
