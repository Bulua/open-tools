<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Download, Trash2, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile, saveFiles } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import {
  IMAGE_FORMATS,
  canvasToBytes,
  createCanvas,
  fitSize,
  formatInfo,
  loadImage,
  outputFormatOf,
  replaceExtension,
  type ImageFormat,
} from "../utils";

/**
 * 批量压缩 / 转换格式 / 限制尺寸。选项一改，所有图片自动重新处理。
 * 如果处理后反而变大且格式、尺寸都没变，保留原图。
 */
const format = useStoredRef<"keep" | ImageFormat>("image-compress.format", "keep");
const quality = useStoredRef("image-compress.quality", 80);
const maxWidth = useStoredRef("image-compress.maxWidth", 0);
const maxHeight = useStoredRef("image-compress.maxHeight", 0);

interface Item {
  id: number;
  file: File;
  thumb: string;
  img: HTMLImageElement;
  result?: { bytes: Uint8Array; width: number; height: number; format: ImageFormat; keptOriginal: boolean };
  error?: string;
}

const items = ref<Item[]>([]);
const processing = ref(false);
let nextId = 1;

const addFiles = async (files: File[]) => {
  for (const file of files) {
    try {
      const img = await loadImage(file);
      items.value.push({ id: nextId++, file, thumb: URL.createObjectURL(file), img });
    } catch (e) {
      items.value.push({
        id: nextId++,
        file,
        thumb: "",
        img: new Image(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
};

const remove = (item: Item) => {
  URL.revokeObjectURL(item.thumb);
  items.value = items.value.filter((i) => i !== item);
};
const clear = () => {
  items.value.forEach((i) => URL.revokeObjectURL(i.thumb));
  items.value = [];
};
onBeforeUnmount(clear);

const targetFormat = (item: Item) => (format.value === "keep" ? outputFormatOf(item.file.type) : format.value);

const processOne = async (item: Item) => {
  const target = targetFormat(item);
  const { naturalWidth: w0, naturalHeight: h0 } = item.img;
  const { width, height } = fitSize(w0, h0, maxWidth.value, maxHeight.value);
  const { canvas, ctx } = createCanvas(width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(item.img, 0, 0, width, height);
  const bytes = await canvasToBytes(canvas, target, quality.value / 100);

  const unchanged = target === item.file.type && width === w0 && height === h0;
  if (unchanged && bytes.length >= item.file.size) {
    return { bytes: new Uint8Array(await item.file.arrayBuffer()), width, height, format: target, keptOriginal: true };
  }
  return { bytes, width, height, format: target, keptOriginal: false };
};

// 选项或图片变化后稍等片刻再处理，拖动质量滑块时不会频繁计算
let run = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const scheduleProcess = () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const id = ++run;
    processing.value = true;
    for (const item of items.value) {
      if (item.error && !item.thumb) continue;
      try {
        const result = await processOne(item);
        if (id !== run) return;
        item.result = result;
        item.error = undefined;
      } catch (e) {
        if (id !== run) return;
        item.error = e instanceof Error ? e.message : String(e);
      }
    }
    if (id === run) processing.value = false;
  }, 250);
};
watch([format, quality, maxWidth, maxHeight, () => items.value.length], scheduleProcess);

// ---------- 统计与下载 ----------

const done = computed(() => items.value.filter((i) => i.result));
const totalBefore = computed(() => done.value.reduce((s, i) => s + i.file.size, 0));
const totalAfter = computed(() => done.value.reduce((s, i) => s + i.result!.bytes.length, 0));

const percent = (before: number, after: number) => {
  if (!before) return "";
  const p = Math.round((1 - after / before) * 100);
  return p >= 0 ? `-${p}%` : `+${-p}%`;
};

const outputName = (item: Item) => replaceExtension(item.file.name, formatInfo(item.result!.format).ext);

const downloadOne = (item: Item) => item.result && saveFile(item.result.bytes, outputName(item));
const downloadAll = () =>
  saveFiles(
    done.value.map((i) => ({ name: outputName(i), data: i.result!.bytes })),
    "压缩后的图片.zip",
  );

const lossless = computed(() => format.value === "image/png");
const parseSize = (e: Event) => Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0));
</script>

<template>
  <div class="compress">
    <section class="card options">
      <div class="option">
        <span class="label">输出格式</span>
        <div class="seg">
          <button :class="{ on: format === 'keep' }" @click="format = 'keep'">保持原格式</button>
          <button v-for="f in IMAGE_FORMATS" :key="f.value" :class="{ on: format === f.value }" @click="format = f.value">
            {{ f.label }}
          </button>
        </div>
      </div>

      <div class="option">
        <span class="label">质量</span>
        <input v-model.number="quality" type="range" min="10" max="100" step="5" :disabled="lossless" />
        <span class="value">{{ lossless ? "无损" : `${quality}%` }}</span>
      </div>

      <div class="option">
        <span class="label">最大尺寸</span>
        <input class="field size" type="number" min="0" :value="maxWidth || ''" placeholder="宽度不限" @change="maxWidth = parseSize($event)" />
        <span class="times">×</span>
        <input class="field size" type="number" min="0" :value="maxHeight || ''" placeholder="高度不限" @change="maxHeight = parseSize($event)" />
        <span class="hint">超过时等比缩小</span>
      </div>
    </section>

    <FileDropZone
      v-if="!items.length"
      accept="image/*"
      multiple
      title="拖入图片，或点击选择（可多选）"
      hint="支持 JPG、PNG、WebP、GIF、BMP，也可以按 Ctrl + V 粘贴截图"
      @files="addFiles"
    />

    <template v-else>
      <section class="card list">
        <header class="list-head">
          <span class="summary">
            共 {{ items.length }} 张<template v-if="done.length">，{{ formatBytes(totalBefore) }} → {{ formatBytes(totalAfter) }}
              <b :class="totalAfter <= totalBefore ? 'good' : 'bad'">{{ percent(totalBefore, totalAfter) }}</b>
            </template>
            <em v-if="processing">处理中…</em>
          </span>
          <button class="btn subtle" @click="clear"><Trash2 :size="14" />清空</button>
          <button class="btn primary" :disabled="!done.length || processing" @click="downloadAll">
            <Download :size="14" />{{ done.length > 1 ? "全部下载（ZIP）" : "下载" }}
          </button>
        </header>

        <ul class="rows">
          <li v-for="item in items" :key="item.id" class="row">
            <img v-if="item.thumb" class="thumb" :src="item.thumb" alt="" />
            <span v-else class="thumb" />
            <div class="meta">
              <span class="name" :title="item.file.name">{{ item.file.name }}</span>
              <span class="sub">
                {{ item.img.naturalWidth }} × {{ item.img.naturalHeight }}
                <template v-if="item.result && (item.result.width !== item.img.naturalWidth)">→ {{ item.result.width }} × {{ item.result.height }}</template>
                <template v-if="item.result"> · {{ formatInfo(item.result.format).label }}</template>
              </span>
            </div>
            <span v-if="item.error" class="error">{{ item.error }}</span>
            <span v-else-if="item.result" class="sizes">
              {{ formatBytes(item.file.size) }} → {{ formatBytes(item.result.bytes.length) }}
              <b :class="item.result.bytes.length <= item.file.size ? 'good' : 'bad'">
                {{ item.result.keptOriginal ? "已是最小，保留原图" : percent(item.file.size, item.result.bytes.length) }}
              </b>
            </span>
            <span v-else class="sizes muted">处理中…</span>
            <button class="icon-btn" title="下载" :disabled="!item.result" @click="downloadOne(item)"><Download :size="14" /></button>
            <button class="icon-btn" title="移除" @click="remove(item)"><X :size="14" /></button>
          </li>
        </ul>
      </section>

      <FileDropZone compact accept="image/*" multiple title="继续添加图片" @files="addFiles" />
    </template>
  </div>
</template>

<style scoped>
.compress {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.options {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12px 32px;
  padding: 14px 16px;
}
.option {
  display: flex;
  align-items: center;
  gap: 10px;
}
.label {
  font-size: 12px;
  color: var(--text-3);
}
input[type="range"] {
  width: 160px;
  accent-color: var(--accent);
}
.value {
  min-width: 36px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.field.size {
  width: 96px;
  height: 32px;
  font-size: 13px;
}
.times,
.hint {
  font-size: 12px;
  color: var(--text-3);
}

.list {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.list-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--border);
}
.summary {
  flex: 1;
  font-size: 13px;
  color: var(--text-2);
}
.summary em {
  margin-left: 8px;
  font-style: normal;
  color: var(--text-3);
}
.rows {
  list-style: none;
  margin: 0;
  padding: 6px 8px;
  overflow: auto;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  border-radius: 8px;
}
.row:hover {
  background: var(--hover);
}
.thumb {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 6px;
  object-fit: cover;
  background: var(--active);
}
.meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub {
  font-size: 12px;
  color: var(--text-3);
}
.sizes {
  font-size: 13px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.sizes.muted {
  color: var(--text-3);
}
b {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
}
b.good {
  color: var(--success);
  background: var(--success-soft);
}
b.bad {
  color: var(--danger);
  background: var(--danger-soft);
}
.error {
  font-size: 12px;
  color: var(--danger);
}
.icon-btn:disabled,
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
