<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { Translation, useI18n } from "vue-i18n";
import { FilePlus2, RotateCcw, RotateCw, Save, Trash2, Undo2, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import ToolActions from "@/components/tool/ToolActions.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { saveFile } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { errorMessage, showError } from "@/utils/errorToast";
import { buildPdf, loadPdf, movePages, parsePageRanges } from "../pdfPages";
import { openPdf, renderPage, type PdfDocument } from "../pdfjs";

/**
 * PDF 页面编辑：删除、旋转、拖动排序，也可以加入其他 PDF 合并成一个。
 * 点击选择页面，Ctrl 多选、Shift 连选；Delete 删除选中的页，Ctrl+Z 撤销。
 */
interface Source {
  name: string;
  size: number;
  data: Uint8Array;
  doc: PdfDocument;
  pageCount: number;
}
interface Page {
  key: number;
  source: number;
  index: number;
  rotation: number;
}

const { t } = useI18n();
const sources = shallowRef<Source[]>([]);
const pages = ref<Page[]>([]);
const selected = ref(new Set<number>());
const history = ref<Page[][]>([]);
const loading = ref(false);
let nextKey = 1;

const thumbSize = useStoredRef<"s" | "m" | "l">("pdfPages.size", "m");
const WIDTHS = { s: 110, m: 150, l: 210 };
const thumbWidth = computed(() => WIDTHS[thumbSize.value]);

// ---------- 打开文件 ----------
const addFiles = async (files: File[]) => {
  loading.value = true;
  try {
    for (const file of files) {
      const data = new Uint8Array(await file.arrayBuffer());
      try {
        await loadPdf(data); // 先确认 pdf-lib 能读取，否则保存时才发现问题
        const doc = await openPdf(data);
        const sourceIndex = sources.value.length;
        sources.value = [...sources.value, { name: file.name, size: file.size, data, doc, pageCount: doc.numPages }];
        const added = Array.from({ length: doc.numPages }, (_, index) => ({ key: nextKey++, source: sourceIndex, index, rotation: 0 }));
        if (pages.value.length) pushHistory();
        pages.value = [...pages.value, ...added];
      } catch (e) {
        showError(`${file.name}：${errorMessage(e)}`);
      }
    }
  } finally {
    loading.value = false;
  }
};

const dropZone = ref<InstanceType<typeof FileDropZone>>();

const reset = () => {
  for (const url of thumbs.value.values()) URL.revokeObjectURL(url);
  thumbs.value = new Map();
  requested.clear();
  sources.value.forEach((s) => s.doc.destroy());
  sources.value = [];
  pages.value = [];
  selected.value = new Set();
  history.value = [];
};
onBeforeUnmount(reset);

// ---------- 缩略图：滚动到可见时才渲染，逐个排队 ----------
const thumbs = shallowRef(new Map<string, string>());
const thumbKey = (p: Page) => `${p.source}:${p.index}`;
let queue = Promise.resolve();
const requested = new Set<string>();

const requestThumb = (p: Page) => {
  const key = thumbKey(p);
  if (requested.has(key)) return;
  requested.add(key);
  const width = Math.max(...Object.values(WIDTHS));
  queue = queue.then(async () => {
    const source = sources.value[p.source];
    if (!source) return;
    try {
      const url = await renderPage(source.doc, p.index, width);
      thumbs.value = new Map(thumbs.value).set(key, url);
    } catch {
      // 渲染失败的页面显示空白，不影响编辑
    }
  });
};

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const page = pages.value.find((p) => p.key === Number((entry.target as HTMLElement).dataset.key));
      if (page) requestThumb(page);
      observer.unobserve(entry.target);
    }
  },
  { rootMargin: "300px" },
);
onBeforeUnmount(() => observer.disconnect());
const observe = (el: unknown) => el instanceof HTMLElement && observer.observe(el);

// ---------- 撤销 ----------
const pushHistory = () => {
  history.value = [...history.value.slice(-49), pages.value.map((p) => ({ ...p }))];
};
const undo = () => {
  const last = history.value[history.value.length - 1];
  if (!last) return;
  history.value = history.value.slice(0, -1);
  pages.value = last;
  selected.value = new Set([...selected.value].filter((k) => last.some((p) => p.key === k)));
};

