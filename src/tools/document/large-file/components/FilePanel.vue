<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRef, watch } from "vue";
import type { ChangeSet } from "@codemirror/state";
import { useI18n } from "vue-i18n";
import { Save, X, Undo2, Redo2, Search, Hash, Info, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileText, Square } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import { formatBytes } from "@/utils/format";
import { showError, showNotice } from "@/utils/errorToast";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { useUpdater } from "@/composables/useUpdater";
import ChunkEditor from "./ChunkEditor.vue";
import { displayFilePath } from "../path";
import type { ViewportAnchor } from "../types";
import type { TextController } from "../controller";
import { changeEncoding, confirming, saveOriginal } from "../useLargeFile";

const { t } = useI18n();
const props = defineProps<{ controller: TextController; active: boolean }>();
const largeText = props.controller;
const saveFile = () => saveOriginal(largeText);
const updater = useUpdater();
const updating = computed(() => ["downloading", "installing"].includes(updater.status.value));
const { state, localDirty, dirty } = largeText;
const encoding = computed(() => state.encoding);
const switchingEncoding = ref(false);
const changeFileEncoding = async (value: string) => {
  if (switchingEncoding.value) return;
  switchingEncoding.value = true;
  try { await changeEncoding(largeText, value); } finally { switchingEncoding.value = false; }
};
const query = toRef(state, "query"); const lineInput = toRef(state, "lineInput");
const queryInput = ref<HTMLInputElement>(); const jumpInput = ref<HTMLInputElement>();
const editor = ref<InstanceType<typeof ChunkEditor>>();
const cursor = ref({ line: 1, column: 1 });
const localUndo = ref(0); const localRedo = ref(0);
let match: { query: string; end: number; revision: number } | undefined;
watch(() => state.generation, () => { match = undefined; }, { flush: "sync" });
const encodingName = computed(() => ({ Utf8: "UTF-8", Utf16Le: "UTF-16 LE", Utf16Be: "UTF-16 BE", Gbk: "GBK" })[state.info?.encoding ?? "Utf8"]);
const encodings = computed(() => [
  { value: "auto", label: state.encoding === "auto" && state.info ? t("largeText.autoDetected", { encoding: encodingName.value }) : t("largeText.auto") }, { value: "Utf8", label: "UTF-8" },
  { value: "Utf16Le", label: "UTF-16 LE" }, { value: "Utf16Be", label: "UTF-16 BE" }, { value: "Gbk", label: "GBK" },
]);
const operationLabel = computed(() => t(`largeText.${({ read: "readTask", save: "saveTask", search: "searchTask", jump: "jumpTask", edit: "editTask", history: "historyTask" } as Record<string, string>)[state.status?.kind ?? ""] ?? "readTask"}`));
const percent = computed(() => Math.min(100, 100 * (state.status?.done ?? 0) / Math.max(1, state.status?.total ?? 0)));
const canPrevious = computed(() => Boolean(state.block && state.info && state.block.start > state.info.bom));
const canNext = computed(() => Boolean(state.block && state.info && state.block.end < state.info.size));
const run = async (action: () => Promise<unknown>) => { if (state.busy) return; try { await action(); } catch (e) { showError(e); } };
const scrolling = ref(false);
let scrollPixels = 0;
const rememberScroll = (pixels: number) => { if (Number.isFinite(pixels)) scrollPixels += pixels; };
const scrollBoundary = async (initial: "next" | "previous") => {
  if (scrolling.value) return;
  if (state.busy || switchingEncoding.value) { scrollPixels = 0; editor.value?.releaseBoundary(); return; }
  scrolling.value = true;
  let direction = initial, read = true;
  let generation = state.generation;
  try {
    do {
      if (read) {
        const anchor = editor.value?.snapshot();
        const shift = await largeText.scroll(direction);
        generation = state.generation;
        await nextTick();
        if (anchor) await editor.value?.restore(props.active ? anchor : { ...anchor, focused: false }, shift);
        if (generation !== state.generation) return;
      }
      // 连续滚轮的距离合并处理；只有越过当前窗口时才串行读取另一块。
      const pixels = scrollPixels; scrollPixels = 0;
      const remaining = await editor.value?.scrollBy(pixels) ?? 0;
      if (generation !== state.generation) return;
      scrollPixels += remaining;
      direction = scrollPixels < 0 ? "previous" : "next";
      read = Math.abs(remaining) > 0.5;
    } while (Math.abs(scrollPixels) > 0.5 && (!read || (direction === "previous" ? canPrevious.value : canNext.value)));
  } catch (e) { showError(e); }
  finally { scrollPixels = 0; scrolling.value = false; editor.value?.releaseBoundary(); }
};
const history = async (redo: boolean) => {
  if (state.busy || state.info?.readonly) return;
  if (editor.value?.history(redo)) return;
  await run(() => largeText.history(redo));
};
const jump = async () => {
  const line = Number(lineInput.value);
  if (!Number.isSafeInteger(line) || line < 1) { showNotice(t("largeText.badLine")); return; }
  await run(() => largeText.jump(line));
};
const find = async (fromStart: boolean) => {
  if (!query.value || !state.info || !state.block) return;
  const start = fromStart ? state.info.bom : match?.query === query.value && match.revision === state.info.revision && !localDirty.value ? match.end : state.block.start;
  await run(async () => {
    const found = await largeText.search(query.value, start);
    if (!found) { showNotice(t("largeText.notFound")); return; }
    match = { query: query.value, end: found.end, revision: state.info!.revision };
    await nextTick(); editor.value?.select(query.value.length, props.active);
  });
};
const revealSearch = async () => { state.searchVisible = true; await nextTick(); queryInput.value?.focus(); };
const revealJump = async () => { state.jumpVisible = true; await nextTick(); jumpInput.value?.focus(); };
const change = (text: string, changes: ChangeSet) => { match = undefined; largeText.changed(text, changes); };
useWindowEvent("keydown", (event) => {
  if (!props.active || event.defaultPrevented || !(event.ctrlKey || event.metaKey) || !state.id) return;
  if (event.key.toLowerCase() === "s") { event.preventDefault(); void saveFile(); }
  if (event.key.toLowerCase() === "f") { event.preventDefault(); void revealSearch(); }
  if (event.key.toLowerCase() === "g") { event.preventDefault(); void revealJump(); }
});
const retainEditor = (generation: number, json: Record<string, unknown>, position?: ViewportAnchor) => {
  if (generation === state.generation) largeText.editorCache.value = { generation, json, viewport: !props.active && viewportGeneration === generation ? viewport : position };
};
let viewport: ViewportAnchor | undefined;
let viewportGeneration = 0;
onMounted(async () => {
  const cache = largeText.editorCache.value;
  if (cache?.generation === state.generation && cache.viewport) {
    viewport = cache.viewport; viewportGeneration = state.generation;
    await nextTick(); if (props.active) editor.value?.restore({ ...cache.viewport, focused: false }, 0);
  }
});
watch(() => props.active, async (active) => {
  if (!active) { viewport = editor.value?.snapshot(); viewportGeneration = state.generation; return; }
  await nextTick();
  editor.value?.remeasure();
  if (viewport && viewportGeneration === state.generation) editor.value?.restore({ ...viewport, focused: false }, 0);
}, { flush: "sync" });
</script>

