<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CornerUpLeft,
  Download,
  FileCode2,
  FileJson,
  FileText,
  Globe,
  Image as ImageIcon,
  LoaderCircle,
  X,
} from "lucide-vue-next";
import MarkdownView from "@/components/common/MarkdownView.vue";
import { useClipboard } from "@/composables/useClipboard";
import { showError } from "@/utils/errorToast";
import { saveFile } from "@/utils/saveFile";
import {
  decodeImagePreviewBytes,
  readLocalImageForPreview,
  resolveConversationWorkspaceDir,
  type LocalImagePreview,
} from "../builtinTools";
import { parseFileLinkHref, type ParsedFileLink } from "../markdown";
import {
  formatFileSize,
  highlightOutputCode,
  sanitizeSvgPreview,
  type AiOutputFile,
} from "../outputs";

const OUTPUTS_WIDTH_KEY = "open-tools:ai:outputs-width";
const LIST_DEFAULT_WIDTH = 280;
const VIEWER_DEFAULT_WIDTH = 480;
const MIN_PANEL_WIDTH = 260;
const MAX_PANEL_WIDTH = 760;

const props = defineProps<{
  files: AiOutputFile[];
  selectedId: string;
  externalFile?: AiOutputFile | null;
  highlightLines?: { start: number; end?: number } | null;
  conversationId?: string;
  workspaceDir?: string;
}>();

const emit = defineEmits<{
  select: [fileId: string];
  openFile: [ref: ParsedFileLink];
  jumpToMessage: [messageId: string];
  widthChange: [width: number];
  resizingChange: [resizing: boolean];
  close: [];
}>();

const { t } = useI18n();
const { copy } = useClipboard();

const viewMode = ref<"preview" | "code">("code");
const copied = ref(false);
const saved = ref(false);
let copiedTimer = 0;
let savedTimer = 0;

// ---------- 宽度调节（左侧隐藏式拖柄，悬停显现） ----------
function clampPanelWidth(raw: number): number {
  const viewportCap = typeof window !== "undefined" && window.innerWidth > 0
    ? Math.max(MIN_PANEL_WIDTH, Math.round(window.innerWidth * 0.56))
    : MAX_PANEL_WIDTH;
  const maxWidth = Math.min(MAX_PANEL_WIDTH, viewportCap);
  return Math.round(Math.min(maxWidth, Math.max(MIN_PANEL_WIDTH, raw)));
}

function loadCustomViewerWidth(): number | null {
  try {
    const raw = Number(localStorage.getItem(OUTPUTS_WIDTH_KEY));
    if (Number.isFinite(raw) && raw >= MIN_PANEL_WIDTH) {
      return clampPanelWidth(raw);
    }
  } catch {
    // 忽略存储读取异常
  }
  return null;
}

function saveCustomViewerWidth(width: number | null) {
  try {
    if (width === null) localStorage.removeItem(OUTPUTS_WIDTH_KEY);
    else localStorage.setItem(OUTPUTS_WIDTH_KEY, String(width));
  } catch {
    // 忽略存储写入异常
  }
}

const customViewerWidth = ref<number | null>(loadCustomViewerWidth());
const resizing = ref(false);
let resizeState: { startX: number; startWidth: number } | null = null;

const selectedFile = computed<AiOutputFile | null>(() => {
  if (props.externalFile) return props.externalFile;
  if (!props.selectedId) return null;
  return props.files.find((item) => item.id === props.selectedId) ?? null;
});

const panelWidth = computed<number>(() => {
  if (!selectedFile.value) return clampPanelWidth(LIST_DEFAULT_WIDTH);
  return clampPanelWidth(customViewerWidth.value ?? VIEWER_DEFAULT_WIDTH);
});

watch(
  panelWidth,
  (width) => {
    emit("widthChange", width);
  },
  { immediate: true },
);

watch(resizing, (value) => {
  emit("resizingChange", value);
});

const canPreview = computed(() =>
  Boolean(
    selectedFile.value &&
      selectedFile.value.previewKind !== "code" &&
      selectedFile.value.previewKind !== "image",
  ),
);

const loadedImage = ref<LocalImagePreview | null>(null);
const imageLoading = ref(false);
const imageError = ref("");
let imageLoadSeq = 0;

const activeImagePreview = computed<LocalImagePreview | null>(() => {
  const file = selectedFile.value;
  if (!file || file.previewKind !== "image") return null;
  return file.imagePreview ?? loadedImage.value;
});

