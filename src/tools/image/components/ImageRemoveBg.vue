<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue";
import { CircleCheck, Download, LoaderCircle, Pipette, RefreshCw, Sparkles, Trash2, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useFitFrame } from "@/composables/useFitFrame";
import { saveFile } from "@/utils/saveFile";
import { toHex } from "@/utils/color";
import { canvasToBytes, createCanvas, loadImage } from "../utils";
import { detectBackgroundColors, removeBackground, type Rgb } from "../effects";
import { AI_MODELS, canDownload, deleteModel, downloadModel, downloadedModels, modelById, type AiModel } from "../aiModels";
import { applyMask, segment } from "../segment";
import { formatBytes } from "@/utils/format";

/**
 * 图片去背景，两种方式：
 * - AI 识别：用 AI 模型找出主体（人物、商品、动物等），适合照片；内置轻量模型，可下载效果更好的模型
 * - 按颜色：去除纯色背景，按容差变为透明，适合 Logo、签名、截图等背景单一的图片
 * 去除后可以换成其他底色。
 */
const mode = useStoredRef<"ai" | "color">("removebg.mode", "ai");
const modelId = useStoredRef("removebg.model", "u2netp");
const tolerance = useStoredRef("removebg.tolerance", 12);
const feather = useStoredRef("removebg.feather", 8);
const contiguous = useStoredRef("removebg.contiguous", true);
/** 新背景：transparent 透明，或者一个颜色 */
const fill = useStoredRef("removebg.fill", "transparent");

const PRESETS = [
  { value: "transparent", label: "透明" },
  { value: "#ffffff", label: "白" },
  { value: "#438edb", label: "蓝" },
  { value: "#d9001b", label: "红" },
];

const fileName = ref("");
const loadError = ref("");
const source = shallowRef<{ data: ImageData; width: number; height: number } | null>(null);
/** 要去除的背景色，可以有多种（渐变、阴影、双色背景等） */
const bgColors = ref<Rgb[]>([]);
const MAX_COLORS = 8;
const picking = ref(false);

