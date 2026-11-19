<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronLeft, ChevronRight, CodeXml, FilePlus2, FolderOpen, Trash2 } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import { useToolUsage } from "@/composables/useToolUsage";
import { usePanelResize } from "@/composables/usePanelResize";
import { useWindowEvent } from "@/composables/useWindowEvent";
import NotebookEditor from "./components/NotebookEditor.vue";
import NotebookDirectory from "./components/NotebookDirectory.vue";
import { directoryRows, moveEntry, subtree, type DirectoryDrop, type Node } from "./notebook";
import { markdownOutline, scrollSourceToHeading, type OutlineHeading } from "./outline";
import { useNotebook } from "./storage";

const { t } = useI18n();
const label = (key: string) => t(`markdown.notebook.${key}`);
const { notebook, loadState, saveState, retryLoad, retrySave, canReveal, revealEntry } = useNotebook();
const { track } = useToolUsage();
const directoryOpen = ref(true);
const sidebarView = ref<"files" | "outline">("files");
const directoryLabel = computed(() => label(directoryOpen.value ? "hideDirectory" : "showDirectory"));
const workspace = ref<HTMLElement>();
const directoryDefault = 250;
const { width, min, max, fitted, resizing, start, move, stop, key } = usePanelResize(workspace, {
  storageKey: "notebook.directoryWidth",
  initial: directoryDefault,
  available: 900,
  bounds: available => ({
    min: Math.min(132, Math.floor(available * 0.4)),
    max: Math.floor(available - Math.min(220, available * 0.52)),
  }),
});
const writingViewport = ref<HTMLElement>();
const writingDefault = 1040;
const {
  width: writingWidth, min: writingMin, max: writingMax, fitted: fittedWritingWidth,
  resizing: writingResizing, start: startWritingResize, move: moveWritingResize,
  stop: stopWritingResize, key: writingResizeKey,
} = usePanelResize(writingViewport, {
  storageKey: "notebook.writingWidth",
  initial: writingDefault,
  available: writingDefault + 40,
  // 正文居中，两侧各移动一半，让右侧手柄跟上指针。
  pointerScale: 2,
  bounds: available => {
    const max = Math.max(1, Math.floor(available - 40));
    return { min: Math.max(1, Math.min(420, Math.floor(max * 0.75))), max };
  },
});
const sourceMode = ref(false);
const modeLabel = computed(() => label(sourceMode.value ? "exitSource" : "enterSource"));
const index = computed(() => new Map(notebook.value?.nodes.map(node => [node.id, node])));
const selected = computed(() => index.value.get(notebook.value?.selectedId ?? ""));
const note = computed(() => selected.value?.kind === "note" ? selected.value : undefined);
const headings = computed(() => directoryOpen.value && sidebarView.value === "outline" && note.value
  ? markdownOutline(note.value.markdown) : []);
const source = computed({
  get: () => note.value?.markdown ?? "",
  set: (markdown: string) => { if (note.value) updateNote(note.value.id, markdown); },
});
const currentFolder = computed(() => selected.value?.kind === "folder" ? selected.value.id : selected.value?.parentId ?? null);

const dialog = ref<HTMLDialogElement>();
const nameInput = ref<HTMLInputElement>();
const operation = ref<"note" | "folder" | "delete">("note");
const dialogLabel = computed(() => label(operation.value === "delete" ? "delete" : operation.value === "note" ? "addNote" : "addFolder"));
const targetId = ref<string>();
const name = ref("");
const destination = ref("");
const target = computed(() => index.value.get(targetId.value ?? ""));
const branch = computed(() => target.value ? subtree(notebook.value?.nodes ?? [], target.value.id) : new Set<string>());
const folders = computed(() => [
  { value: "", label: label("root") },
  ...directoryRows(notebook.value?.nodes ?? [], true)
    .filter(({ node }) => node.kind === "folder")
    .map(({ node, depth }) => ({ value: node.id, label: `${"　".repeat(depth)}${node.name}` })),
]);

function select(node?: Node) {
  if (!notebook.value) return;
  notebook.value.selectedId = node?.id ?? null;
}

function toggleFolder(node: Node) {
  if (node.kind !== "folder" || !notebook.value) return;
  node.collapsed = !node.collapsed;
  const selectedId = notebook.value.selectedId;
  if (node.collapsed && selectedId && subtree(notebook.value.nodes, node.id).has(selectedId)) {
    notebook.value.selectedId = node.id;
  }
}

