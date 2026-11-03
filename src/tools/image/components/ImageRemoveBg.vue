<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { CircleCheck, Download, LoaderCircle, Pipette, RefreshCw, Sparkles, Trash2, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import ProgressBar from "@/components/common/ProgressBar.vue";
import ZoomControls from "@/components/common/ZoomControls.vue";
import ColorPicker from "@/components/common/ColorPicker.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useFitFrame } from "@/composables/useFitFrame";
import { useZoomPan } from "@/composables/useZoomPan";
import { saveFile } from "@/utils/saveFile";
import { toHex } from "@/utils/color";
import { canvasToBytes, createCanvas, loadImage } from "../utils";
import type { Rgb } from "../effects";
import { AI_MODELS, AI_SOURCES, aiStatus, canDownload, deleteModel, downloadModel, modelById, type AiModel, type AiSource, type AiStatus } from "../aiModels";
import { segment } from "../segment";
import { formatBytes } from "@/utils/format";

/**
 * 图片去背景：上传后先用 AI 模型找出主体（人物、商品、动物等）去掉背景，
 * 有残留时在图片上点一下，就把这种颜色的背景也去掉（可以连续点多处）。
 * Logo、签名等纯色背景也可以关掉 AI，只按颜色去除。去除后可以换成其他底色。
 */
const { t } = useI18n();
const useAi = useStoredRef("removebg.ai", true);
const modelId = useStoredRef("removebg.model", "u2netp");
/** 下载源，各个 AI 工具共用 */
const downloadSource = useStoredRef<AiSource>("ai.source", "auto");
const tolerance = useStoredRef("removebg.tolerance", 12);
const feather = useStoredRef("removebg.feather", 8);
const contiguous = useStoredRef("removebg.contiguous", true);
/** 新背景：transparent 透明，或者一个颜色 */
const fill = useStoredRef("removebg.fill", "transparent");

const PRESETS = computed(() => [
  { value: "transparent", label: t("image.fillTransparent") },
  { value: "#ffffff", label: t("image.fillWhite") },
  { value: "#438edb", label: t("image.fillBlue") },
  { value: "#d9001b", label: t("image.fillRed") },
]);
/** 模型的名称和说明，按模型 id 取文案 */
const MODEL_TEXT: Record<string, string> = { u2netp: "modelLight", silueta: "modelStandard", "isnet-general-use": "modelFine", u2net_human_seg: "modelPortrait" };
const modelName = (m: AiModel) => (MODEL_TEXT[m.id] ? t(`image.${MODEL_TEXT[m.id]}`) : m.name);
const modelDesc = (m: AiModel) => (MODEL_TEXT[m.id] ? t(`image.${MODEL_TEXT[m.id]}Desc`) : m.desc);

const fileName = ref("");
const loadError = ref("");
const dropZone = ref<InstanceType<typeof FileDropZone>>();
const source = shallowRef<{ data: ImageData; width: number; height: number } | null>(null);

/** 用户点选的背景色，以及点击的位置（作为扩散起点，主体中间围住的背景也能去掉） */
interface Pick {
  color: Rgb;
  seeds: number[];
}
const picks = shallowRef<Pick[]>([]);
const MAX_COLORS = 8;

// ---------- 后台计算 ----------
const worker = new Worker(new URL("../removebg.worker.ts", import.meta.url), { type: "module" });
onBeforeUnmount(() => worker.terminate());

/** 去掉背景后的结果（透明背景），换底色只在显示和导出时叠加 */
let resultCanvas: HTMLCanvasElement | null = null;
const hasResult = ref(false);

let reqId = 0;
/** 换图片时的请求序号，之前发出的计算结果作废 */
let imageReq = 0;
let busy = false;
let queued = false;

/** 按当前设置重新计算；上一次还没算完时只保留最新的一次，拖动滑块也跟得上 */
const render = () => {
  if (!source.value) return;
  if (busy) {
    queued = true;
    return;
  }
  busy = true;
  worker.postMessage({
    type: "run",
    id: ++reqId,
    colors: picks.value.map((p) => [...p.color]),
    seeds: picks.value.flatMap((p) => p.seeds),
    tolerance: tolerance.value,
    feather: feather.value,
    contiguous: contiguous.value,
  });
};

worker.onmessage = (e: MessageEvent<{ id: number; pixels: Uint8ClampedArray<ArrayBuffer> }>) => {
  busy = false;
  const s = source.value;
  if (s && resultCanvas && e.data.id > imageReq) {
    resultCanvas.getContext("2d")!.putImageData(new ImageData(e.data.pixels, s.width, s.height), 0, 0);
    hasResult.value = true;
    drawView();
  }
  if (queued) {
    queued = false;
    render();
  }
};

const onFiles = async ([file]: File[]) => {
  loadError.value = "";
  try {
    const img = await loadImage(file);
    const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    fileName.value = file.name;
    sourceCanvas = canvas;
    resultCanvas = createCanvas(canvas.width, canvas.height).canvas;
    hasResult.value = false;
    masks.clear();
    picks.value = [];
    resetView();
    const copy = new Uint8ClampedArray(data.data);
    worker.postMessage({ type: "image", data: copy, width: canvas.width, height: canvas.height }, [copy.buffer]);
    imageReq = reqId;
    source.value = { data, width: canvas.width, height: canvas.height };
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
};

// ---------- 预览 ----------
const view = ref<HTMLCanvasElement>();
const size = computed(() => (source.value ? { width: source.value.width, height: source.value.height } : null));
const { observeArea, frameStyle } = useFitFrame(size);
// 滚轮缩放、按住拖动平移，放大后更容易点准残留的背景；不拖动直接松开才算点选
const { MIN_ZOOM, MAX_ZOOM, zoom, panning, style: zoomStyle, reset: resetView, zoomAt, onWheel, onDown, onMove, onUp } = useZoomPan();
const onPointerUp = (e: PointerEvent) => onUp() && onPick(e);

/** 结果叠加新底色画到预览上 */
const drawView = () => {
  const v = view.value;
  const r = resultCanvas;
  if (!v || !r || !hasResult.value) return;
  if (v.width !== r.width || v.height !== r.height) {
    v.width = r.width;
    v.height = r.height;
  }
  const ctx = v.getContext("2d")!;
  ctx.clearRect(0, 0, v.width, v.height);
  if (fill.value !== "transparent") {
    ctx.fillStyle = fill.value;
    ctx.fillRect(0, 0, v.width, v.height);
  }
  ctx.drawImage(r, 0, 0);
};
watch([fill, view], drawView);

// ---------- AI 识别 ----------
let sourceCanvas: HTMLCanvasElement | null = null;
/** 当前图片在各个模型下的识别结果，切换模型时不用重新计算 */
const masks = new Map<string, Uint8ClampedArray>();
const status = ref<AiStatus>({ models: [], runtimeReady: false, runtimeSize: 0, dir: "" });
const recognizing = ref(false);
const aiError = ref("");
const progress = ref<Record<string, number>>({});
const refreshStatus = async () => (status.value = await aiStatus());
onMounted(refreshStatus);

const isReady = (m: AiModel) => status.value.runtimeReady && status.value.models.includes(m.id);
/** 正在使用的模型：选中的模型还没下载时用第一个已下载的；一个都没有时为空 */
const currentModel = computed(() => {
  const chosen = modelById(modelId.value);
  return chosen && isReady(chosen) ? chosen : (AI_MODELS.find(isReady) ?? null);
});
const sourceText = (s: AiSource) => t(`image.source${s[0].toUpperCase()}${s.slice(1)}`);
const sourceTitle = (s: AiSource) => t(`image.source${s[0].toUpperCase()}${s.slice(1)}Title`);

let run = 0;
/** 识别主体（同一模型只算一次），把蒙版交给后台线程后重新计算 */
async function updateMask() {
  const s = source.value;
  if (!s || !sourceCanvas) return;
  const id = ++run;
  aiError.value = "";
  recognizing.value = false;
  let mask: Uint8ClampedArray | null = null;
  const model = currentModel.value;
  if (useAi.value && model) {
    mask = masks.get(model.id) ?? null;
    if (!mask) {
      // 识别期间先显示原图（以及已点选颜色的去除效果）
      worker.postMessage({ type: "mask", mask: null });
      render();
      recognizing.value = true;
      try {
        mask = await segment(sourceCanvas, s.width, s.height, model);
        masks.set(model.id, mask);
      } catch (e) {
        if (id === run) aiError.value = e instanceof Error ? e.message : String(e);
        return;
      } finally {
        if (id === run) recognizing.value = false;
      }
    }
  }
  if (id !== run) return;
  worker.postMessage({ type: "mask", mask });
  render();
}
watch([source, useAi, currentModel], updateMask);
watch([picks, tolerance, feather, contiguous], render);

const selectModel = (m: AiModel) => isReady(m) && (modelId.value = m.id);

const download = async (m: AiModel) => {
  aiError.value = "";
  progress.value = { ...progress.value, [m.id]: 0 };
  try {
    await downloadModel(m, downloadSource.value, (ratio) => (progress.value = { ...progress.value, [m.id]: ratio }));
    await refreshStatus();
    modelId.value = m.id;
  } catch (e) {
    aiError.value = e instanceof Error ? e.message : String(e);
  } finally {
    const { [m.id]: _, ...rest } = progress.value;
    progress.value = rest;
  }
};

const remove = async (m: AiModel) => {
  await deleteModel(m);
  await refreshStatus();
  masks.delete(m.id);
};

// ---------- 点选背景色 ----------

/** 点击图片：取这个位置的颜色作为背景色去除 */
const onPick = (e: MouseEvent) => {
  const s = source.value;
  if (recognizing.value || !s || !view.value) return;
  const rect = view.value.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / rect.width;
  const fy = (e.clientY - rect.top) / rect.height;
  // 点在图片外面（放大、平移后的空白处）不取色
  if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return;
  // 点在最边上时坐标可能因舍入超出图片，限制在范围内
  const x = Math.max(0, Math.min(s.width - 1, Math.floor(fx * s.width)));
  const y = Math.max(0, Math.min(s.height - 1, Math.floor(fy * s.height)));
  const seed = y * s.width + x;
  const i = seed * 4;
  const color: Rgb = [s.data.data[i], s.data.data[i + 1], s.data.data[i + 2]];
  // 和已有颜色非常接近的不重复添加，只记下点击位置
  const near = picks.value.findIndex(({ color: c }) => Math.hypot(c[0] - color[0], c[1] - color[1], c[2] - color[2]) < 12);
  if (near >= 0) picks.value = picks.value.map((p, j) => (j === near ? { ...p, seeds: [...p.seeds, seed] } : p));
  else picks.value = [...picks.value, { color, seeds: [seed] }].slice(-MAX_COLORS);
};

const removePick = (index: number) => {
  picks.value = picks.value.filter((_, i) => i !== index);
};

const hexOf = (c: Rgb) => toHex({ r: c[0], g: c[1], b: c[2], a: 1 });

// ---------- 导出 ----------

/** 叠加新底色后的最终图片 */
const compose = () => {
  const r = resultCanvas!;
  const { canvas, ctx } = createCanvas(r.width, r.height);
  if (fill.value !== "transparent") {
    ctx.fillStyle = fill.value;
    ctx.fillRect(0, 0, r.width, r.height);
  }
  ctx.drawImage(r, 0, 0);
  return canvas;
};

const saved = ref(false);
const save = async () => {
  if (!hasResult.value) return;
  // 透明背景只能用 PNG；换了底色用 JPG 体积更小
  const transparent = fill.value === "transparent";
  const bytes = await canvasToBytes(compose(), transparent ? "image/png" : "image/jpeg", 0.95);
  const base = fileName.value.replace(/\.[^.]+$/, "") || "image";
  if (await saveFile(bytes, `${base}_${t("image.removebgSuffix")}.${transparent ? "png" : "jpg"}`)) {
    saved.value = true;
    setTimeout(() => (saved.value = false), 1500);
  }
};
</script>

<template>
  <div class="removebg">
    <aside class="card panel">
      <section class="section">
        <h3>
          <Sparkles :size="13" />{{ t("image.aiSubject") }}
          <label class="switch" :title="t('image.aiSwitchTitle')"><input v-model="useAi" type="checkbox" />{{ t("image.on") }}</label>
        </h3>
        <template v-if="useAi">
          <div class="models">
            <div
              v-for="m in AI_MODELS"
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
          <p v-if="aiError" class="error">{{ aiError }}</p>
          <template v-else-if="canDownload()">
            <p v-if="!status.runtimeReady" class="tip">
              {{ status.runtimeSize ? t("image.runtimeTip", { size: formatBytes(status.runtimeSize) }) : t("image.runtimeTipNoSize") }}
            </p>
            <p v-else-if="!currentModel" class="tip">{{ t("image.noModel") }}</p>
          </template>
        </template>
        <p v-else class="tip">{{ t("image.aiOff") }}</p>
      </section>

      <section class="section">
        <h3>
          <Pipette :size="13" />{{ t("image.pickBg") }}
          <button v-if="picks.length" class="link" :title="t('image.clearPicks')" @click="picks = []">{{ t("image.clear") }}</button>
        </h3>
        <div class="colors">
          <span v-for="(p, i) in picks" :key="hexOf(p.color) + i" class="color-chip" :title="hexOf(p.color)">
            <i :style="{ background: hexOf(p.color) }" />
            <button :title="t('image.removeColor')" @click="removePick(i)"><X :size="11" /></button>
          </span>
          <span v-if="!picks.length" class="tip">{{ t("image.pickTip") }}</span>
        </div>
        <label class="slider">
          <span>{{ t("image.tolerance") }}</span>
          <input v-model.number="tolerance" type="range" min="1" max="60" />
          <em>{{ tolerance }}</em>
        </label>
        <label class="slider">
          <span>{{ t("image.feather") }}</span>
          <input v-model.number="feather" type="range" min="0" max="40" />
          <em>{{ feather }}</em>
        </label>
        <label class="check"><input v-model="contiguous" type="checkbox" />{{ t("image.contiguous") }}</label>
        <p class="tip">{{ t("image.toleranceTip") }}</p>
      </section>

      <section class="section">
        <h3>{{ t("image.newBg") }}</h3>
        <div class="fills">
          <button
            v-for="p in PRESETS"
            :key="p.value"
            class="fill"
            :class="{ on: fill === p.value, transparent: p.value === 'transparent' }"
            :style="p.value === 'transparent' ? {} : { background: p.value }"
            :title="p.label"
            @click="fill = p.value"
          />
          <ColorPicker
            class="fill custom"
            :class="{ on: !PRESETS.some((p) => p.value === fill) }"
            :title="t('image.customColor')"
            :model-value="fill === 'transparent' ? '#ffffff' : fill"
            @update:model-value="fill = $event"
          >
            <span />
          </ColorPicker>
        </div>
        <p class="tip">{{ t("image.idPhotoTip") }}</p>
      </section>

      <section class="section">
        <button class="btn primary full" :disabled="!hasResult || recognizing" @click="save">
          <Download :size="14" />{{ saved ? t("image.saved") : fill === "transparent" ? t("image.downloadPngTransparent") : t("image.downloadJpg") }}
        </button>
      </section>
    </aside>

    <section class="card stage">
      <header class="card-title">
        <span class="file" :title="fileName">{{ fileName || t("image.noImage") }}</span>
        <span class="hint">{{ recognizing ? t("image.recognizing") : source ? t("image.removebgHint") : "" }}</span>
        <ZoomControls v-if="source" :zoom="zoom" :min="MIN_ZOOM" :max="MAX_ZOOM" @zoom="zoomAt" @reset="resetView" />
        <button v-if="source" class="btn small subtle" :title="t('image.replaceImage')" @click="dropZone?.open()"><RefreshCw :size="14" />{{ t("image.replace") }}</button>
      </header>
      <!-- 加载后隐藏但保留：「更换」按钮由它打开选择框 -->
      <FileDropZone
        v-show="!source"
        ref="dropZone"
        :paste="!source"
        class="drop"
        accept="image/*"
        :title="t('image.dropImage')"
        :hint="t('image.removebgDropHint')"
        @files="onFiles"
      >
        <span v-if="loadError" class="load-error">{{ loadError }}</span>
      </FileDropZone>
      <div
        v-if="source"
        :ref="observeArea"
        class="area checker"
        :class="{ picking: !recognizing, panning }"
        @wheel.prevent="onWheel"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onPointerUp"
        @pointercancel="onUp"
      >
        <div class="frame" :style="[frameStyle, zoomStyle]">
          <canvas ref="view" />
        </div>
        <div v-if="recognizing" class="busy"><LoaderCircle :size="22" class="spin" />{{ t("image.recognizing") }}</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
h3 svg {
  margin-right: 5px;
}
/* 标题右侧的开关 */
.switch {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 400;
  cursor: pointer;
}
.switch input {
  margin: 0;
  accent-color: var(--accent);
}
.source {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-2);
}
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
  background: var(--active);
  font-size: 11px;
  color: var(--text-2);
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
.busy {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 14px;
}
.drop {
  flex: 1;
  margin: 12px;
}
.removebg {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
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
  color: var(--accent);
}
.area {
  position: relative;
  flex: 1;
  min-height: 200px;
  margin: 12px;
  border-radius: 8px;
  overflow: hidden;
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
.area.picking {
  cursor: crosshair;
}
.area.panning {
  cursor: grabbing;
}
/* 棋盘格表示透明 */
.checker,
.fill.transparent {
  background-color: var(--bg);
  background-image:
    linear-gradient(45deg, var(--active) 25%, transparent 25%),
    linear-gradient(-45deg, var(--active) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--active) 75%),
    linear-gradient(-45deg, transparent 75%, var(--active) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}
.fill.transparent {
  background-size: 10px 10px;
  background-position: 0 0, 0 5px, 5px -5px, -5px 0;
}

.panel {
  flex: 0 0 320px;
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
.link {
  margin-left: auto;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 400;
  color: var(--accent);
}
/* 背景色列表：色块 + 移除按钮 */
.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.color-chip {
  position: relative;
  display: inline-flex;
}
.color-chip i {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  border: 1px solid var(--border-strong);
}
.color-chip button {
  position: absolute;
  right: -5px;
  top: -5px;
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--text);
  color: var(--bg);
  opacity: 0;
}
.color-chip:hover button {
  opacity: 1;
}
.slider span {
  flex: 0 0 32px;
}
.tip {
  line-height: 1.5;
}
.fills {
  display: flex;
  gap: 8px;
}
.fill {
  position: relative;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  cursor: pointer;
}
.fill.on {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.fill.custom {
  overflow: hidden;
  background: conic-gradient(#f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f87171);
}
.load-error {
  margin-top: 8px;
  color: var(--danger);
}
</style>
