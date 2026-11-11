<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Download, Eye, FileAudio, FileVideo, Headphones, Minimize2, Plus, Trash2, X } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import CheckAll from "@/components/common/CheckAll.vue";
import CompressionPreview, { type CompressionPreviewSource } from "@/components/common/CompressionPreview.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFileChecks } from "@/composables/useFileChecks";
import { useStoredRef } from "@/composables/useStoredRef";
import { errorMessage, showError, showNotice } from "@/utils/errorToast";
import { formatBytes } from "@/utils/format";
import { saveFiles } from "@/utils/saveFile";
import { VIDEO_ACCEPT } from "../media";
import { compressMedia, type AudioCompressionFormat, type CompressionOptions, type CompressionResult } from "../compression";

const { mode } = defineProps<{ mode: "audio" | "video" }>();
const { t, locale } = useI18n();
const isVideo = mode === "video";
const accept = isVideo ? VIDEO_ACCEPT : "audio/*,.mp3,.wav,.m4a,.flac,.ogg,.opus,.aac,.aif,.aiff,.wma";
const fileIcon = isVideo ? FileVideo : FileAudio;

const audioFormat = useStoredRef<AudioCompressionFormat>("audio-compress.format", "mp3");
const audioBitrate = useStoredRef(`${mode}-compress.audioBitrate`, isVideo ? 128 : 96);
const videoBitrate = useStoredRef("video-compress.videoBitrate", 1800);
const shortEdge = useStoredRef("video-compress.shortEdge", 720);
const formats = [
  { value: "mp3", label: "MP3" },
  { value: "m4a", label: "M4A · AAC" },
] satisfies { value: AudioCompressionFormat; label: string }[];
const audioRates = computed(() => [64, 96, 128, 160, 192, 256, 320].map((value) => ({
  value, label: t("video.compressKbps", { value }),
})));
const resolutions = computed(() => [0, 1080, 720, 480, 360].map((value) => ({
  value, label: value ? t("video.compressPixels", { value }) : t("video.compressOriginalSize"),
})));

interface Item {
  id: number;
  file: File;
  result?: CompressionResult;
  error?: string;
}
const items = ref<Item[]>([]);
let nextId = 1;
const dropZone = ref<InstanceType<typeof FileDropZone>>();
const { isChecked, toggle, checkedItems, allChecked, partlyChecked, toggleAll } = useFileChecks(items);
const pending = computed(() => checkedItems.value.filter((item) => !item.result));
const done = computed(() => checkedItems.value.flatMap(({ file, result }) => result ? [{ file, result }] : []));
const totalBefore = computed(() => done.value.reduce((sum, item) => sum + item.file.size, 0));
const totalAfter = computed(() => done.value.reduce((sum, item) => sum + item.result.data.byteLength, 0));
const percentFormat = computed(() => new Intl.NumberFormat(locale.value, {
  style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 1,
}));
const percent = (before: number, after: number) => before > 0 ? percentFormat.value.format((after - before) / before) : "—";

const run = shallowRef<AbortController>();
const activeId = ref<number>();
const progress = ref(0);
const saving = ref(false);
const busy = computed(() => !!run.value || saving.value);
const preview = shallowRef<CompressionPreviewSource | null>(null);
onDeactivated(() => { preview.value = null; });

const MIME: Record<CompressionResult["ext"], string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
};
const outputName = (file: File, ext: CompressionResult["ext"]) =>
  `${file.name.replace(/\.[^.]+$/, "") || file.name}_${t("video.compressSuffix")}.${ext}`;

function showPending(item: Item) {
  if (run.value && isChecked(item) && !item.error) return showNotice(t("common.compressionInProgress"));
  showNotice(t("common.compressBeforeResult", { action: t("video.compressStart") }));
}

function openPreview(item: Item) {
  if (!item.result) return showPending(item);
  const { data, ext } = item.result;
  preview.value = {
    kind: mode,
    variant: "compressed",
    name: outputName(item.file, ext),
    blob: new Blob([data as BlobPart], { type: MIME[ext] }),
  };
}

function openOriginal(item: Item) {
  preview.value = { kind: mode, variant: "original", name: item.file.name, blob: item.file };
}

function addFiles(files: File[]) {
  if (!busy.value) items.value.push(...files.map((file) => ({ id: nextId++, file })));
}

watch([audioFormat, audioBitrate, videoBitrate, shortEdge], () => {
  for (const item of items.value) {
    item.result = undefined;
    item.error = undefined;
  }
});
onBeforeUnmount(() => run.value?.abort());

async function compress() {
  if (busy.value || !pending.value.length) return;
  const queue = pending.value;
  const options: CompressionOptions = isVideo
    ? { mode: "video", shortEdge: shortEdge.value, videoBitrate: videoBitrate.value, audioBitrate: audioBitrate.value }
    : { mode: "audio", format: audioFormat.value, audioBitrate: audioBitrate.value };
  const controller = new AbortController();
  run.value = controller;
  try {
    for (const item of queue) {
      if (controller.signal.aborted) break;
      activeId.value = item.id;
      progress.value = 0;
      item.error = undefined;
      try {
        item.result = await compressMedia(item.file, options, (value) => { progress.value = value; }, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) break;
        item.error = errorMessage(error);
        showError(error, item.file.name);
      }
    }
  } finally {
    activeId.value = undefined;
    run.value = undefined;
  }
}

