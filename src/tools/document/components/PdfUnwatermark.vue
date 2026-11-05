<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronLeft, ChevronRight, Download, FileText, Image as ImageIcon, Layers, Shapes, Stamp, X } from "lucide-vue-next";
import CheckAll from "@/components/common/CheckAll.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFileChecks } from "@/composables/useFileChecks";
import { saveFiles } from "@/utils/saveFile";
import { showError } from "@/utils/errorToast";
import { openPdf, renderPage, type PdfDocument } from "../pdfjs";
import { removePdfWatermarks, scanPdf, unwatermarkedPdfName, type FoundPdfWatermark, type PdfScan } from "../pdfUnwatermark";

/**
 * PDF 去水印：自动找出 PDF 里的水印，确定是水印的默认勾选，按特征判断的列出来由用户决定。
 * 右侧可以对比原文件和去除后的页面；多个文件各自按勾选处理，一起下载。
 */
interface Item {
  id: number;
  file: File;
  data: Uint8Array;
  scan?: PdfScan;
  error?: string;
  checked: string[];
}
const { t } = useI18n();
const items = ref<Item[]>([]);
const selectedId = ref<number | null>(null);
let nextId = 1;
const selected = computed(() => items.value.find((i) => i.id === selectedId.value) ?? null);
const { isChecked, toggle: toggleFile, checkedItems, allChecked, partlyChecked, toggleAll } = useFileChecks(items);
const scanning = ref(false);

const addFiles = async (files: File[]) => {
  scanning.value = true;
  try {
    for (const file of files) {
      if (!/\.pdf$/i.test(file.name)) continue;
      const item: Item = { id: nextId++, file, data: markRaw(new Uint8Array(await file.arrayBuffer())), checked: [] };
      try {
        item.scan = markRaw(await scanPdf(item.data));
        item.checked = item.scan.found.filter((f) => f.checked).map((f) => f.key);
      } catch (e) {
        item.error = e instanceof Error ? e.message : String(e);
      }
      items.value = [...items.value, item];
      if (!selectedId.value) selectedId.value = item.id;
    }
  } finally {
    scanning.value = false;
  }
};
const remove = (item: Item) => {
  items.value = items.value.filter((i) => i !== item);
  if (selectedId.value === item.id) selectedId.value = items.value[0]?.id ?? null;
};
const toggle = (item: Item, f: FoundPdfWatermark) => {
  item.checked = item.checked.includes(f.key) ? item.checked.filter((k) => k !== f.key) : [...item.checked, f.key];
};

// ---------- 预览：原文件 / 去除后 ----------
const mode = ref<"after" | "before">("after");
const pageIndex = ref(0);
const pageCount = computed(() => selected.value?.scan?.pageCount ?? 0);
const original = shallowRef<PdfDocument | null>(null);
const result = shallowRef<PdfDocument | null>(null);
const imageUrl = ref("");
const previewError = ref("");
const busy = ref(false);
const viewer = ref<HTMLDivElement>();

const replaceDoc = (target: typeof original, doc: PdfDocument | null) => {
  target.value?.destroy();
  target.value = doc;
};

// 换文件时打开原文件
watch(
  () => selected.value?.id,
  async () => {
    pageIndex.value = 0;
    const item = selected.value;
    replaceDoc(original, item?.scan ? await openPdf(item.data) : null);
  },
);

// 勾选变化后重新生成去除后的 PDF（连续勾选时稍等一下）
let timer: ReturnType<typeof setTimeout> | undefined;
let token = 0;
watch(
  () => [selected.value?.id, selected.value?.checked],
  () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const item = selected.value;
      const current = ++token;
      if (!item?.scan) return replaceDoc(result, null);
      busy.value = true;
      try {
        const data = await removePdfWatermarks(item.data, item.scan, item.checked);
        const doc = await openPdf(data);
        if (current === token) replaceDoc(result, doc);
        else doc.destroy();
        previewError.value = "";
      } catch (e) {
        if (current === token) previewError.value = e instanceof Error ? e.message : String(e);
      } finally {
        if (current === token) busy.value = false;
      }
    }, 250);
  },
);

