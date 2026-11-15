<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, onBeforeUnmount, onDeactivated, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Download, Eye, Plus, Trash2, X } from "lucide-vue-next";
import CheckAll from "@/components/common/CheckAll.vue";
import CompressionPreview, { type CompressionPreviewSource } from "@/components/common/CompressionPreview.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFileChecks } from "@/composables/useFileChecks";
import { useStoredRef } from "@/composables/useStoredRef";
import { showError, showNotice } from "@/utils/errorToast";
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
 * 批量处理图片，按 mode 注册为两个工具：
 * - compress：图片压缩，保持原格式，调整质量、限制最大尺寸；处理后反而变大时保留原图
 * - convert：格式转换，JPG / PNG / WebP 互转
 * 选项一改，所有图片自动重新处理。
 */
const props = withDefaults(defineProps<{ mode?: "compress" | "convert" }>(), { mode: "compress" });
const { t } = useI18n();
const converting = props.mode === "convert";

const targetFormatSetting = useStoredRef<ImageFormat>("image-convert.format", "image/webp");
const format = computed<"keep" | ImageFormat>(() => (converting ? targetFormatSetting.value : "keep"));
const quality = useStoredRef(converting ? "image-convert.quality" : "image-compress.quality", converting ? 90 : 80);
const maxWidth = useStoredRef("image-compress.maxWidth", 0);
const maxHeight = useStoredRef("image-compress.maxHeight", 0);
// 格式转换不改变尺寸
const limitW = computed(() => (converting ? 0 : maxWidth.value));
const limitH = computed(() => (converting ? 0 : maxHeight.value));

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
const dropZone = ref<InstanceType<typeof FileDropZone>>();
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

const targetFormat = (item: Item) => (format.value === "keep" ? outputFormatOf(item.file.type) : format.value);

