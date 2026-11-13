<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Download, Plus, Trash2, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile, saveFiles } from "@/utils/saveFile";
import { loadImage } from "../shared/utils";
import { MAX_DPI, MIN_DPI, dpiFormatOf, printSizeCm, readDpi, writeDpi } from "./dpi";

/**
 * 修改图片 DPI：只改写文件里记录的 DPI，不重新编码，像素和画质不变。
 * 支持 PNG、JPEG，可以批量处理。
 */
const { t } = useI18n();

const PRESETS = [72, 96, 150, 300];
const dpi = useStoredRef("image-dpi.dpi", 300);

interface Item {
  id: number;
  file: File;
  thumb: string;
  width: number;
  height: number;
  /** 原图记录的 DPI，没有记录时为 null */
  original: { x: number; y: number } | null;
  bytes?: Uint8Array;
  error?: string;
}

const items = ref<Item[]>([]);
const dropZone = ref<InstanceType<typeof FileDropZone>>();
let nextId = 1;

const addFiles = async (files: File[]) => {
  for (const file of files) {
    const item: Item = { id: nextId++, file, thumb: "", width: 0, height: 0, original: null };
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!dpiFormatOf(bytes)) throw new Error(t("image.dpiUnsupported"));
      const img = await loadImage(file);
      Object.assign(item, { bytes, thumb: URL.createObjectURL(file), width: img.naturalWidth, height: img.naturalHeight, original: readDpi(bytes) });
    } catch (e) {
      item.error = e instanceof Error ? e.message : String(e);
    }
    items.value.push(item);
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

const ready = computed(() => items.value.filter((i) => i.bytes));
const setDpi = (e: Event) => {
  const value = Math.round(Number((e.target as HTMLInputElement).value));
  if (value >= MIN_DPI && value <= MAX_DPI) dpi.value = value;
  else (e.target as HTMLInputElement).value = String(dpi.value);
};
const originalText = (item: Item) =>
  !item.original ? t("image.dpiNone") : item.original.x === item.original.y ? String(item.original.x) : `${item.original.x} × ${item.original.y}`;

const downloadOne = (item: Item) => item.bytes && saveFile(writeDpi(item.bytes, dpi.value), item.file.name);
const downloadAll = () =>
  saveFiles(
    ready.value.map((i) => ({ name: i.file.name, data: writeDpi(i.bytes!, dpi.value) })),
    t("image.dpiZip", { dpi: dpi.value }),
  );
</script>

<template>
  <div class="dpi-tool">
    <!-- 左：设置 -->
    <aside class="card settings">
      <div class="card-title">{{ t("image.dpiSettings") }}</div>
      <section class="section">
        <h3>{{ t("image.dpiTarget") }}</h3>
        <div class="seg fill">
          <button v-for="p in PRESETS" :key="p" :class="{ on: dpi === p }" @click="dpi = p">{{ p }}</button>
        </div>
        <label class="custom">
          <input class="field" type="number" :min="MIN_DPI" :max="MAX_DPI" :value="dpi" @change="setDpi" />
          <span>DPI</span>
        </label>
        <p class="tip">{{ t("image.dpiTip") }}</p>
      </section>
      <section class="section">
        <button class="btn primary full" :disabled="!ready.length" @click="downloadAll">
          <Download :size="14" />{{ ready.length > 1 ? t("image.dpiDownloadAll", { n: ready.length }) : t("image.download") }}
        </button>
      </section>
    </aside>

    <!-- 右：图片列表 -->
    <section class="card list">
      <header class="card-title">
        <span class="list-title">{{ t("image.images") }}<em v-if="items.length">{{ items.length }}</em></span>
        <template v-if="items.length">
          <button class="btn small subtle" @click="dropZone?.open()"><Plus :size="14" />{{ t("image.add") }}</button>
          <button class="btn small subtle" @click="clear"><Trash2 :size="14" />{{ t("image.clear") }}</button>
        </template>
      </header>

      <FileDropZone
        v-if="!items.length"
        ref="dropZone"
        class="drop"
        accept="image/png,image/jpeg"
        multiple
        :title="t('image.dropImages')"
        :hint="t('image.dpiDropHint')"
        @files="addFiles"
      />

      <template v-else>
        <ul class="rows">
          <li v-for="item in items" :key="item.id" class="row">
            <img v-if="item.thumb" class="thumb" :src="item.thumb" alt="" />
            <span v-else class="thumb" />
            <div class="meta">
              <span class="name" :title="item.file.name">{{ item.file.name }}</span>
              <span v-if="item.error" class="error">{{ item.error }}</span>
              <span v-else class="sub">
                {{ item.width }} × {{ item.height }} ·
                {{ t("image.dpiPrintSize", { w: printSizeCm(item.width, dpi), h: printSizeCm(item.height, dpi) }) }}
              </span>
            </div>
            <span v-if="!item.error" class="change">
              {{ originalText(item) }} → <strong>{{ dpi }}</strong> DPI
            </span>
            <button class="icon-btn" :title="t('image.download')" :disabled="!item.bytes" @click="downloadOne(item)"><Download :size="14" /></button>
            <button class="icon-btn" :title="t('image.remove')" @click="remove(item)"><X :size="14" /></button>
          </li>
        </ul>
        <FileDropZone ref="dropZone" compact class="more" accept="image/png,image/jpeg" multiple :title="t('image.addMore')" @files="addFiles" />
      </template>
    </section>
  </div>
</template>

<style scoped>
/* 左侧设置（固定宽），右侧列表 */
.dpi-tool {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  align-items: stretch;
  gap: 14px;
}
.settings {
  align-self: start;
}
.seg.fill button {
  padding: 0 4px;
  font-variant-numeric: tabular-nums;
}
.custom {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-3);
}
.custom .field {
  flex: 1;
  width: 0;
  height: 32px;
  font-size: 13px;
}
.tip {
  line-height: 1.5;
}

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
.drop {
  margin: 12px;
  border-width: 1.5px;
}
.more {
  margin: 0 12px 12px;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 6px;
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
  min-width: 90px;
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
  font-variant-numeric: tabular-nums;
}
.change {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.change strong {
  font-weight: 500;
  color: var(--text);
}
.icon-btn:disabled,
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