watch(
  [selectedFile, () => props.workspaceDir],
  ([file]) => {
    const seq = ++imageLoadSeq;
    loadedImage.value = null;
    imageError.value = "";
    imageLoading.value = false;
    if (!file || file.previewKind !== "image") return;
    if (file.imagePreview) {
      loadedImage.value = file.imagePreview;
      return;
    }
    imageLoading.value = true;
    void (async () => {
      try {
        const wsDir = await resolveConversationWorkspaceDir(props.conversationId || "draft", props.workspaceDir);
        const preview = await readLocalImageForPreview(wsDir, file.filePath);
        if (seq !== imageLoadSeq) return;
        loadedImage.value = preview;
      } catch (error) {
        if (seq !== imageLoadSeq) return;
        imageError.value = error instanceof Error ? error.message : String(error);
      } finally {
        if (seq === imageLoadSeq) imageLoading.value = false;
      }
    })();
  },
  { immediate: true },
);

const codeViewerRef = ref<HTMLElement>();

function isHighlightedLine(lineNo: number): boolean {
  const range = props.highlightLines;
  if (!range || !range.start) return false;
  const end = range.end && range.end >= range.start ? range.end : range.start;
  return lineNo >= range.start && lineNo <= end;
}

function scrollToHighlightedLine() {
  const target = props.highlightLines?.start;
  const container = codeViewerRef.value;
  if (!target || !container) return;
  const lineEl = container.querySelector<HTMLElement>(`[data-line="${target}"]`);
  if (!lineEl) return;
  const offset = Math.max(0, lineEl.offsetTop - 72);
  if (typeof container.scrollTo === "function") {
    container.scrollTo({ top: offset, behavior: "smooth" });
  } else {
    container.scrollTop = offset;
  }
}

watch(
  [selectedFile, () => props.highlightLines?.start, () => props.highlightLines?.end],
  ([file, start], [prev]) => {
    if (!file) return;
    if (file.id !== prev?.id) {
      viewMode.value = start || file.previewKind === "code" ? "code" : "preview";
      copied.value = false;
      saved.value = false;
    } else if (start) {
      viewMode.value = "code";
    }
    if (start) {
      nextTick(scrollToHighlightedLine);
    }
  },
  { immediate: true },
);

function iconForFile(file: AiOutputFile) {
  if (file.previewKind === "html") return Globe;
  if (file.previewKind === "svg" || file.previewKind === "image") return ImageIcon;
  if (file.ext === "json" || file.ext === "jsonc" || file.ext === "json5") return FileJson;
  if (file.ext === "md" || file.ext === "markdown" || file.ext === "txt") return FileText;
  return FileCode2;
}

const breadcrumbRef = ref<HTMLElement>();
const breadcrumbOverflowLeft = ref(false);

const breadcrumbSegments = computed<string[]>(() => {
  const file = selectedFile.value;
  if (!file) return [];
  return file.filePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
});

function syncBreadcrumbScroll(scrollToEnd = false) {
  const el = breadcrumbRef.value;
  if (!el) {
    breadcrumbOverflowLeft.value = false;
    return;
  }
  if (scrollToEnd) {
    el.scrollLeft = el.scrollWidth;
  }
  breadcrumbOverflowLeft.value = el.scrollLeft > 2;
}

watch(
  [() => selectedFile.value?.id, panelWidth],
  () => {
    nextTick(() => syncBreadcrumbScroll(true));
  },
  { immediate: true },
);

const subtitleText = computed(() => {
  const file = selectedFile.value;
  if (!file) return "";
  if (file.previewKind === "image") {
    const img = activeImagePreview.value;
    const dims = img?.width && img?.height ? `${img.width} × ${img.height}` : "";
    const bytes = img?.sizeBytes ?? file.sizeBytes;
    return [dims, bytes > 0 ? formatFileSize(bytes) : ""].filter(Boolean).join(" · ");
  }
  return [t("ai.outputs.linesCount", { n: file.lineCount }), formatFileSize(file.sizeBytes)].join(" · ");
});

const highlightedCode = computed(() =>
  selectedFile.value ? highlightOutputCode(selectedFile.value.content, selectedFile.value.language) : "",
);

const lineNumbers = computed(() =>
  selectedFile.value ? Array.from({ length: Math.max(1, selectedFile.value.lineCount) }, (_, i) => i + 1) : [],
);