async function openDialog(kind: typeof operation.value, item?: Node, parentId?: string | null) {
  if (!notebook.value || !dialog.value) return;
  operation.value = kind;
  targetId.value = item?.id;
  name.value = item?.name ?? label(kind === "folder" ? "newFolder" : "untitled");
  const folder = parentId === undefined ? (item ? item.parentId : currentFolder.value) : parentId;
  destination.value = folder ?? "";
  await nextTick();
  dialog.value?.showModal();
  if (kind !== "delete") {
    nameInput.value?.focus();
    nameInput.value?.select();
  }
}

function rename(id: string, name: string) {
  const node = index.value.get(id);
  if (node) node.name = name;
}

function relocate(id: string, drop: DirectoryDrop) {
  if (notebook.value) moveEntry(notebook.value, id, drop);
}

function revealParent(parentId: string | null) {
  while (parentId) {
    const folder = index.value.get(parentId);
    if (folder?.kind !== "folder") break;
    folder.collapsed = false;
    parentId = folder.parentId;
  }
}

function applyDialog() {
  const state = notebook.value;
  if (!state) return;
  if (operation.value === "delete") {
    if (!target.value) return;
    const parentId = target.value.parentId;
    const deleted = branch.value;
    state.nodes = state.nodes.filter(node => !deleted.has(node.id));
    if (state.selectedId && deleted.has(state.selectedId)) state.selectedId = parentId;
  } else {
    if (!name.value.trim() || !folders.value.some(folder => folder.value === destination.value)) return;
    const parentId = destination.value || null;
    const base = { id: crypto.randomUUID(), name: name.value.trim(), parentId };
    const item: Node = operation.value === "note"
      ? { ...base, kind: "note", markdown: "" }
      : { ...base, kind: "folder", collapsed: false };
    state.nodes.push(item);
    state.selectedId = item.id;
    revealParent(parentId);
  }
  dialog.value?.close();
}

function updateNote(id: string, markdown: string) {
  const item = index.value.get(id);
  if (item?.kind !== "note" || item.markdown === markdown) return;
  item.markdown = markdown;
  track();
}

function fallbackToSource(id: string) {
  if (note.value?.id === id) void switchMode(true);
}

const sourceInput = ref<HTMLTextAreaElement>();
const writingScroll = ref<HTMLElement>();
const liveEditor = ref<InstanceType<typeof NotebookEditor>>();
let pendingScroll: { scroller: HTMLElement; progress: number } | undefined;

function goToHeading(heading: OutlineHeading) {
  if (sourceMode.value) {
    if (sourceInput.value) scrollSourceToHeading(sourceInput.value, heading.offset);
  } else {
    liveEditor.value?.scrollToHeading(heading.index);
  }
}

async function switchMode(active = !sourceMode.value) {
  const scroller = writingScroll.value;
  if (!scroller || active === sourceMode.value) return;
  const previous = sourceMode.value ? sourceInput.value : scroller;
  const range = previous ? previous.scrollHeight - previous.clientHeight : 0;
  // 两种模式的排版高度不同，用各自可滚动范围内的进度衔接。
  const progress = pendingScroll?.scroller === scroller
    ? pendingScroll.progress
    : previous && range > 0 ? previous.scrollTop / range : 0;
  const position = { scroller, progress };
  pendingScroll = position;
  sourceMode.value = active;
  await nextTick();
  if (pendingScroll !== position || writingScroll.value !== scroller) return;

  function restore(target: HTMLElement) {
    if (pendingScroll !== position || writingScroll.value !== scroller) return;
    target.scrollTop = position.progress * Math.max(0, target.scrollHeight - target.clientHeight);
    pendingScroll = undefined;
  }

  if (active) {
    const input = sourceInput.value;
    if (!input) return;
    input.focus({ preventScroll: true });
    restore(input);
  } else {
    liveEditor.value?.focus(() => restore(scroller));
  }
}

useWindowEvent("keydown", event => {
  if (!note.value || dialog.value?.open || event.defaultPrevented || event.isComposing ||
    !event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.code !== "Slash" && event.key !== "/" && event.key !== "?") return;
  event.preventDefault();
  if (!event.repeat) void switchMode();
});
</script>