async function download(entries: { file: File; result: CompressionResult }[]) {
  if (busy.value || !entries.length) return;
  saving.value = true;
  try {
    await saveFiles(entries.map(({ file, result }) => ({
      name: outputName(file, result.ext),
      data: result.data,
    })), t(isVideo ? "video.compressVideoZip" : "video.compressAudioZip"));
  } catch (error) {
    showError(error);
  } finally {
    saving.value = false;
  }
}

function downloadOne(item: Item) {
  if (!item.result) return showNotice(t("common.compressBeforeDownload"));
  void download([{ file: item.file, result: item.result }]);
}

function downloadSelected() {
  if (!checkedItems.value.length) return showNotice(t("common.selectFilesToSave"));
  if (!done.value.length) return showNotice(t("common.compressBeforeDownload"));
  void download(done.value);
}
</script>

<template>
  <div class="compress">
    <aside class="card settings">
      <div class="card-title">{{ t("video.compressSettings") }}</div>
      <section class="section">
        <h3>{{ t("video.compressOutput") }} <b v-if="isVideo" class="value">MP4 · H.264</b></h3>
        <AppSelect v-if="!isVideo" v-model="audioFormat" :options="formats" :disabled="busy" :aria-label="t('video.compressOutput')" />
        <template v-if="isVideo">
          <h3>{{ t("video.compressResolution") }}</h3>
          <AppSelect v-model="shortEdge" :options="resolutions" :disabled="busy" :aria-label="t('video.compressResolution')" />
          <p class="tip">{{ t("video.compressResolutionTip") }}</p>
          <h3><label for="compress-video-bitrate">{{ t("video.compressVideoBitrate") }}</label> <b class="value">{{ t("video.compressKbps", { value: videoBitrate }) }}</b></h3>
          <input id="compress-video-bitrate" v-model.number="videoBitrate" class="range" type="range" min="300" max="12000" step="100" :disabled="busy" />
        </template>
        <h3>{{ t("video.compressAudioBitrate") }}</h3>
        <AppSelect v-model="audioBitrate" :options="audioRates" :disabled="busy" :aria-label="t('video.compressAudioBitrate')" />
        <p class="tip">{{ t("video.compressBitrateTip") }}</p>
      </section>

      <section class="section total">
        <h3>{{ t("video.compressResult") }}<span v-if="run" class="value">{{ t("video.compressWorking") }}</span></h3>
        <div class="saving" :class="{ empty: !done.length, bad: totalAfter > totalBefore }">
          {{ done.length ? percent(totalBefore, totalAfter) : "—" }}
        </div>
        <p class="tip">
          {{ done.length
            ? t("video.compressSummary", { n: done.length, before: formatBytes(totalBefore), after: formatBytes(totalAfter) })
            : t("video.compressEmpty") }}
        </p>
        <p v-if="done.length && totalAfter >= totalBefore" class="tip bad">{{ t("video.compressNotSmaller") }}</p>
        <button v-if="run" type="button" class="btn full" @click="run.abort()">{{ t("video.cancel") }}</button>
        <button v-else type="button" class="btn primary full" :disabled="!pending.length || busy" @click="compress">
          <Minimize2 :size="14" />{{ t("video.compressStart") }}
        </button>
        <button type="button" class="btn full" :disabled="!items.length || (!!done.length && busy)" @click="downloadSelected">
          <Download :size="14" />{{ t("video.compressSaveSelected") }}
        </button>
      </section>
    </aside>

    <section class="card list">
      <header class="card-title">
        <span class="list-title">
          <CheckAll v-if="items.length" :checked="allChecked" :partly="partlyChecked" :disabled="busy" @toggle="toggleAll">
            {{ t(isVideo ? "video.videoLabel" : "video.compressAudioFiles") }}
          </CheckAll>
          <template v-else>{{ t(isVideo ? "video.videoLabel" : "video.compressAudioFiles") }}</template>
          <em v-if="items.length">{{ checkedItems.length }} / {{ items.length }}</em>
        </span>
        <template v-if="items.length">
          <button type="button" class="btn small subtle" :disabled="busy" @click="dropZone?.open()">
            <Plus :size="14" />{{ t("image.add") }}
          </button>
          <button type="button" class="btn small subtle" :disabled="busy" @click="items = []">
            <Trash2 :size="14" />{{ t("video.clear") }}
          </button>
        </template>
      </header>
      <FileDropZone
        v-if="!items.length"
        ref="dropZone"
        class="drop"
        :accept="accept"
        multiple
        :paste="false"
        :title="t(isVideo ? 'video.compressDropVideo' : 'audio.dropAudio')"
        :hint="t('video.compressLocal')"
        @files="addFiles"
      />
      <template v-else>
        <ul class="rows">
          <li v-for="item in items" :key="item.id" class="row" :class="{ unchecked: !isChecked(item) }">
            <input
              type="checkbox"
              class="file-check"
              :aria-label="item.file.name"
              :checked="isChecked(item)"
              :disabled="busy"
              @change="toggle(item)"
            />
            <button type="button" class="compression-source" :aria-label="`${t(isVideo ? 'common.originalPreview' : 'common.listenOriginalAudio')} · ${item.file.name}`" @click="openOriginal(item)">
              <span class="file-icon"><component :is="fileIcon" :size="22" /></span>
              <span class="meta">
                <span class="name" :title="item.file.name">{{ item.file.name }}</span>
                <span v-if="item.error" class="error">{{ item.error }}</span>
                <span v-else-if="item.result" class="tip">{{ item.result.ext.toUpperCase() }}</span>
              </span>
            </button>
            <div class="sizes">
              <span>{{ formatBytes(item.file.size) }}<template v-if="item.result"> → <strong>{{ formatBytes(item.result.data.byteLength) }}</strong></template></span>
              <progress v-if="activeId === item.id" :value="progress" max="1" :aria-label="t('video.compressWorking')" />
              <span v-else-if="item.result" class="size-bar">
                <i :style="{ width: `${Math.min(100, item.result.data.byteLength / Math.max(1, item.file.size) * 100)}%` }" />
              </span>
            </div>
            <b v-if="item.result" class="badge" :class="{ bad: item.result.data.byteLength > item.file.size }">
              {{ percent(item.file.size, item.result.data.byteLength) }}
            </b>
            <button type="button" class="icon-btn" :title="t(isVideo ? 'common.compressedPreview' : 'common.listenCompressedAudio')" :aria-label="t(isVideo ? 'common.compressedPreview' : 'common.listenCompressedAudio')" @click="openPreview(item)">
              <component :is="isVideo ? Eye : Headphones" :size="14" />
            </button>
            <button type="button" class="icon-btn" :title="t('video.saveOne')" :aria-label="t('video.saveOne')" :disabled="!!item.result && busy" @click="downloadOne(item)">
              <Download :size="14" />
            </button>
            <button type="button" class="icon-btn" :title="t('video.remove')" :aria-label="t('video.remove')" :disabled="busy" @click="items = items.filter((entry) => entry.id !== item.id)">
              <X :size="14" />
            </button>
          </li>
        </ul>
        <FileDropZone v-if="!busy" ref="dropZone" compact class="more" :accept="accept" multiple :paste="false" :title="t('image.addMore')" @files="addFiles" />
      </template>
    </section>
    <CompressionPreview :source="preview" @close="preview = null" />
  </div>