const sanitizedSvg = computed(() =>
  selectedFile.value?.previewKind === "svg" ? sanitizeSvgPreview(selectedFile.value.content) : "",
);

function onMarkdownLink(href: string) {
  const parsed = parseFileLinkHref(href);
  if (parsed) emit("openFile", parsed);
}

function onResizePointerDown(event: PointerEvent) {
  if (event.button !== 0 || !selectedFile.value) return;
  event.preventDefault();
  resizeState = { startX: event.clientX, startWidth: panelWidth.value };
  resizing.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", onResizePointerMove);
  window.addEventListener("pointerup", onResizePointerEnd);
  window.addEventListener("pointercancel", onResizePointerEnd);
}

function onResizePointerMove(event: PointerEvent) {
  if (!resizeState) return;
  const delta = resizeState.startX - event.clientX;
  customViewerWidth.value = clampPanelWidth(resizeState.startWidth + delta);
}

function cleanupResize() {
  window.removeEventListener("pointermove", onResizePointerMove);
  window.removeEventListener("pointerup", onResizePointerEnd);
  window.removeEventListener("pointercancel", onResizePointerEnd);
  if (resizing.value) {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
  resizing.value = false;
  resizeState = null;
}

function onResizePointerEnd() {
  const shouldSave = Boolean(resizeState);
  cleanupResize();
  if (shouldSave && customViewerWidth.value !== null) {
    saveCustomViewerWidth(customViewerWidth.value);
  }
}

function resetPanelWidth() {
  customViewerWidth.value = null;
  saveCustomViewerWidth(null);
}

function onResizeKeydown(event: KeyboardEvent) {
  if (!selectedFile.value) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    customViewerWidth.value = clampPanelWidth(panelWidth.value + 16);
    saveCustomViewerWidth(customViewerWidth.value);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    customViewerWidth.value = clampPanelWidth(panelWidth.value - 16);
    saveCustomViewerWidth(customViewerWidth.value);
  } else if (event.key === "Home") {
    event.preventDefault();
    resetPanelWidth();
  }
}

async function copyFileContent() {
  if (!selectedFile.value) return;
  const text = selectedFile.value.previewKind === "image" ? selectedFile.value.filePath : selectedFile.value.content;
  await copy(text);
  copied.value = true;
  window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    copied.value = false;
  }, 1500);
}

async function downloadOutputFile() {
  if (!selectedFile.value) return;
  try {
    let bytes: Uint8Array;
    if (selectedFile.value.previewKind === "image") {
      let preview = activeImagePreview.value;
      if (!preview) {
        const wsDir = await resolveConversationWorkspaceDir(props.conversationId || "draft", props.workspaceDir);
        preview = await readLocalImageForPreview(wsDir, selectedFile.value.filePath);
        loadedImage.value = preview;
      }
      bytes = decodeImagePreviewBytes(preview);
    } else {
      bytes = new TextEncoder().encode(selectedFile.value.content);
    }
    const ok = await saveFile(bytes, selectedFile.value.fileName);
    if (ok) {
      saved.value = true;
      window.clearTimeout(savedTimer);
      savedTimer = window.setTimeout(() => {
        saved.value = false;
      }, 1600);
    }
  } catch (error) {
    showError(error);
  }
}

onBeforeUnmount(() => {
  cleanupResize();
  window.clearTimeout(copiedTimer);
  window.clearTimeout(savedTimer);
});
</script>