// ---------- 选择 ----------
let anchor: number | null = null;
const onSelect = (page: Page, e: MouseEvent) => {
  const set = new Set(e.ctrlKey || e.metaKey ? selected.value : []);
  if (e.shiftKey && anchor !== null) {
    const keys = pages.value.map((p) => p.key);
    const [a, b] = [keys.indexOf(anchor), keys.indexOf(page.key)].sort((x, y) => x - y);
    keys.slice(a, b + 1).forEach((k) => set.add(k));
  } else if ((e.ctrlKey || e.metaKey) && set.has(page.key)) {
    set.delete(page.key);
  } else {
    set.add(page.key);
    anchor = page.key;
  }
  selected.value = set;
};
const toggle = (page: Page) => {
  const set = new Set(selected.value);
  if (!set.delete(page.key)) set.add(page.key);
  selected.value = set;
  anchor = page.key;
};
const allSelected = computed(() => pages.value.length > 0 && selected.value.size === pages.value.length);
const selectAll = () => (selected.value = allSelected.value ? new Set() : new Set(pages.value.map((p) => p.key)));

const range = ref("");
const rangeError = ref("");
const selectRange = () => {
  try {
    selected.value = new Set(parsePageRanges(range.value, pages.value.length).map((i) => pages.value[i].key));
    rangeError.value = "";
  } catch (e) {
    rangeError.value = e instanceof Error ? e.message : String(e);
  }
};
watch(range, () => (rangeError.value = ""));

// ---------- 编辑 ----------
const hasSelection = computed(() => selected.value.size > 0);

const removeSelected = () => {
  if (!hasSelection.value) return;
  pushHistory();
  pages.value = pages.value.filter((p) => !selected.value.has(p.key));
  selected.value = new Set();
};
const keepSelected = () => {
  if (!hasSelection.value) return;
  pushHistory();
  pages.value = pages.value.filter((p) => selected.value.has(p.key));
};
const rotate = (deg: number, only?: Page) => {
  const targets = only ? new Set([only.key]) : selected.value;
  if (!targets.size) return;
  pushHistory();
  pages.value = pages.value.map((p) => (targets.has(p.key) ? { ...p, rotation: (p.rotation + deg + 360) % 360 } : p));
};
const removeOne = (page: Page) => {
  pushHistory();
  pages.value = pages.value.filter((p) => p !== page);
  selected.value.delete(page.key);
};

// ---------- 拖动排序 ----------
const dragging = ref<Set<number> | null>(null);
const dropTarget = ref<{ key: number | null; after: boolean } | null>(null);

const onDragStart = (page: Page, e: DragEvent) => {
  dragging.value = selected.value.has(page.key) ? new Set(selected.value) : new Set([page.key]);
  e.dataTransfer!.effectAllowed = "move";
  e.dataTransfer!.setData("text/plain", "");
};
const onDragOver = (page: Page, e: DragEvent) => {
  if (!dragging.value) return;
  e.preventDefault();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  dropTarget.value = { key: page.key, after: e.clientX > rect.left + rect.width / 2 };
};
const onDrop = () => {
  const moving = dragging.value;
  const target = dropTarget.value;
  dragging.value = null;
  dropTarget.value = null;
  if (!moving || !target || moving.has(target.key!)) return;
  const keys = pages.value.map((p) => p.key);
  const at = keys.indexOf(target.key!) + (target.after ? 1 : 0);
  // 落点之后第一个不被移动的页面
  const before = keys.slice(at).find((k) => !moving.has(k)) ?? null;
  const order = movePages(keys, moving, before);
  pushHistory();
  const byKey = new Map(pages.value.map((p) => [p.key, p]));
  pages.value = order.map((k) => byKey.get(k)!);
};
const onDragEnd = () => {
  dragging.value = null;
  dropTarget.value = null;
};

// ---------- 快捷键 ----------
useWindowEvent("keydown", (e) => {
  const target = e.target;
  if (!pages.value.length || (target instanceof Element && target.closest("input, textarea, [contenteditable]"))) return;
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    removeSelected();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
    e.preventDefault();
    selected.value = new Set(pages.value.map((p) => p.key));
  } else if (e.key === "Escape") {
    selected.value = new Set();
  }
});

// ---------- 保存 ----------
const saving = ref(false);
const outputName = computed(() => {
  const first = sources.value[0]?.name.replace(/\.pdf$/i, "") ?? t("document.untitled");
  return `${first}_${sources.value.length > 1 ? t("document.mergedSuffix") : t("document.editedSuffix")}.pdf`;
});
const save = async () => {
  saving.value = true;
  try {
    const data = await buildPdf(
      sources.value.map((s) => s.data),
      pages.value.map(({ source, index, rotation }) => ({ source, index, rotation })),
    );
    await saveFile(data, outputName.value);
  } catch (e) {
    showError(t("document.saveFailed", { error: errorMessage(e) }));
  } finally {
    saving.value = false;
  }
};