<template>
  <div v-if="loadState !== 'ready'" class="notice" role="status">
    <span>{{ label(loadState === 'loading' ? 'loading' : 'loadError') }}</span>
    <button v-if="loadState === 'error'" class="btn" @click="retryLoad">{{ label("retry") }}</button>
  </div>
  <div v-else ref="workspace" class="notebook" :class="{ resizing, 'writing-resizing': writingResizing }">
    <Transition name="notebook-sidebar">
      <div v-if="directoryOpen" class="sidebar-frame" :style="{ '--sidebar-width': `${fitted + 1}px` }">
        <div class="sidebar-content">
          <NotebookDirectory v-model:view="sidebarView" :nodes="notebook?.nodes ?? []" :selected-id="notebook?.selectedId ?? null"
            :width="fitted" :can-reveal="canReveal" :has-note="Boolean(note)" :headings="headings"
            @select="select" @toggle="toggleFolder" @add="(kind, parentId) => openDialog(kind, undefined, parentId)"
            @rename="rename" @delete="node => openDialog('delete', node)" @move="relocate" @reveal="revealEntry" @go-to-heading="goToHeading" />
          <div class="directory-resizer" role="separator" tabindex="0" aria-orientation="vertical" :aria-label="label('resizeDirectory')"
            :aria-valuemin="min" :aria-valuemax="max" :aria-valuenow="Math.round(fitted)"
            @pointerdown="start" @pointermove="move" @pointerup="stop($event)" @pointercancel="stop($event, true)"
            @lostpointercapture="stop($event)" @dblclick="width = directoryDefault" @keydown="key" />
        </div>
      </div>
    </Transition>

    <section ref="writingViewport" class="workspace">
      <header class="note-head">
        <h2 :title="selected?.name">{{ selected?.name ?? label("root") }}</h2>
        <button v-if="saveState === 'error'" class="btn small save-error" @click="retrySave">{{ label("saveError") }}</button>
        <span v-else role="status" class="save-state">{{ label(saveState) }}</span>
        <button v-if="selected" class="icon-btn" :title="label('delete')" :aria-label="label('delete')" @click="openDialog('delete', selected)"><Trash2 :size="15" /></button>
      </header>
      <div v-if="note" :key="note.id" class="writing" :style="{ '--writing-width': `${fittedWritingWidth}px` }">
        <div ref="writingScroll" class="writing-scroll" :class="{ 'source-scroll': sourceMode }">
          <textarea v-if="sourceMode" ref="sourceInput" v-model="source" class="source"
            :aria-label="label('source')" :placeholder="label('placeholder')" spellcheck="false" />
          <div v-else class="writing-frame">
            <NotebookEditor ref="liveEditor" :id="note.id" :markdown="note.markdown" @edit="updateNote" @failed="fallbackToSource" />
          </div>
        </div>
        <div class="writing-resizer" role="separator" tabindex="0" aria-orientation="vertical"
          :title="label('resizeWriting')" :aria-label="label('resizeWriting')"
          :aria-valuemin="writingMin" :aria-valuemax="writingMax" :aria-valuenow="Math.round(fittedWritingWidth)"
          @pointerdown="startWritingResize" @pointermove="moveWritingResize" @pointerup="stopWritingResize($event)"
          @pointercancel="stopWritingResize($event, true)" @lostpointercapture="stopWritingResize($event)"
          @dblclick="writingWidth = writingDefault" @keydown="writingResizeKey" />
      </div>
      <div v-else class="notice">
        <FolderOpen :size="28" />
        <span>{{ label(selected ? "folderHint" : "empty") }}</span>
        <button class="btn primary" @click="openDialog('note')"><FilePlus2 :size="15" />{{ label("addNote") }}</button>
      </div>
      <footer class="workspace-actions">
        <button type="button" class="icon-btn" :aria-expanded="directoryOpen" :aria-label="directoryLabel"
          :title="directoryLabel" @click="directoryOpen = !directoryOpen">
          <ChevronLeft v-if="directoryOpen" :size="16" />
          <ChevronRight v-else :size="16" />
        </button>
        <button v-if="note" type="button" class="btn small subtle source-toggle" :aria-label="modeLabel"
          aria-keyshortcuts="Control+/ Control+Shift+/" :title="`${modeLabel} (Ctrl+/)`" @click="switchMode()">
          <CodeXml :size="16" />
          <span v-if="sourceMode">{{ modeLabel }}</span>
        </button>
      </footer>
    </section>
  </div>

  <dialog ref="dialog" class="entry-dialog" :aria-label="dialogLabel">
    <form @submit.prevent="applyDialog">
      <h2>{{ dialogLabel }}</h2>
      <p v-if="operation === 'delete'">{{ t(target?.kind === 'folder' ? 'markdown.notebook.deleteFolder' : 'markdown.notebook.deleteNote', { name: target?.name }) }}</p>
      <template v-else>
        <label>{{ label("name") }}<input ref="nameInput" v-model="name" class="field" required maxlength="120" /></label>
        <div class="destination">
          <span>{{ label("location") }}</span>
          <AppSelect v-model="destination" :options="folders" :teleport-to="dialog" :aria-label="label('location')" />
        </div>
      </template>
      <footer>
        <button type="button" class="btn" :autofocus="operation === 'delete'" @click="dialog?.close()">{{ label("cancel") }}</button>
        <button class="btn" :class="{ primary: operation !== 'delete', destructive: operation === 'delete' }"
          :disabled="operation !== 'delete' && !name.trim()">{{ label(operation === 'delete' ? 'delete' : 'confirm') }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.notebook { display: flex; flex: 1; min-height: 0; min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.sidebar-frame { flex: 0 0 auto; inline-size: var(--sidebar-width); }
.sidebar-content { display: flex; inline-size: var(--sidebar-width); block-size: 100%; }
.notebook-sidebar-enter-active, .notebook-sidebar-leave-active { overflow: clip; transition: inline-size var(--dur-slow) var(--ease-out); }
.notebook-sidebar-leave-active { pointer-events: none; }
.notebook-sidebar-enter-from, .notebook-sidebar-leave-to { inline-size: 0; }
.directory-resizer { position: relative; flex: 0 0 1px; z-index: 1; background: var(--border); cursor: col-resize; touch-action: none; }
.directory-resizer::before { content: ""; position: absolute; inset: 0 -5px; }
.directory-resizer:hover, .directory-resizer:focus-visible, .resizing .directory-resizer { background: var(--accent); outline: 1px solid var(--accent); }
.resizing, .resizing :deep(*), .writing-resizing, .writing-resizing :deep(*) { cursor: col-resize !important; user-select: none !important; }
.workspace { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; }
.workspace-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; padding: 3px 6px; }
.btn.source-toggle { padding-inline: 5px; }
.note-head { display: flex; align-items: center; gap: 4px; height: 46px; flex-shrink: 0; padding: 0 9px 0 14px; border-bottom: 1px solid var(--border); }
.note-head h2 { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; font-size: 14px; font-weight: 600; }
.save-state { color: var(--text-2); font-size: 11px; margin-inline: 4px; white-space: nowrap; }
.save-error, .destructive { color: var(--danger); }
.writing { position: relative; display: flex; flex: 1; min-height: 0; }
.writing-frame { width: min(100%, var(--writing-width)); margin-inline: auto; }
.writing-scroll { flex: 1; min-width: 0; overflow: auto; padding-block: clamp(16px, 4vw, 42px); }
.writing-scroll.source-scroll { overflow: hidden; }
.writing-resizer { position: absolute; inset-inline-start: calc((100% + var(--writing-width)) / 2); top: 50%; width: 18px; height: 48px; margin-top: -24px; display: grid; place-items: center; cursor: col-resize; touch-action: none; }
.writing-resizer::before { content: ""; width: 3px; height: 32px; border-radius: 2px; background: var(--border-strong); }
.writing-resizer:hover::before, .writing-resizer:focus-visible::before, .writing-resizing .writing-resizer::before { background: var(--accent); }
.source { display: block; width: 100%; height: 100%; resize: none; padding: 0 max(0px, calc((100% - var(--writing-width)) / 2)); border: 0; background: var(--surface); color: var(--text); font: 14px/1.7 var(--font-mono); }
.source:focus { outline: none; }
.source::placeholder { color: var(--text-3); }
.notice { display: grid; flex: 1; justify-items: center; align-content: center; gap: 12px; padding: 16px; text-align: center; color: var(--text-2); }
.entry-dialog { width: min(410px, calc(100% - 32px)); padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); box-shadow: var(--shadow-lg); }
.entry-dialog::backdrop { background: var(--modal-scrim); }
.entry-dialog form { display: grid; gap: 14px; }
.entry-dialog h2 { margin: 0; font-size: 17px; }
.entry-dialog p { margin: 0; overflow-wrap: anywhere; }
.entry-dialog label, .destination { display: grid; gap: 5px; min-width: 0; color: var(--text-2); font-size: 13px; }
.entry-dialog footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>