<template>
  <aside
    class="outputs-pane"
    :class="{ 'is-resizing': resizing, 'is-viewing': Boolean(selectedFile) }"
    :style="{ '--drawer-w': `${panelWidth}px` }"
  >
    <div
      v-if="selectedFile"
      class="outputs-resizer"
      :class="{ active: resizing }"
      role="separator"
      aria-orientation="vertical"
      :aria-label="t('ai.outputs.resizePanel')"
      :aria-valuenow="panelWidth"
      :aria-valuemin="MIN_PANEL_WIDTH"
      :aria-valuemax="MAX_PANEL_WIDTH"
      tabindex="0"
      :title="t('ai.outputs.resizePanel')"
      @pointerdown="onResizePointerDown"
      @dblclick="resetPanelWidth"
      @keydown="onResizeKeydown"
    />

    <!-- 单文件查看模式 -->
    <div v-if="selectedFile" :key="`view:${selectedFile.id}`" class="viewer-card viewer-stage">
      <header class="viewer-header">
        <div class="viewer-title-group">
          <button
            type="button"
            class="icon-btn"
            :title="t('ai.outputs.backToList')"
            :aria-label="t('ai.outputs.backToList')"
            @click="emit('select', '')"
          >
            <ChevronLeft :size="16" />
          </button>
          <span class="viewer-file-badge">
            <component :is="iconForFile(selectedFile)" :size="15" />
          </span>
          <div class="viewer-title-meta">
            <span class="viewer-file-name" :title="selectedFile.filePath">{{ selectedFile.fileName }}</span>
            <span class="viewer-file-sub" :title="selectedFile.filePath">{{ subtitleText }}</span>
          </div>
        </div>

        <div class="viewer-actions">
          <div v-if="canPreview" class="mode-switch" role="tablist">
            <button
              type="button"
              role="tab"
              class="mode-btn"
              :class="{ active: viewMode === 'preview' }"
              :aria-selected="viewMode === 'preview'"
              @click="viewMode = 'preview'"
            >
              {{ t("ai.outputs.modePreview") }}
            </button>
            <button
              type="button"
              role="tab"
              class="mode-btn"
              :class="{ active: viewMode === 'code' }"
              :aria-selected="viewMode === 'code'"
              @click="viewMode = 'code'"
            >
              {{ t("ai.outputs.modeCode") }}
            </button>
          </div>

          <button
            v-if="selectedFile.messageId"
            type="button"
            class="icon-btn"
            :title="t('ai.outputs.jumpToMessage')"
            :aria-label="t('ai.outputs.jumpToMessage')"
            @click="emit('jumpToMessage', selectedFile.messageId)"
          >
            <CornerUpLeft :size="14" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :class="{ ok: copied }"
            :title="copied ? t('ai.copied') : t('common.copy')"
            :aria-label="copied ? t('ai.copied') : t('common.copy')"
            @click="copyFileContent"
          >
            <Check v-if="copied" :size="14" />
            <Copy v-else :size="14" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :class="{ ok: saved }"
            :title="saved ? t('ai.downloaded') : t('ai.downloadCode')"
            :aria-label="saved ? t('ai.downloaded') : t('ai.downloadCode')"
            @click="downloadOutputFile"
          >
            <Check v-if="saved" :size="14" />
            <Download v-else :size="14" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :title="t('ai.outputs.closePanel')"
            :aria-label="t('ai.outputs.closePanel')"
            @click="emit('close')"
          >
            <X :size="15" />
          </button>
        </div>
      </header>

      <div
        v-if="breadcrumbSegments.length > 1"
        class="viewer-breadcrumb-wrap"
        :class="{ 'fade-left': breadcrumbOverflowLeft }"
        :title="selectedFile.filePath"
      >
        <div
          ref="breadcrumbRef"
          class="viewer-breadcrumb"
          @scroll="syncBreadcrumbScroll(false)"
        >
          <template v-for="(seg, idx) in breadcrumbSegments" :key="`${idx}:${seg}`">
            <ChevronRight v-if="idx > 0" :size="12" class="crumb-sep" />
            <span class="crumb-seg" :class="{ current: idx === breadcrumbSegments.length - 1 }">
              <component
                :is="iconForFile(selectedFile)"
                v-if="idx === breadcrumbSegments.length - 1"
                :size="12"
                class="crumb-file-icon"
              />
              <span>{{ seg }}</span>
            </span>
          </template>
        </div>
      </div>

      <div class="viewer-body">
        <div
          v-if="selectedFile.previewKind === 'image'"
          :key="`${selectedFile.id}:image`"
          class="image-preview-box viewer-stage"
        >
          <div v-if="imageLoading" class="image-preview-state">
            <LoaderCircle :size="20" class="spin" />
          </div>
          <p v-else-if="imageError" class="image-preview-error">{{ imageError }}</p>
          <img
            v-else-if="activeImagePreview"
            :src="activeImagePreview.dataUrl"
            :alt="selectedFile.fileName"
            class="image-preview-img"
          />
        </div>

        <iframe
          v-else-if="viewMode === 'preview' && selectedFile.previewKind === 'html'"
          :key="`${selectedFile.id}:html`"
          class="html-preview-frame viewer-stage"
          sandbox="allow-scripts"
          :srcdoc="selectedFile.content"
          :title="selectedFile.fileName"
        />

        <div
          v-else-if="viewMode === 'preview' && selectedFile.previewKind === 'svg'"
          :key="`${selectedFile.id}:svg`"
          class="svg-preview-box viewer-stage"
          v-html="sanitizedSvg"
        />

        <div
          v-else-if="viewMode === 'preview' && selectedFile.previewKind === 'markdown'"
          :key="`${selectedFile.id}:md`"
          class="md-preview-box viewer-stage"
        >
          <MarkdownView
            :markdown="selectedFile.content"
            compact
            @open-link="onMarkdownLink"
          />
        </div>

        <div v-else ref="codeViewerRef" :key="`${selectedFile.id}:code`" class="code-viewer viewer-stage">
          <div class="code-gutter" aria-hidden="true">
            <span
              v-for="n in lineNumbers"
              :key="n"
              :data-line="n"
              :class="{ 'is-target': isHighlightedLine(n) }"
            >{{ n }}</span>
          </div>
          <pre class="code-pre"><code class="hljs" v-html="highlightedCode" /></pre>
        </div>
      </div>
    </div>

    <!-- 输出内容列表卡片模式（内嵌在右侧，不遮挡会话，点击哪个才在右侧打开哪个） -->
    <div v-else key="outputs-list" class="outputs-card viewer-stage">
      <header class="outputs-card-head">
        <div class="outputs-title-row">
          <h3 class="outputs-card-title">{{ t("ai.outputs.title") }}</h3>
          <span v-if="files.length" class="count-pill">{{ t("ai.outputs.filesCount", { n: files.length }) }}</span>
        </div>
        <button
          type="button"
          class="icon-btn"
          :title="t('ai.outputs.closePanel')"
          :aria-label="t('ai.outputs.closePanel')"
          @click="emit('close')"
        >
          <X :size="15" />
        </button>
      </header>

      <div v-if="files.length" class="outputs-list">
        <button
          v-for="item in files"
          :key="item.id"
          type="button"
          class="output-item"
          :title="item.filePath"
          @click="emit('select', item.id)"
        >
          <span class="output-icon-box">
            <component :is="iconForFile(item)" :size="14" />
          </span>
          <span class="output-name">{{ item.fileName }}</span>
          <span class="output-size">{{ formatFileSize(item.sizeBytes) }}</span>
        </button>
      </div>

      <div v-else class="outputs-empty">
        <p class="empty-hint">{{ t("ai.outputs.emptyHint") }}</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.outputs-pane {
  position: absolute;
  top: 0;
  right: 18px;
  bottom: 0;
  z-index: 8;
  width: var(--drawer-w, 300px);
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 2px 2px 16px 6px;
  pointer-events: none;
  transition: width var(--dur-slow) var(--ease-out);
}
.outputs-pane.is-resizing {
  user-select: none;
  transition: none;
}

