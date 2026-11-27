<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { ParsedFileLink } from "../markdown";
import type { AiOutputFile } from "../outputs";
import AiOutputFileViewer from "./AiOutputFileViewer.vue";
import AiOutputsListCard from "./AiOutputsListCard.vue";

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

onBeforeUnmount(() => {
  cleanupResize();
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

    <AiOutputFileViewer
      v-if="selectedFile"
      :key="`view:${selectedFile.id}`"
      class="viewer-stage"
      :file="selectedFile"
      :highlight-lines="highlightLines"
      :conversation-id="conversationId"
      :workspace-dir="workspaceDir"
      :panel-width="panelWidth"
      @back="emit('select', '')"
      @open-file="emit('openFile', $event)"
      @jump-to-message="emit('jumpToMessage', $event)"
      @close="emit('close')"
    />

    <AiOutputsListCard
      v-else
      key="outputs-list"
      class="viewer-stage"
      :files="files"
      @select="emit('select', $event)"
      @close="emit('close')"
    />
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

/* 列表与单文件切换时的轻柔入场位移，无空白闪烁 */
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
</style>