const processOne = async (item: Item) => {
  const target = targetFormat(item);
  const { naturalWidth: w0, naturalHeight: h0 } = item.img;
  const { width, height } = fitSize(w0, h0, limitW.value, limitH.value);
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
  const id = ++run;
  processing.value = items.value.some((item) => !!item.thumb);
  if (!processing.value) return;
  timer = setTimeout(async () => {
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
watch([format, quality, limitW, limitH, () => items.value.length], scheduleProcess);
onBeforeUnmount(() => {
  run += 1;
  clearTimeout(timer);
  clear();
});

// ---------- 统计与下载 ----------

// 统计和下载只算勾选的图片
const { isChecked, toggle: toggleFile, checkedItems, allChecked, partlyChecked, toggleAll } = useFileChecks(items);
const done = computed(() => checkedItems.value.filter((i) => i.result && (converting || !i.error)));
const totalBefore = computed(() => done.value.reduce((s, i) => s + i.file.size, 0));
const totalAfter = computed(() => done.value.reduce((s, i) => s + i.result!.bytes.length, 0));

const percent = (before: number, after: number) => {
  if (!before) return "";
  const p = Math.round((1 - after / before) * 100);
  return p >= 0 ? `-${p}%` : `+${-p}%`;
};

const outputName = (item: Item) => replaceExtension(item.file.name, formatInfo(item.result!.format).ext);
const preview = shallowRef<CompressionPreviewSource | null>(null);
onDeactivated(() => { preview.value = null; });

function showPending(item?: Item, key: "common.autoCompressionPending" | "common.compressBeforeDownload" = "common.autoCompressionPending") {
  if (!processing.value && item?.error) return showError(item.error, item.file.name);
  showNotice(t(key));
}

function openPreview(item: Item) {
  if (processing.value || item.error || !item.result) return showPending(item);
  preview.value = {
    kind: "image",
    variant: "compressed",
    name: outputName(item),
    blob: new Blob([item.result.bytes as BlobPart], { type: item.result.format }),
  };
}

function openOriginal(item: Item) {
  if (!converting) preview.value = { kind: "image", variant: "original", name: item.file.name, blob: item.file };
}

function downloadOne(item: Item) {
  if (!converting && (processing.value || item.error || !item.result)) return showPending(item, "common.compressBeforeDownload");
  if (item.result) void saveFile(item.result.bytes, outputName(item)).catch(showError);
}

function downloadAll() {
  if (!checkedItems.value.length) return showNotice(t("common.selectFilesToSave"));
  if (!converting && (processing.value || !done.value.length)) {
    return showPending(checkedItems.value.find((item) => item.error), "common.compressBeforeDownload");
  }
  if (!done.value.length) return;
  void saveFiles(
    done.value.map((i) => ({ name: outputName(i), data: i.result!.bytes })),
    converting ? t("image.convertZip", { format: formatInfo(targetFormatSetting.value).label }) : t("image.compressZip"),
  ).catch(showError);
}

const lossless = computed(() => (converting ? targetFormatSetting.value === "image/png" : items.value.length > 0 && items.value.every((i) => outputFormatOf(i.file.type) === "image/png")));
const FORMAT_NOTES = computed<Record<ImageFormat, string>>(() => ({
  "image/jpeg": t("image.noteJpeg"),
  "image/png": t("image.notePng"),
  "image/webp": t("image.noteWebp"),
}));
const parseSize = (e: Event) => Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0));

useToolResult(() => !processing.value && items.value.some((item) => item.result && !item.error) ? run : null);
</script>

<template>
  <div class="compress">
    <!-- 左：设置 + 结果汇总 -->
    <aside class="card settings">
      <div class="card-title">{{ converting ? t("image.convertSettings") : t("image.compressSettings") }}</div>

      <section v-if="converting" class="section">
        <h3>{{ t("image.convertTo") }}</h3>
        <div class="formats">
          <button v-for="f in IMAGE_FORMATS" :key="f.value" :class="{ on: targetFormatSetting === f.value }" @click="targetFormatSetting = f.value">
            <b>{{ f.label }}</b>
            <span>{{ FORMAT_NOTES[f.value] }}</span>
          </button>
        </div>
      </section>

      <section class="section">
        <h3>{{ t("image.quality") }} <b class="value">{{ lossless ? t("image.lossless") : `${quality}%` }}</b></h3>
        <input v-model.number="quality" class="range" type="range" min="10" max="100" step="5" :disabled="lossless" />
        <p class="tip">
          {{
            lossless
              ? converting
                ? t("image.pngNoQuality")
                : t("image.pngResizeOnly")
              : t("image.qualityTip")
          }}
        </p>
      </section>

      <section v-if="!converting" class="section">
        <h3>{{ t("image.maxSize") }} <span class="tip inline">{{ t("image.maxSizeTip") }}</span></h3>
        <div class="size-row">
          <input class="field size" type="number" min="0" :value="maxWidth || ''" :placeholder="t('image.anyWidth')" @change="maxWidth = parseSize($event)" />
          <span class="times">×</span>
          <input class="field size" type="number" min="0" :value="maxHeight || ''" :placeholder="t('image.anyHeight')" @change="maxHeight = parseSize($event)" />
        </div>
      </section>

      <!-- 结果汇总：最重要的信息，放大显示 -->
      <section class="section total">
        <h3>{{ t("image.result") }}<em v-if="processing">{{ t("image.processing") }}</em></h3>
        <div class="saving" :class="{ empty: !done.length, bad: done.length && totalAfter > totalBefore }">
          {{ done.length ? percent(totalBefore, totalAfter) : "—" }}
        </div>
        <p class="tip">
          <template v-if="done.length">
            {{ t("image.summary", { n: done.length, before: formatBytes(totalBefore), after: formatBytes(totalAfter) }) }}
          </template>
          <template v-else>{{ converting ? t("image.convertEmpty") : t("image.compressEmpty") }}</template>
        </p>
        <button class="btn primary full" :disabled="converting ? !done.length || processing : !items.length" @click="downloadAll">
          <Download :size="14" />{{ items.length && !checkedItems.length ? t("image.checkToDownload") : done.length > 1 ? t("image.downloadSelected", { n: done.length }) : t("image.download") }}
        </button>
      </section>
    </aside>

    <!-- 右：图片列表 -->
    <section class="card list">
      <header class="card-title">
        <span class="list-title">
          <CheckAll v-if="items.length" :checked="allChecked" :partly="partlyChecked" @toggle="toggleAll">{{ t("image.images") }}</CheckAll>
          <template v-else>{{ t("image.images") }}</template>
          <em v-if="items.length">{{ items.length > 1 ? `${checkedItems.length} / ${items.length}` : items.length }}</em>
        </span>
        <template v-if="items.length">
          <button class="btn small subtle" @click="dropZone?.open()"><Plus :size="14" />{{ t("image.add") }}</button>
          <button class="btn small subtle" @click="clear"><Trash2 :size="14" />{{ t("image.clear") }}</button>
        </template>
      </header>

      <FileDropZone
        v-if="!items.length"
        ref="dropZone"
        class="drop"
        accept="image/*"
        multiple
        :title="t('image.dropImages')"
        :hint="t('image.dropImagesHint')"
        @files="addFiles"
      />

      <template v-else>
        <ul class="rows">
          <li v-for="item in items" :key="item.id" class="row" :class="{ unchecked: !isChecked(item) }">
            <input type="checkbox" class="file-check" :title="t('image.checkHint')" :checked="isChecked(item)" @change="toggleFile(item)" />
            <component
              :is="converting ? 'div' : 'button'"
              :type="converting ? undefined : 'button'"
              class="compression-source"
              :aria-label="converting ? undefined : `${t('common.originalPreview')} · ${item.file.name}`"
              @click="openOriginal(item)"
            >
              <img v-if="item.thumb" class="thumb" :src="item.thumb" alt="" />
              <span v-else class="thumb" />
              <span class="meta">
                <span class="name" :title="item.file.name">{{ item.file.name }}</span>
                <span class="sub">
                  {{ item.img.naturalWidth }} × {{ item.img.naturalHeight }}
                  <template v-if="item.result && item.result.width !== item.img.naturalWidth">→ {{ item.result.width }} × {{ item.result.height }}</template>
                  <template v-if="item.result"> · {{ formatInfo(item.result.format).label }}</template>
                </span>
              </span>
            </component>

            <span v-if="item.error" class="error">{{ item.error }}</span>
            <div v-else-if="item.result" class="sizes">
              <span class="size-text">
                {{ formatBytes(item.file.size) }} → <strong>{{ formatBytes(item.result.bytes.length) }}</strong>
              </span>
              <!-- 压缩后占原图的比例 -->
              <span class="bar"><i :style="{ width: `${Math.min(100, (item.result.bytes.length / item.file.size) * 100)}%` }" /></span>
            </div>
            <span v-else class="sizes muted">{{ t("image.processing") }}</span>

            <b v-if="item.result" class="badge" :class="item.result.bytes.length <= item.file.size ? 'good' : 'bad'">
              {{ item.result.keptOriginal ? t("image.keptOriginal") : percent(item.file.size, item.result.bytes.length) }}
            </b>
            <button v-if="!converting" type="button" class="icon-btn" :title="t('common.compressedPreview')" :aria-label="t('common.compressedPreview')" @click="openPreview(item)">
              <Eye :size="14" />
            </button>
            <button class="icon-btn" :title="t('image.download')" :disabled="converting && !item.result" @click="downloadOne(item)"><Download :size="14" /></button>
            <button class="icon-btn" :title="t('image.remove')" @click="remove(item)"><X :size="14" /></button>
          </li>
        </ul>
        <FileDropZone ref="dropZone" compact class="more" accept="image/*" multiple :title="t('image.addMore')" @files="addFiles" />
      </template>
    </section>
    <CompressionPreview v-if="!converting" :source="preview" @close="preview = null" />
  </div>
</template>

<style scoped>
/* 左侧设置（固定宽），右侧列表；整体高度由内容决定，不留大片空白 */
.compress {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  align-items: stretch;
  gap: 14px;
}

/* ---------- 左侧设置 ---------- */
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
}
h3 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
h3 em {
  margin-left: auto;
  font-style: normal;
  font-weight: 400;
  color: var(--text-3);
}
.value {
  margin-left: auto;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.tip {
  line-height: 1.5;
}
.tip.inline {
  margin-left: auto;
  font-weight: 400;
}
.seg.fill button {
  padding: 0 4px;
}
.formats {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.formats button {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  text-align: left;
}
.formats button b {
  flex: 0 0 44px;
  font-size: 14px;
  font-weight: 600;
}
.formats button span {
  font-size: 12px;
  color: var(--text-3);
}
.formats button:hover {
  border-color: var(--border-strong);
}
.formats button.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.formats button.on b {
  color: var(--accent);
}
.range {
  width: 100%;
  accent-color: var(--accent);
}
.size-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.field.size {
  flex: 1;
  width: 0;
  height: 32px;
  font-size: 13px;
}
.times {
  font-size: 12px;
  color: var(--text-3);
}

/* 结果汇总 */
.total {
  gap: 6px;
  padding-bottom: 14px;
}
.saving {
  font-family: var(--font-serif);
  font-size: 40px;
  line-height: 1.1;
  color: var(--success);
  font-variant-numeric: tabular-nums;
}
.saving.empty {
  color: var(--text-3);
}
.saving.bad {
  color: var(--danger);
}
.total .btn {
  margin-top: 6px;
}

/* ---------- 右侧列表 ---------- */
.list {
  min-height: 0;
}
.list-title {
  flex: 1;
}
.list-title em {
  margin-left: 6px;
  font-style: normal;
  font-weight: 400;
  color: var(--text-3);
}
/* 还没有图片时，拖放区填满列表面板（与左侧同高） */
.drop {
  margin: 12px;
  border-width: 1.5px;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 6px;
}
.more {
  margin: 0 12px 12px;
}
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 10px;
  border-radius: 8px;
}
.row + .row {
  border-top: 1px solid var(--border);
  border-radius: 0;
}
.row:hover {
  background: var(--hover);
}
.thumb {
  width: 52px;
  height: 52px;
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
/* 窗口窄时这一列可以收窄，优先保证文件名可读 */
.sizes {
  flex: 0 1 200px;
  min-width: 110px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.sizes strong {
  font-weight: 500;
  color: var(--text);
}
.sizes.muted {
  display: block;
}
/* 压缩后大小占原图的比例 */
.bar {
  height: 4px;
  border-radius: 2px;
  background: var(--active);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
}
.badge {
  flex: 0 0 72px;
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
}
.badge.good {
  color: var(--success);
  background: var(--success-soft);
}
.badge.bad {
  color: var(--danger);
  background: var(--danger-soft);
}
.icon-btn:disabled,
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