.outputs-resizer {
  position: absolute;
  top: 12px;
  left: -2px;
  bottom: 24px;
  width: 8px;
  z-index: 6;
  cursor: col-resize;
  touch-action: none;
  pointer-events: auto;
  display: grid;
  place-items: center;
}
.outputs-resizer::after {
  content: "";
  width: 3px;
  height: 44px;
  border-radius: 999px;
  background: var(--border-strong);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out), height var(--dur) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.outputs-resizer:hover::after,
.outputs-resizer:focus-visible::after {
  opacity: 0.7;
}
.outputs-resizer.active::after {
  opacity: 1;
  height: 72px;
  background: var(--accent);
}
.outputs-resizer:focus-visible {
  outline: none;
}

/* ---------- 列表卡片视图 ---------- */
.outputs-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
  pointer-events: auto;
}

.outputs-card-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 8px 8px 14px;
}
.outputs-title-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.outputs-card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--text);
}
.count-pill {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.outputs-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scrollbar-width: thin;
}

.output-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.output-item:hover,
.output-item:focus-visible {
  background: var(--hover);
  outline: none;
}

.output-icon-box {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--bg-sunken);
  color: var(--text-2);
  display: grid;
  place-items: center;
}

.output-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.output-size {
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.outputs-empty {
  padding: 4px 14px 14px;
}
.empty-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}

/* ---------- 单文件查看卡片 ---------- */
.viewer-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
  pointer-events: auto;
}