<template>
  <div class="file-panel">
    <template v-if="state.info && state.block">
      <div class="editor-toolbar" role="toolbar" :aria-label="t('largeText.editorActions')">
        <div class="toolbar-group">
          <button class="btn small primary" :disabled="state.busy || confirming || !dirty || state.info.readonly" @click="saveFile"><Save :size="14" />{{ t("largeText.save") }}</button>
          <button class="icon-btn" :title="t('largeText.undo')" :aria-label="t('largeText.undo')" :disabled="state.busy || confirming || state.info.readonly || (!localUndo && !state.info.canUndo && !localDirty)" @click="history(false)"><Undo2 :size="15" /></button>
          <button class="icon-btn" :title="t('largeText.redo')" :aria-label="t('largeText.redo')" :disabled="state.busy || confirming || state.info.readonly || (!localRedo && !state.info.canRedo)" @click="history(true)"><Redo2 :size="15" /></button>
        </div>
        <span class="toolbar-divider" />
        <div class="toolbar-group">
          <button class="btn small subtle" :class="{ selected: state.searchVisible }" :aria-pressed="state.searchVisible" :disabled="state.busy || confirming" @click="state.searchVisible ? state.searchVisible = false : revealSearch()"><Search :size="14" />{{ t("largeText.find") }}<kbd>Ctrl F</kbd></button>
          <button class="btn small subtle" :class="{ selected: state.jumpVisible }" :aria-pressed="state.jumpVisible" :disabled="state.busy || confirming" @click="state.jumpVisible ? state.jumpVisible = false : revealJump()"><Hash :size="14" />{{ t("largeText.jump") }}</button>
        </div>
        <div class="toolbar-group navigation">
          <button class="icon-btn" :title="t('largeText.first')" :aria-label="t('largeText.first')" :disabled="state.busy || confirming || !canPrevious" @click="run(() => largeText.page('first'))"><ChevronsLeft :size="15" /></button>
          <button class="icon-btn" :title="t('largeText.previous')" :aria-label="t('largeText.previous')" :disabled="state.busy || confirming || !canPrevious" @click="run(() => largeText.page('previous'))"><ChevronLeft :size="15" /></button>
          <button class="icon-btn" :title="t('largeText.next')" :aria-label="t('largeText.next')" :disabled="state.busy || confirming || !canNext" @click="run(() => largeText.page('next'))"><ChevronRight :size="15" /></button>
          <button class="icon-btn" :title="t('largeText.last')" :aria-label="t('largeText.last')" :disabled="state.busy || confirming || !canNext" @click="run(() => largeText.page('last'))"><ChevronsRight :size="15" /></button>
        </div>
      </div>
      <div v-if="state.searchVisible || state.jumpVisible" class="find-bar">
        <form v-if="state.searchVisible" class="search-form" @submit.prevent="find(false)" @keydown.esc="state.searchVisible = false">
          <Search :size="14" />
          <input ref="queryInput" v-model="query" class="field" :placeholder="t('largeText.query')" :aria-label="t('largeText.query')" :disabled="state.busy || confirming" />
          <button class="btn small" :disabled="state.busy || confirming || !query">{{ t("largeText.findNext") }}</button>
          <button type="button" class="btn small subtle" :disabled="state.busy || confirming || !query" @click="find(true)">{{ t("largeText.findFirst") }}</button>
          <button type="button" class="icon-btn" :aria-label="t('largeText.hideSearch')" @click="state.searchVisible = false"><X :size="13" /></button>
        </form>
        <form v-if="state.jumpVisible" class="jump-form" @submit.prevent="jump" @keydown.esc="state.jumpVisible = false">
          <Hash :size="14" />
          <input ref="jumpInput" v-model="lineInput" class="field" inputmode="numeric" :placeholder="t('largeText.line')" :aria-label="t('largeText.line')" :disabled="state.busy || confirming" />
          <button class="btn small" :disabled="state.busy || confirming || !lineInput">{{ t("largeText.jump") }}</button>
          <button type="button" class="icon-btn" :aria-label="t('largeText.hideJump')" @click="state.jumpVisible = false"><X :size="13" /></button>
        </form>
      </div>
      <div v-if="state.busy" class="task">
        <span>{{ t("largeText.busy", { action: operationLabel }) }}</span><progress :value="percent" max="100" />
        <button class="btn small subtle" @click="largeText.cancel().catch(showError)" :disabled="!state.status?.busy"><Square :size="11" />{{ t("largeText.cancel") }}</button>
      </div>
      <p v-if="state.error" class="error" role="alert">{{ state.error }} <span>{{ t("largeText.recovery") }}</span></p>
      <p v-if="state.status?.indexError" class="error" role="alert">{{ t("largeText.indexError", { error: state.status.indexError }) }}</p>
      <div class="editor-frame">
        <ChunkEditor :key="`${state.id}:${state.generation}`" ref="editor" :generation="state.generation" :saved-state="largeText.editorCache.value?.generation === state.generation ? largeText.editorCache.value.json : undefined" :text="state.draft" :first-line="state.block.firstLine" :readonly="state.busy || scrolling || switchingEncoding || confirming || state.info.readonly"
          :scroll-loading="scrolling" :can-next="canNext" :can-previous="canPrevious" :loading="state.busy || switchingEncoding || confirming"
          @retain="retainEditor" @scroll-intent="rememberScroll" @boundary="scrollBoundary" @change="change" @save="saveFile" @history="history" @limit="showNotice(t('largeText.limit'))"
          @cursor="(line, column) => cursor = { line, column }" @depths="(undo, redo) => { localUndo = undo; localRedo = redo; }" />
      </div>
      <div class="statusbar">
        <div class="status-file">
          <span class="save-state" :class="{ dirty }" :title="dirty ? t('largeText.unsaved') : t('largeText.saved')"><span class="state-dot" />{{ dirty ? t("largeText.unsaved") : t("largeText.saved") }}</span>
          <span class="path" :title="displayFilePath(state.info.path)">{{ displayFilePath(state.info.path) }}</span>
        </div>
        <div class="status-details">
          <span v-if="state.info.readonly" :title="t('largeText.readonlyHint')">{{ t("largeText.readonly") }}</span>
          <span :title="state.block.continuation ? t('largeText.continuation') : ''">{{ t("largeText.position", cursor) }}</span>
          <span :title="t('largeText.block', { start: state.block.start, end: state.block.end, total: state.info.size })">{{ formatBytes(state.info.size) }}</span>
          <span v-if="state.status" :title="!canNext ? t('largeText.endOfFile') : ''">{{ state.status.indexComplete ? t("largeText.lines", { n: state.status.lines }) : t("largeText.indexed", { done: formatBytes(state.status.indexed), total: formatBytes(state.status.indexTotal) }) }}</span>
          <span>{{ state.info.newline }}</span>
          <div class="encoding-control" :title="t('largeText.encoding')">
            <AppSelect size="sm" :model-value="encoding" @update:model-value="changeFileEncoding" :disabled="state.busy || switchingEncoding || confirming || updating" :options="encodings" :aria-label="t('largeText.encoding')" />
          </div>
          <span class="help" role="img" :aria-label="t('largeText.chunkHint')" :title="t('largeText.chunkHint')"><Info :size="13" /></span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.file-panel { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; background: var(--surface); }
