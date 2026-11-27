<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, ChevronLeft, ChevronRight, Copy, CornerUpLeft, Download, LoaderCircle, X } from "lucide-vue-next";
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
import { formatFileSize, highlightOutputCode, sanitizeSvgPreview, type AiOutputFile } from "../outputs";
import { iconForOutputFile } from "./outputFileIcon";

const props = defineProps<{
  file: AiOutputFile;
  highlightLines?: { start: number; end?: number } | null;
  conversationId?: string;
  workspaceDir?: string;
  panelWidth: number;
}>();

const emit = defineEmits<{
  back: [];
  openFile: [ref: ParsedFileLink];
  jumpToMessage: [messageId: string];
  close: [];
}>();

const { t } = useI18n();
const { copy } = useClipboard();

const viewMode = ref<"preview" | "code">("code");
const copied = ref(false);
const saved = ref(false);
let copiedTimer = 0;
let savedTimer = 0;

const canPreview = computed(
  () => props.file.previewKind !== "code" && props.file.previewKind !== "image",
);

const loadedImage = ref<LocalImagePreview | null>(null);
const imageLoading = ref(false);
const imageError = ref("");
let imageLoadSeq = 0;

const activeImagePreview = computed<LocalImagePreview | null>(() => {
  if (props.file.previewKind !== "image") return null;
  return props.file.imagePreview ?? loadedImage.value;
});

watch(
  [() => props.file, () => props.workspaceDir],
  ([file]) => {
    const seq = ++imageLoadSeq;
    loadedImage.value = null;
    imageError.value = "";
    imageLoading.value = false;
    if (file.previewKind !== "image") return;
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
  [() => props.file, () => props.highlightLines?.start, () => props.highlightLines?.end],
  ([file, start], [prev]) => {
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

const breadcrumbRef = ref<HTMLElement>();
const breadcrumbOverflowLeft = ref(false);

const breadcrumbSegments = computed<string[]>(() =>
  props.file.filePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean),
);

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
  [() => props.file.id, () => props.panelWidth],
  () => {
    nextTick(() => syncBreadcrumbScroll(true));
  },
  { immediate: true },
);

const subtitleText = computed(() => {
  if (props.file.previewKind === "image") {
    const img = activeImagePreview.value;
    const dims = img?.width && img?.height ? `${img.width} × ${img.height}` : "";
    const bytes = img?.sizeBytes ?? props.file.sizeBytes;
    return [dims, bytes > 0 ? formatFileSize(bytes) : ""].filter(Boolean).join(" · ");
  }
  return [t("ai.outputs.linesCount", { n: props.file.lineCount }), formatFileSize(props.file.sizeBytes)].join(" · ");
});

const highlightedCode = computed(() => highlightOutputCode(props.file.content, props.file.language));

const lineNumbers = computed(() =>
  Array.from({ length: Math.max(1, props.file.lineCount) }, (_, i) => i + 1),
);

const sanitizedSvg = computed(() =>
  props.file.previewKind === "svg" ? sanitizeSvgPreview(props.file.content) : "",
);

function onMarkdownLink(href: string) {
  const parsed = parseFileLinkHref(href);
  if (parsed) emit("openFile", parsed);
}

async function copyFileContent() {
  const text = props.file.previewKind === "image" ? props.file.filePath : props.file.content;
  await copy(text);
  copied.value = true;
  window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    copied.value = false;
  }, 1500);
}

async function downloadOutputFile() {
  try {
    let bytes: Uint8Array;
    if (props.file.previewKind === "image") {
      let preview = activeImagePreview.value;
      if (!preview) {
        const wsDir = await resolveConversationWorkspaceDir(props.conversationId || "draft", props.workspaceDir);
        preview = await readLocalImageForPreview(wsDir, props.file.filePath);
        loadedImage.value = preview;
      }
      bytes = decodeImagePreviewBytes(preview);
    } else {
      bytes = new TextEncoder().encode(props.file.content);
    }
    const ok = await saveFile(bytes, props.file.fileName);
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
  window.clearTimeout(copiedTimer);
  window.clearTimeout(savedTimer);
});
</script>

<template>
  <div class="viewer-card">
    <header class="viewer-header">
      <div class="viewer-title-group">
        <button
          type="button"
          class="icon-btn"
          :title="t('ai.outputs.backToList')"
          :aria-label="t('ai.outputs.backToList')"
          @click="emit('back')"
        >
          <ChevronLeft :size="16" />
        </button>
        <span class="viewer-file-badge">
          <component :is="iconForOutputFile(file)" :size="15" />
        </span>
        <div class="viewer-title-meta">
          <span class="viewer-file-name" :title="file.filePath">{{ file.fileName }}</span>
          <span class="viewer-file-sub" :title="file.filePath">{{ subtitleText }}</span>
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
          v-if="file.messageId"
          type="button"
          class="icon-btn"
          :title="t('ai.outputs.jumpToMessage')"
          :aria-label="t('ai.outputs.jumpToMessage')"
          @click="emit('jumpToMessage', file.messageId)"
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
      :title="file.filePath"
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
              :is="iconForOutputFile(file)"
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
        v-if="file.previewKind === 'image'"
        :key="`${file.id}:image`"
        class="image-preview-box viewer-stage"
      >
        <div v-if="imageLoading" class="image-preview-state">
          <LoaderCircle :size="20" class="spin" />
        </div>
        <p v-else-if="imageError" class="image-preview-error">{{ imageError }}</p>
        <img
          v-else-if="activeImagePreview"
          :src="activeImagePreview.dataUrl"
          :alt="file.fileName"
          class="image-preview-img"
        />
      </div>

      <iframe
        v-else-if="viewMode === 'preview' && file.previewKind === 'html'"
        :key="`${file.id}:html`"
        class="html-preview-frame viewer-stage"
        sandbox="allow-scripts"
        :srcdoc="file.content"
        :title="file.fileName"
      />

      <div
        v-else-if="viewMode === 'preview' && file.previewKind === 'svg'"
        :key="`${file.id}:svg`"
        class="svg-preview-box viewer-stage"
        v-html="sanitizedSvg"
      />

      <div
        v-else-if="viewMode === 'preview' && file.previewKind === 'markdown'"
        :key="`${file.id}:md`"
        class="md-preview-box viewer-stage"
      >
        <MarkdownView
          :markdown="file.content"
          compact
          @open-link="onMarkdownLink"
        />
      </div>

      <div v-else ref="codeViewerRef" :key="`${file.id}:code`" class="code-viewer viewer-stage">
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
</template>

<style scoped>
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