.viewer-header {
  flex-shrink: 0;
  min-height: 52px;
  padding: 8px 10px 8px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.viewer-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.viewer-file-badge {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  color: var(--text-2);
  display: grid;
  place-items: center;
}
.viewer-title-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.viewer-file-name {
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.viewer-file-sub {
  font-size: 11px;
  line-height: 1.3;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.viewer-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.viewer-actions .icon-btn.ok {
  color: var(--success);
}

.mode-switch {
  display: inline-flex;
  padding: 2px;
  margin-right: 4px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-sunken);
}
.mode-btn {
  height: 22px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
  font-size: 11.5px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.mode-btn.active {
  background: var(--surface);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-sm);
}

.viewer-breadcrumb-wrap {
  position: relative;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.viewer-breadcrumb-wrap.fade-left::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 24px;
  pointer-events: none;
  background: linear-gradient(to right, var(--surface), transparent);
  z-index: 1;
}
.viewer-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  overflow-x: auto;
  scrollbar-width: none;
  white-space: nowrap;
}
.viewer-breadcrumb::-webkit-scrollbar {
  display: none;
}
.crumb-sep {
  flex-shrink: 0;
  color: var(--text-3);
}
.crumb-seg {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-2);
  flex-shrink: 0;
}
.crumb-seg.current {
  color: var(--text);
  font-weight: 500;
}
.crumb-file-icon {
  flex-shrink: 0;
  color: var(--accent);
}

.viewer-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--surface);
  display: flex;
  flex-direction: column;
}

/* 列表与单文件切换、预览/源码切换时的轻柔入场位移，无空白闪烁 */
.viewer-stage {
  animation: viewer-stage-in var(--dur) var(--ease-out);
}
@keyframes viewer-stage-in {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.html-preview-frame {
  width: 100%;
  flex: 1;
  min-height: 0;
  border: 0;
  background: #fff;
}

.svg-preview-box {
  flex: 1;
  padding: 24px;
  display: grid;
  place-items: center;
  overflow: auto;
  background: var(--bg-sunken);
}
.svg-preview-box :deep(svg) {
  max-width: 100%;
  max-height: 100%;
  height: auto;
}

.image-preview-box {
  flex: 1;
  min-height: 0;
  padding: 20px;
  display: grid;
  place-items: center;
  overflow: auto;
  background-color: var(--bg-sunken);
  background-image:
    linear-gradient(45deg, var(--border) 25%, transparent 25%),
    linear-gradient(-45deg, var(--border) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--border) 75%),
    linear-gradient(-45deg, transparent 75%, var(--border) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}
.image-preview-img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
}
.image-preview-state {
  color: var(--text-3);
}
.image-preview-error {
  margin: 0;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--danger);
  word-break: break-word;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.md-preview-box {
  padding: 20px 24px 28px;
}

.code-viewer {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: flex-start;
  overflow: auto;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  background: var(--surface);
  scrollbar-width: thin;
}
.code-gutter {
  flex-shrink: 0;
  min-width: 42px;
  padding: 16px 8px 24px 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: var(--text-3);
  border-right: 1px solid var(--border);
  user-select: none;
  font-variant-numeric: tabular-nums;
  min-height: 100%;
}
.code-gutter span {
  padding: 0 4px;
  border-radius: 4px;
  opacity: 0.65;
}
.code-gutter span.is-target {
  opacity: 1;
  color: var(--accent);
  background: var(--accent-soft);
  font-weight: 600;
}
.code-pre {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 16px 18px 24px;
  overflow-x: auto;
  color: var(--text);
  user-select: text;
}
.code-pre code {
  white-space: pre;
  font-family: inherit;
}

.code-pre :deep(.hljs-comment),
.code-pre :deep(.hljs-quote) { color: var(--text-3); font-style: italic; }
.code-pre :deep(.hljs-keyword),
.code-pre :deep(.hljs-selector-tag),
.code-pre :deep(.hljs-built_in) { color: var(--syntax-literal); }
.code-pre :deep(.hljs-string),
.code-pre :deep(.hljs-regexp),
.code-pre :deep(.hljs-addition) { color: var(--syntax-string); }
.code-pre :deep(.hljs-number),
.code-pre :deep(.hljs-literal),
.code-pre :deep(.hljs-bullet) { color: var(--syntax-number); }
.code-pre :deep(.hljs-title),
.code-pre :deep(.hljs-section),
.code-pre :deep(.hljs-attr),
.code-pre :deep(.hljs-attribute),
.code-pre :deep(.hljs-property),
.code-pre :deep(.hljs-name) { color: var(--syntax-key); }
.code-pre :deep(.hljs-deletion) { color: var(--danger); }
</style>