// 显示当前页
let renderToken = 0;
watch([original, result, mode, pageIndex], async () => {
  const doc = mode.value === "before" ? original.value : result.value;
  const current = ++renderToken;
  if (!doc || pageIndex.value >= doc.numPages) return;
  const width = Math.min(1000, (viewer.value?.clientWidth ?? 700) - 40);
  const url = await renderPage(doc, pageIndex.value, Math.max(300, width)).catch(() => "");
  if (current !== renderToken) return URL.revokeObjectURL(url);
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
  imageUrl.value = url;
});
onBeforeUnmount(() => {
  original.value?.destroy();
  result.value?.destroy();
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
});

const goto = (i: number) => (pageIndex.value = Math.max(0, Math.min(pageCount.value - 1, i)));

// ---------- 导出 ----------
const ready = computed(() => checkedItems.value.filter((i) => i.scan));
const exporting = ref(false);
const exportAll = async () => {
  exporting.value = true;
  try {
    const files = [];
    for (const i of ready.value) files.push({ name: unwatermarkedPdfName(i.file.name), data: await removePdfWatermarks(i.data, i.scan!, i.checked) });
    await saveFiles(files, t("document.pdfUnwmZip"));
  } catch (e) {
    showError(e);
  } finally {
    exporting.value = false;
  }
};

const ICONS = { text: null, image: ImageIcon, shape: Shapes, marked: Stamp, annot: Stamp, layer: Layers };
const summary = (item: Item) => {
  if (item.error) return t("document.cantRead");
  const n = item.scan?.found.length ?? 0;
  return n ? t("document.foundCount", { n: item.checked.length, total: n }) : t("document.noWatermark");
};
const pagesText = (f: FoundPdfWatermark) =>
  f.pages.length > 3 ? t("document.pagesMany", { first: f.pages[0] + 1, n: f.pages.length }) : t("document.pagesList", { list: f.pages.map((p) => p + 1).join(t("document.listSep")) });
</script>