</template>

<style scoped>
.compress {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  align-items: stretch;
  gap: 14px;
}

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

.value {
  margin-inline-start: auto;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.range {
  width: 100%;
  margin: 0;
  accent-color: var(--accent);
}

.saving {
  color: var(--success);
  font-family: var(--font-serif);
  font-size: 40px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.saving.empty {
  color: var(--text-3);
}

.total .btn {
  margin-top: 2px;
}

.list-title {
  flex: 1;
  min-width: 0;
}

.list-title em {
  margin-inline-start: 6px;
  color: var(--text-3);
  font-style: normal;
  font-weight: 400;
}

.drop,
.more {
  margin: 12px;
}

.rows {
  margin: 0;
  padding: 6px;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
}

.row + .row {
  border-top: 1px solid var(--border);
}

.row:hover {
  background: var(--hover);
}

.file-icon {
  display: grid;
  flex: 0 0 44px;
  height: 44px;
  place-items: center;
  border-radius: 6px;
  background: var(--bg-sunken);
  color: var(--text-2);
}

.unchecked .file-icon {
  color: var(--text-3);
}

.meta,
.sizes {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.meta {
  flex: 1;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error {
  color: var(--danger);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.sizes {
  flex: 0 1 145px;
  color: var(--text-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.sizes strong {
  color: var(--text);
  white-space: nowrap;
}

progress,
.size-bar {
  width: 100%;
  height: 4px;
  border-radius: 3px;
  accent-color: var(--accent);
}

.size-bar {
  overflow: hidden;
  background: var(--active);
}

.size-bar i {
  display: block;
  height: 100%;
  background: var(--accent);
}

.badge {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--success-soft);
  color: var(--success);
  white-space: nowrap;
  font-size: 12px;
}

.bad {
  color: var(--danger);
}

.badge.bad {
  background: var(--danger-soft);
}

@media (max-width: 720px) {
  .compress {
    grid-template-columns: minmax(0, 1fr);
  }

  .row {
    gap: 5px;
    padding-inline: 4px;
  }

  .file-icon {
    display: none;
  }

  .sizes {
    flex-basis: 80px;
  }
}
</style>