const pageLabel = (p: Page) => (sources.value.length > 1 ? t("document.pageOf", { name: sources.value[p.source].name, n: p.index + 1 }) : t("document.originalPage", { n: p.index + 1 }));
const deleted = computed(() => sources.value.reduce((n, s) => n + s.pageCount, 0) - pages.value.length);
</script>

<template>
  <ToolActions>
    <div class="seg" :title="t('document.thumbSize')">
      <button :class="{ on: thumbSize === 's' }" @click="thumbSize = 's'">{{ t("document.small") }}</button>
      <button :class="{ on: thumbSize === 'm' }" @click="thumbSize = 'm'">{{ t("document.medium") }}</button>
      <button :class="{ on: thumbSize === 'l' }" @click="thumbSize = 'l'">{{ t("document.large") }}</button>
    </div>
    <button class="btn" :title="t('document.addPdfTitle')" @click="dropZone?.open()"><FilePlus2 :size="14" />{{ t("document.addPdfBtn") }}</button>
    <button v-if="sources.length" class="btn subtle" @click="reset">{{ t("document.close") }}</button>
    <button class="btn primary" :disabled="saving || !pages.length" @click="save"><Save :size="14" />{{ saving ? t("document.saving") : t("document.savePdf") }}</button>
  </ToolActions>

  <section class="card pdf">
    <div class="bar">
      <label class="check"><input type="checkbox" :checked="allSelected" :disabled="!pages.length" @change="selectAll" />{{ t("document.selectAll") }}</label>
      <form class="range" @submit.prevent="selectRange">
        <input v-model="range" class="field" :class="{ invalid: rangeError }" :placeholder="t('document.rangePlaceholder')" />
        <button class="btn" type="submit" :disabled="!pages.length">{{ t("document.select") }}</button>
      </form>
      <span class="divider" />
      <button class="btn" :disabled="!hasSelection" :title="t('document.rotateLeft90')" @click="rotate(-90)"><RotateCcw :size="14" /></button>
      <button class="btn" :disabled="!hasSelection" :title="t('document.rotateRight90')" @click="rotate(90)"><RotateCw :size="14" /></button>
      <button class="btn danger" :disabled="!hasSelection" title="Delete" @click="removeSelected"><Trash2 :size="14" />{{ t("document.deleteSelected") }}</button>
      <button class="btn" :disabled="!hasSelection" @click="keepSelected">{{ t("document.keepSelected") }}</button>
      <button class="btn subtle" :disabled="!history.length" title="Ctrl + Z" @click="undo"><Undo2 :size="14" />{{ t("document.undo") }}</button>
      <span class="status">
        <Translation keypath="document.pagesTotal"><template #n><b>{{ pages.length }}</b></template></Translation>
        <Translation v-if="selected.size" keypath="document.pagesSelected"><template #n><b>{{ selected.size }}</b></template></Translation>
        <template v-if="deleted > 0">{{ t("document.pagesDeleted", { n: deleted }) }}</template>
      </span>
    </div>
    <p v-if="rangeError" class="error">{{ rangeError }}</p>

    <!-- 加载后隐藏但保留：「添加 PDF」和 Ctrl+V 粘贴仍由它处理 -->
    <FileDropZone
      v-show="!sources.length"
      ref="dropZone"
      class="drop"
      accept=".pdf,application/pdf"
      multiple
      :title="loading ? t('document.reading') : t('document.dropPdf')"
      :hint="t('document.dropPdfHint')"
      @files="addFiles"
    />
    <div v-if="sources.length" class="grid" :style="{ '--thumb': `${thumbWidth}px` }" @dragover.prevent @drop="onDrop">
      <figure
        v-for="(page, i) in pages"
        :key="page.key"
        :ref="observe"
        :data-key="page.key"
        class="page"
        :class="{
          on: selected.has(page.key),
          ghost: dragging?.has(page.key),
          'drop-before': dropTarget?.key === page.key && !dropTarget.after,
          'drop-after': dropTarget?.key === page.key && dropTarget.after,
        }"
        draggable="true"
        @click="onSelect(page, $event)"
        @dragstart="onDragStart(page, $event)"
        @dragover="onDragOver(page, $event)"
        @dragend="onDragEnd"
      >
        <div class="sheet">
          <img
            v-if="thumbs.get(thumbKey(page))"
            :src="thumbs.get(thumbKey(page))"
            alt=""
            draggable="false"
            :style="{ transform: `rotate(${page.rotation}deg)` }"
            :class="{ sideways: page.rotation % 180 }"
          />
          <span v-else class="placeholder">{{ page.index + 1 }}</span>
          <input type="checkbox" class="pick" :checked="selected.has(page.key)" @click.stop="toggle(page)" />
          <div class="hover-actions" @click.stop>
            <button :title="t('document.rotateLeft')" @click="rotate(-90, page)"><RotateCcw :size="13" /></button>
            <button :title="t('document.rotateRight')" @click="rotate(90, page)"><RotateCw :size="13" /></button>
            <button :title="t('document.deletePage')" @click="removeOne(page)"><X :size="13" /></button>
          </div>
        </div>
        <figcaption>
          <b>{{ i + 1 }}</b>
          <span v-if="page.index !== i || sources.length > 1 || page.rotation" :title="pageLabel(page)">{{ pageLabel(page) }}</span>
        </figcaption>
      </figure>
    </div>

    <footer v-if="sources.length" class="files">
      <span v-for="s in sources" :key="s.name">{{ t("document.sourceInfo", { name: s.name, n: s.pageCount, size: formatBytes(s.size) }) }}</span>
      <span class="hint">{{ t("document.pagesHint") }}</span>
    </footer>
  </section>