<template>
  <div class="unwatermark">
    <aside class="card panel">
      <section class="section">
        <h3>
          <CheckAll v-if="items.length" :checked="allChecked" :partly="partlyChecked" :disabled="exporting" @toggle="toggleAll">{{ t("document.files") }}</CheckAll>
          <template v-else>{{ t("document.files") }}</template>
          <span class="push">{{ items.length > 1 ? t("files.selected", { checked: checkedItems.length, total: items.length }) : t("files.count", { n: items.length }) }}</span>
        </h3>
        <ul class="files">
          <li v-for="item in items" :key="item.id" :class="{ on: item.id === selected?.id, unchecked: !isChecked(item) }" @click="selectedId = item.id">
            <input type="checkbox" class="file-check" :title="t('document.checkFiles')" :checked="isChecked(item)" :disabled="exporting" @click.stop @change="toggleFile(item)" />
            <FileText :size="14" class="icon" />
            <span class="name" :title="item.file.name">{{ item.file.name }}</span>
            <span class="size" :class="{ bad: item.error }">{{ summary(item) }}</span>
            <button class="icon-btn remove" :title="t('document.remove')" @click.stop="remove(item)"><X :size="13" /></button>
          </li>
        </ul>
        <p v-if="scanning" class="tip">{{ t("document.findingWatermarks") }}</p>
        <FileDropZone compact accept=".pdf" multiple :paste="false" :title="t('document.addPdf')" @files="addFiles" />
      </section>

      <section v-if="selected" class="section">
        <h3>{{ t("document.foundTitle") }}<span class="push">{{ t("document.checkedRemoved") }}</span></h3>
        <p v-if="selected.error" class="error">{{ selected.error }}</p>
        <p v-else-if="!selected.scan?.found.length" class="note">
          {{ t("document.pdfNoWatermark") }}
        </p>
        <ul v-else class="found">
          <li v-for="f in selected.scan.found" :key="f.key" :class="{ off: !selected.checked.includes(f.key) }" @click="toggle(selected, f)">
            <input type="checkbox" :checked="selected.checked.includes(f.key)" @click.stop="toggle(selected, f)" />
            <span class="thumb">
              <component :is="ICONS[f.kind]" v-if="ICONS[f.kind]" :size="16" />
              <span v-else class="letter">{{ f.text?.slice(0, 1) || "T" }}</span>
            </span>
            <span class="info">
              <span class="title">
                {{ f.label }}<template v-if="f.text">{{ t("document.quoted", { text: f.text.length > 16 ? f.text.slice(0, 16) + "…" : f.text }) }}</template>
              </span>
              <span class="reason" :class="{ unsure: !f.sure }">{{ f.reason }}</span>
              <button class="link" @click.stop="goto(f.pages[0])">{{ pagesText(f) }}</button>
            </span>
          </li>
        </ul>
      </section>

      <section class="section">
        <button class="btn primary full" :disabled="!ready.length || exporting" @click="exportAll">
          <Download :size="14" />{{ exporting ? t("document.processing") : !checkedItems.length && items.length ? t("document.checkToProcess") : ready.length > 1 ? t("document.removeSelected", { n: ready.length }) : t("document.removeOne") }}
        </button>
        <p class="tip">{{ t("document.pdfUnwmTip") }}</p>
      </section>
    </aside>

    <section class="card stage">
      <div class="card-title">
        {{ t("document.preview") }}
        <div v-if="selected?.scan" class="seg">
          <button :class="{ on: mode === 'before' }" @click="mode = 'before'">{{ t("document.before") }}</button>
          <button :class="{ on: mode === 'after' }" @click="mode = 'after'">{{ t("document.after") }}</button>
        </div>
        <span v-if="busy && mode === 'after'" class="hint">{{ t("document.updating") }}</span>
        <div v-if="pageCount" class="pager">
          <button class="icon-btn" :title="t('document.prevPage')" :disabled="pageIndex <= 0" @click="goto(pageIndex - 1)"><ChevronLeft :size="15" /></button>
          <span>{{ pageIndex + 1 }} / {{ pageCount }}</span>
          <button class="icon-btn" :title="t('document.nextPage')" :disabled="pageIndex >= pageCount - 1" @click="goto(pageIndex + 1)"><ChevronRight :size="15" /></button>
        </div>
      </div>
      <FileDropZone
        v-if="!items.length"
        class="drop"
        accept=".pdf"
        multiple
        :title="t('document.dropPdfs')"
        :hint="t('document.pdfUnwmHint')"
        :paste="false"
        @files="addFiles"
      />
      <div v-else ref="viewer" class="viewer">
        <p v-if="previewError" class="state">{{ previewError }}</p>
        <img v-else-if="imageUrl && selected?.scan" :src="imageUrl" alt="" class="page" />
        <p v-else-if="selected?.error" class="state">{{ t("document.cantPreview") }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.drop {
  flex: 1;
  margin: 12px;
}
.unwatermark {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.stage {
  flex: 1;
  min-width: 0;
}
.card-title {
  gap: 10px;
}
.card-title .hint {
  font-weight: 400;
  font-size: 12px;
  color: var(--text-3);
}
.pager {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 400;
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.pager .icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.viewer {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
  background: var(--bg-sunken);
  text-align: center;
}
.page {
  max-width: 100%;
  box-shadow: var(--shadow);
  background: #fff;
}
.state {
  margin: 80px 0 0;
  font-size: 13px;
  color: var(--text-3);
}
.panel {
  flex: 0 0 320px;
  align-self: flex-start;
  max-height: 100%;
  overflow: auto;
}
h3 {
  display: flex;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.push {
  margin-left: auto;
  font-weight: 400;
  color: var(--text-3);
}
.files,
.found {
  margin: 0;
  padding: 0;
  list-style: none;
}
.files {
  max-height: 220px;
  overflow: auto;
}
.files li {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 4px 0 8px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}
.files li:hover {
  background: var(--hover);
}
.files li.on {
  background: var(--accent-soft);
}
.icon {
  flex-shrink: 0;
  color: var(--text-3);
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.size {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-3);
}
.bad {
  color: var(--danger);
}
.remove {
  opacity: 0;
}
.files li:hover .remove {
  opacity: 1;
}
.found {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.found li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
}
.found li:hover {
  background: var(--hover);
}
.found li.off .thumb,
.found li.off .title {
  opacity: 0.55;
}
.found input {
  flex-shrink: 0;
  margin: 0;
  accent-color: var(--accent);
}
.thumb {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--bg-sunken);
  color: var(--text-3);
}
.letter {
  font-size: 16px;
  color: var(--text-2);
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.title {
  max-width: 100%;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reason {
  font-size: 11.5px;
  color: var(--text-3);
}
.reason.unsure {
  color: var(--warning);
}
.link {
  padding: 0;
  border: none;
  background: none;
  font-size: 11.5px;
  color: var(--accent);
  cursor: pointer;
}
.link:hover {
  text-decoration: underline;
}
.note {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-sunken);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
}
.tip {
  line-height: 1.6;
}
.error {
  word-break: break-all;
}
.btn {
  justify-content: center;
}
</style>