.editor-toolbar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; min-height: 46px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.toolbar-group { display: flex; align-items: center; gap: 4px; }
.toolbar-divider { width: 1px; height: 18px; background: var(--border); }
.navigation { margin-left: auto; }
.editor-toolbar kbd { border: 0; background: transparent; color: var(--text-3); padding: 0; font-size: 10px; margin-left: 10px; }
.btn.selected { color: var(--accent); background: var(--accent-soft); }
.find-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--bg-sunken); flex-shrink: 0; }
.search-form, .jump-form { display: flex; align-items: center; gap: 6px; color: var(--text-3); }
.search-form { flex: 1; min-width: 280px; }
.search-form .field { flex: 1; width: 0; min-width: 80px; height: 28px; font-size: 12px; }
.jump-form .field { width: 90px; height: 28px; font-size: 12px; }
.editor-frame { display: flex; flex: 1; min-height: 160px; min-width: 0; overflow: hidden; padding-top: 8px; }
.statusbar { display: flex; align-items: center; gap: 16px; padding: 5px 12px; min-height: 38px; border-top: 1px solid var(--border); background: var(--bg-sunken); color: var(--text-3); font-size: 11px; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.status-file, .status-details { display: flex; align-items: center; gap: 14px; min-width: 0; }
.status-file { flex: 1; overflow: hidden; }
.status-details { flex-shrink: 0; }
.save-state { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.state-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--success); }
.save-state.dirty { color: var(--accent); }
.dirty .state-dot { background: var(--accent); }
.path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-control { width: 138px; flex: 0 0 138px; }
.encoding-control :deep(.app-select) { height: 25px; border: 0; background: transparent; font-size: 11px; padding: 0 4px; border-radius: 4px; }
.help { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 24px; color: var(--text-3); }
.task { display: flex; align-items: center; gap: 12px; padding: 4px 12px; color: var(--text-2); font-size: 12px; background: var(--accent-soft); }
.task progress { flex: 1; height: 3px; accent-color: var(--accent); }
.error { margin: 0; padding: 8px 12px; font-size: 12px; line-height: 1.6; color: var(--danger); background: var(--danger-soft); overflow-wrap: anywhere; }
.error span { color: var(--text-2); }
@media (max-width: 850px) { .statusbar { flex-wrap: wrap; gap: 4px; } .status-file { flex-basis: 100%; } .status-details { flex: 1; justify-content: space-between; gap: 8px; } .editor-toolbar kbd { display: none; } }
@media (max-width: 520px) { .editor-toolbar { flex-wrap: wrap; gap: 6px; } .toolbar-divider { display: none; } .navigation { margin-left: auto; } .search-form { min-width: 100%; flex-wrap: wrap; } .status-details { flex-wrap: wrap; justify-content: flex-start; } }
</style>