</template>

<style scoped>
.pdf {
  flex: 1;
  min-height: 0;
}
.bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
}
.bar .btn {
  height: 30px;
  padding: 0 10px;
}
.btn.danger:not(:disabled) {
  color: var(--danger);
}
.range {
  display: flex;
  gap: 6px;
}
.range .field {
  width: 170px;
  height: 30px;
  font-size: 13px;
}
.divider {
  width: 1px;
  height: 20px;
  margin: 0 2px;
  background: var(--border-strong);
}
.status {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-2);
}
.status b {
  color: var(--text);
}
.error {
  padding: 8px 14px;
  font-size: 12.5px;
  background: var(--danger-soft);
}
.drop {
  flex: 1;
  margin: 14px;
}

.grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--thumb), 1fr));
  gap: 18px 14px;
  align-content: start;
  padding: 16px;
}
.page {
  position: relative;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}
.sheet {
  position: relative;
  width: var(--thumb);
  aspect-ratio: 1 / 1.414;
  display: grid;
  place-items: center;
  border-radius: 6px;
  outline: 2px solid transparent;
  outline-offset: 3px;
  transition: outline-color 0.12s;
}
.sheet img {
  max-width: 100%;
  max-height: 100%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  transition: transform 0.2s;
}
/* 旋转 90° 后宽高互换，缩小一些以免超出 */
.sheet img.sideways {
  max-width: 70.7%;
  max-height: 141.4%;
}
.placeholder {
  width: 86%;
  height: 100%;
  display: grid;
  place-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-3);
  font-size: 13px;
}
.page:hover .sheet {
  outline-color: var(--border-strong);
}
.page.on .sheet {
  outline-color: var(--accent);
  background: var(--accent-soft);
}
.page.ghost {
  opacity: 0.4;
}
.page.drop-before::before,
.page.drop-after::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 22px;
  width: 3px;
  border-radius: 2px;
  background: var(--accent);
}
.page.drop-before::before {
  left: -9px;
}
.page.drop-after::after {
  right: -9px;
}
.pick {
  position: absolute;
  left: 6px;
  top: 6px;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
  opacity: 0;
  cursor: pointer;
}
.page:hover .pick,
.page.on .pick {
  opacity: 1;
}
.hover-actions {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: rgba(20, 20, 19, 0.72);
  opacity: 0;
  transition: opacity 0.12s;
}
.page:hover .hover-actions {
  opacity: 1;
}
.hover-actions button {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 4px;
  background: none;
  color: #fff;
}
.hover-actions button:hover {
  background: rgba(255, 255, 255, 0.18);
}
figcaption {
  display: flex;
  align-items: baseline;
  gap: 6px;
  max-width: var(--thumb);
  font-size: 12px;
  color: var(--text-3);
}
figcaption b {
  font-weight: 600;
  color: var(--text);
}
figcaption span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.page.on figcaption b {
  color: var(--accent);
}
.files {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-3);
}
.files .hint {
  margin-left: auto;
}
</style>
