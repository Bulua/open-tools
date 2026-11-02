<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { ChevronLeft, ChevronRight, Download, FileText, Image as ImageIcon, Layers, Shapes, Stamp, X } from "lucide-vue-next";
import CheckAll from "@/components/common/CheckAll.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFileChecks } from "@/composables/useFileChecks";
import { saveFiles } from "@/utils/saveFile";
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
const exportError = ref("");
const exportAll = async () => {
  exporting.value = true;
  exportError.value = "";
  try {
    const files = [];
    for (const i of ready.value) files.push({ name: unwatermarkedPdfName(i.file.name), data: await removePdfWatermarks(i.data, i.scan!, i.checked) });
    await saveFiles(files, "PDF 去水印.zip");
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : String(e);
  } finally {
    exporting.value = false;
  }
};

const ICONS = { text: null, image: ImageIcon, shape: Shapes, marked: Stamp, annot: Stamp, layer: Layers };
const summary = (item: Item) => {
  if (item.error) return "无法读取";
  const n = item.scan?.found.length ?? 0;
  return n ? `${item.checked.length} / ${n} 项` : "没有水印";
};
const pagesText = (f: FoundPdfWatermark) => (f.pages.length > 3 ? `第 ${f.pages[0] + 1} 页等 ${f.pages.length} 页` : `第 ${f.pages.map((p) => p + 1).join("、")} 页`);
</script>

<template>
  <div class="unwatermark">
    <aside class="card panel">
      <section class="section">
        <h3>
          <CheckAll v-if="items.length" :checked="allChecked" :partly="partlyChecked" :disabled="exporting" @toggle="toggleAll">文件</CheckAll>
          <template v-else>文件</template>
          <span class="push">{{ items.length > 1 ? `已选 ${checkedItems.length} / ${items.length} 个` : `${items.length} 个` }}</span>
        </h3>
        <ul class="files">
          <li v-for="item in items" :key="item.id" :class="{ on: item.id === selected?.id, unchecked: !isChecked(item) }" @click="selectedId = item.id">
            <input type="checkbox" class="file-check" title="勾选的文件才处理" :checked="isChecked(item)" :disabled="exporting" @click.stop @change="toggleFile(item)" />
            <FileText :size="14" class="icon" />
            <span class="name" :title="item.file.name">{{ item.file.name }}</span>
            <span class="size" :class="{ bad: item.error }">{{ summary(item) }}</span>
            <button class="icon-btn remove" title="移除" @click.stop="remove(item)"><X :size="13" /></button>
          </li>
        </ul>
        <p v-if="scanning" class="tip">正在查找水印…</p>
        <FileDropZone compact accept=".pdf" multiple :paste="false" title="继续添加 PDF" @files="addFiles" />
      </section>

      <section v-if="selected" class="section">
        <h3>找到的水印<span class="push">勾选的会被删除</span></h3>
        <p v-if="selected.error" class="error">{{ selected.error }}</p>
        <p v-else-if="!selected.scan?.found.length" class="note">
          没有找到水印。如果页面上看得到水印，它可能和内容合成在同一张图片里（例如扫描件），这种无法去除。
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
                {{ f.label }}<template v-if="f.text">「{{ f.text.length > 16 ? f.text.slice(0, 16) + "…" : f.text }}」</template>
              </span>
              <span class="reason" :class="{ unsure: !f.sure }">{{ f.reason }}</span>
              <button class="link" @click.stop="goto(f.pages[0])">{{ pagesText(f) }}</button>
            </span>
          </li>
        </ul>
      </section>

      <section class="section">
        <button class="btn primary full" :disabled="!ready.length || exporting" @click="exportAll">
          <Download :size="14" />{{ exporting ? "正在处理…" : !checkedItems.length && items.length ? "请勾选要处理的文件" : ready.length > 1 ? `去除并下载选中的 ${ready.length} 个` : "去除水印并下载" }}
        </button>
        <p v-if="exportError" class="error">{{ exportError }}</p>
        <p class="tip">只删除勾选的水印，正文仍可选择、复制。请只处理自己的文件或有权修改的文件。</p>
      </section>
    </aside>

    <section class="card stage">
      <div class="card-title">
        预览
        <div v-if="selected?.scan" class="seg">
          <button :class="{ on: mode === 'before' }" @click="mode = 'before'">原文件</button>
          <button :class="{ on: mode === 'after' }" @click="mode = 'after'">去除后</button>
        </div>
        <span v-if="busy && mode === 'after'" class="hint">正在更新…</span>
        <div v-if="pageCount" class="pager">
          <button class="icon-btn" title="上一页" :disabled="pageIndex <= 0" @click="goto(pageIndex - 1)"><ChevronLeft :size="15" /></button>
          <span>{{ pageIndex + 1 }} / {{ pageCount }}</span>
          <button class="icon-btn" title="下一页" :disabled="pageIndex >= pageCount - 1" @click="goto(pageIndex + 1)"><ChevronRight :size="15" /></button>
        </div>
      </div>
      <FileDropZone
        v-if="!items.length"
        class="drop"
        accept=".pdf"
        multiple
        title="拖入 PDF，或点击选择（可多选）"
        hint="自动找出 Acrobat、WPS 等工具添加的水印，以及斜着、半透明、每页重复的文字和图片水印"
        :paste="false"
        @files="addFiles"
      />
      <div v-else ref="viewer" class="viewer">
        <p v-if="previewError" class="state">{{ previewError }}</p>
        <img v-else-if="imageUrl && selected?.scan" :src="imageUrl" alt="" class="page" />
        <p v-else-if="selected?.error" class="state">无法预览</p>
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