const onFiles = async ([file]: File[]) => {
  loadError.value = "";
  try {
    const img = await loadImage(file);
    const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    fileName.value = file.name;
    source.value = { data, width: canvas.width, height: canvas.height };
    sourceCanvas = canvas;
    masks.clear();
    autoDetect();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
};

// ---------- 处理与预览 ----------
const view = ref<HTMLCanvasElement>();
const size = computed(() => (source.value ? { width: source.value.width, height: source.value.height } : null));
const { observeArea, frameStyle } = useFitFrame(size);

/** 去掉背景后的结果（透明背景），换底色只在显示和导出时叠加 */
const result = shallowRef<HTMLCanvasElement | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;
const process = () => {
  clearTimeout(timer);
  if (mode.value === "ai") return processAi();
  // 拖动滑块时稍等片刻再计算，大图也不会卡
  timer = setTimeout(async () => {
    const s = source.value;
    if (!s) return;
    const pixels = removeBackground(s.data.data, s.width, s.height, {
      colors: bgColors.value,
      tolerance: tolerance.value,
      feather: feather.value,
      contiguous: contiguous.value,
    });
    const { canvas, ctx } = createCanvas(s.width, s.height);
    ctx.putImageData(new ImageData(pixels, s.width, s.height), 0, 0);
    result.value = canvas;
  }, 120);
};
watch([source, bgColors, tolerance, feather, contiguous, mode, modelId], process, { deep: true });

// ---------- AI 识别 ----------
let sourceCanvas: HTMLCanvasElement | null = null;
/** 当前图片在各个模型下的识别结果，切换模型时不用重新计算 */
const masks = new Map<string, Uint8ClampedArray>();
const downloaded = ref<string[]>([]);
const recognizing = ref(false);
const aiError = ref("");
const progress = ref<Record<string, number>>({});
onMounted(async () => (downloaded.value = await downloadedModels()));

const isReady = (m: AiModel) => m.builtin || downloaded.value.includes(m.id);
const currentModel = computed(() => (isReady(modelById(modelId.value)) ? modelById(modelId.value) : AI_MODELS[0]));

let run = 0;
async function processAi() {
  const s = source.value;
  if (!s || !sourceCanvas) return;
  const model = currentModel.value;
  const id = ++run;
  aiError.value = "";
  let mask = masks.get(model.id);
  if (!mask) {
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
  if (id !== run) return;
  const { canvas, ctx } = createCanvas(s.width, s.height);
  ctx.putImageData(new ImageData(applyMask(s.data.data, mask), s.width, s.height), 0, 0);
  result.value = canvas;
}

const selectModel = (m: AiModel) => isReady(m) && (modelId.value = m.id);

const download = async (m: AiModel) => {
  aiError.value = "";
  progress.value = { ...progress.value, [m.id]: 0 };
  try {
    await downloadModel(m, (ratio) => (progress.value = { ...progress.value, [m.id]: ratio }));
    downloaded.value = await downloadedModels();
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
  downloaded.value = await downloadedModels();
  masks.delete(m.id);
  if (modelId.value === m.id) modelId.value = "u2netp";
};

/** 叠加新底色后的最终图片 */
const compose = () => {
  const r = result.value!;
  const { canvas, ctx } = createCanvas(r.width, r.height);
  if (fill.value !== "transparent") {
    ctx.fillStyle = fill.value;
    ctx.fillRect(0, 0, r.width, r.height);
  }
  ctx.drawImage(r, 0, 0);
  return canvas;
};

watch([result, fill], async () => {
  await nextTick();
  const v = view.value;
  if (!v || !result.value) return;
  const out = compose();
  v.width = out.width;
  v.height = out.height;
  v.getContext("2d")!.drawImage(out, 0, 0);
});

// ---------- 背景色列表 ----------

/** 从图片边缘自动识别最主要的几种颜色 */
const autoDetect = () => {
  const s = source.value;
  if (s) bgColors.value = detectBackgroundColors(s.data.data, s.width, s.height, 3);
};

/** 吸管：点击图片添加一种背景色（可以连续点击多处） */
const onPick = (e: MouseEvent) => {
  const s = source.value;
  if (!picking.value || !s || !view.value) return;
  const rect = view.value.getBoundingClientRect();
  const x = Math.min(s.width - 1, Math.floor(((e.clientX - rect.left) / rect.width) * s.width));
  const y = Math.min(s.height - 1, Math.floor(((e.clientY - rect.top) / rect.height) * s.height));
  const i = (y * s.width + x) * 4;
  const color: Rgb = [s.data.data[i], s.data.data[i + 1], s.data.data[i + 2]];
  // 和已有颜色非常接近的不重复添加
  const exists = bgColors.value.some((c) => Math.hypot(c[0] - color[0], c[1] - color[1], c[2] - color[2]) < 12);
  if (!exists) bgColors.value = [...bgColors.value, color].slice(-MAX_COLORS);
};

const removeColor = (index: number) => {
  bgColors.value = bgColors.value.filter((_, i) => i !== index);
};

const hexOf = (c: Rgb) => toHex({ r: c[0], g: c[1], b: c[2], a: 1 });

// ---------- 导出 ----------
const saved = ref(false);
const save = async () => {
  if (!result.value) return;
  // 透明背景只能用 PNG；换了底色用 JPG 体积更小
  const transparent = fill.value === "transparent";
  const bytes = await canvasToBytes(compose(), transparent ? "image/png" : "image/jpeg", 0.95);
  const base = fileName.value.replace(/\.[^.]+$/, "") || "image";
  if (await saveFile(bytes, `${base}_去背景.${transparent ? "png" : "jpg"}`)) {
    saved.value = true;
    setTimeout(() => (saved.value = false), 1500);
  }
};
</script>

<template>
  <div class="removebg">
    <aside class="card panel">
      <section class="section">
        <div class="seg modes">
          <button :class="{ on: mode === 'ai' }" title="自动识别人物、商品、动物等主体，适合照片" @click="mode = 'ai'"><Sparkles :size="13" />AI 识别</button>
          <button :class="{ on: mode === 'color' }" title="去除纯色背景，适合 Logo、签名、截图" @click="mode = 'color'"><Pipette :size="13" />按颜色</button>
        </div>
      </section>

      <section v-if="mode === 'ai'" class="section">
        <h3>模型</h3>
        <div class="models">
          <div
            v-for="m in AI_MODELS"
            :key="m.id"
            class="model"
            :class="{ on: currentModel.id === m.id, ready: isReady(m) }"
            @click="selectModel(m)"
          >
            <div class="model-head">
              <b>{{ m.name }}</b>
              <span v-if="m.builtin" class="badge">内置</span>
              <span v-else-if="isReady(m)" class="badge ok"><CircleCheck :size="11" />已下载</span>
              <span class="size">{{ formatBytes(m.size) }}</span>
            </div>
            <p>{{ m.desc }}</p>
            <div v-if="progress[m.id] !== undefined" class="progress"><i :style="{ width: `${progress[m.id] * 100}%` }" /></div>
            <template v-else-if="!isReady(m)">
              <button v-if="canDownload()" class="btn small" @click.stop="download(m)"><Download :size="12" />下载到本机</button>
              <span v-else class="hint-text">桌面版可下载</span>
            </template>
            <button v-else-if="!m.builtin" class="icon-btn del" title="删除这个模型，释放空间" @click.stop="remove(m)"><Trash2 :size="12" /></button>
          </div>
        </div>
        <p v-if="aiError" class="error">{{ aiError }}</p>
        <p v-else class="tip">下载的模型保存在本机，之后无需联网</p>
      </section>

      <section v-if="mode === 'color'" class="section">
        <h3>
          要去除的背景色
          <button class="link" title="按图片边缘重新识别" @click="autoDetect">重新识别</button>
        </h3>
        <div class="colors">
          <span v-for="(c, i) in bgColors" :key="hexOf(c) + i" class="color-chip" :title="hexOf(c)">
            <i :style="{ background: hexOf(c) }" />
            <button title="移除这个颜色" @click="removeColor(i)"><X :size="11" /></button>
          </span>
          <span v-if="!bgColors.length" class="tip">还没有背景色</span>
        </div>
        <button class="btn small" :class="{ primary: picking }" :disabled="!source || (bgColors.length >= MAX_COLORS && !picking)" @click="picking = !picking">
          <Pipette :size="13" />{{ picking ? "完成取色" : "吸管添加颜色" }}
        </button>
        <p class="tip">背景有渐变、阴影或多种颜色时，用吸管在残留的地方多点几下</p>
      </section>

      <section v-if="mode === 'color'" class="section">
        <label class="slider">
          <span>容差</span>
          <input v-model.number="tolerance" type="range" min="1" max="60" />
          <em>{{ tolerance }}</em>
        </label>
        <label class="slider">
          <span>柔化</span>
          <input v-model.number="feather" type="range" min="0" max="40" />
          <em>{{ feather }}</em>
        </label>
        <label class="check"><input v-model="contiguous" type="checkbox" />只去除与边缘相连的背景</label>
        <p class="tip">容差越大去除越多；主体里有和背景相近的颜色时，保持勾选「只去除与边缘相连」</p>
      </section>

      <section class="section">
        <h3>新背景</h3>
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
          <label class="fill custom" :class="{ on: !PRESETS.some((p) => p.value === fill) }" title="自定义颜色">
            <input
              type="color"
              :value="fill === 'transparent' ? '#ffffff' : fill"
              @input="fill = ($event.target as HTMLInputElement).value"
            />
          </label>
        </div>
        <p class="tip">证件照可以直接换成白、蓝、红底</p>
      </section>

      <section class="section">
        <button class="btn primary full" :disabled="!result || recognizing" @click="save">
          <Download :size="14" />{{ saved ? "已保存" : fill === "transparent" ? "下载 PNG（透明背景）" : "下载 JPG" }}
        </button>
      </section>
    </aside>

    <section class="card stage">
      <header class="card-title">
        <span class="file" :title="fileName">{{ fileName || "未选择图片" }}</span>
        <span class="hint">{{ recognizing ? "正在识别主体…" : picking && mode === "color" ? "点击图片上要去除的背景，可以连续点多处" : "" }}</span>
        <label v-if="source" class="btn small subtle">
          <RefreshCw :size="14" />更换
          <input type="file" accept="image/*" hidden @change="onFiles([...(($event.target as HTMLInputElement).files ?? [])])" />
        </label>
      </header>
      <FileDropZone
        v-if="!source"
        class="drop"
        accept="image/*"
        title="拖入图片，或点击选择"
        hint="人像、商品、动物等照片用 AI 识别；纯色背景的 Logo、签名用按颜色去除。也可以按 Ctrl + V 粘贴"
        @files="onFiles"
      >
        <span v-if="loadError" class="load-error">{{ loadError }}</span>
      </FileDropZone>
      <div v-else :ref="observeArea" class="area checker">
        <div class="frame" :style="frameStyle">
          <canvas ref="view" :class="{ picking: picking && mode === 'color' }" @click="mode === 'color' && onPick($event)" />
        </div>
        <div v-if="recognizing" class="busy"><LoaderCircle :size="22" class="spin" />正在识别主体…</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 两个按钮平分一整行（.fill 已用于底色色块，这里用 .modes） */
.seg.modes {
  display: flex;
}
.seg.modes button {
  flex: 1;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
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
.model .btn.small {
  align-self: flex-start;
  height: 24px;
  margin-top: 2px;
  padding: 0 8px;
  font-size: 12px;
}
.model .del {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 22px;
  height: 22px;
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
  height: 4px;
  margin-top: 4px;
  border-radius: 2px;
  background: var(--active);
  overflow: hidden;
}
.progress i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.4s;
}
.error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
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
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
  font-weight: 400;
  color: var(--accent);
}
.btn.small {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
.area {
  position: relative;
  flex: 1;
  min-height: 200px;
  margin: 12px;
  border-radius: 8px;
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
canvas.picking {
  cursor: crosshair;
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
  flex: 0 0 272px;
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
.slider {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.slider span {
  flex: 0 0 32px;
}
.slider input {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}
.slider em {
  flex: 0 0 24px;
  font-style: normal;
  text-align: right;
  color: var(--text-3);
}
.tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
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
.fill.custom input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.btn.full {
  width: 100%;
  justify-content: center;
}
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.load-error {
  margin-top: 8px;
  color: var(--danger);
}
</style>
