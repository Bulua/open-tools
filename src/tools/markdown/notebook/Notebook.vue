<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Download, FilePlus2, FolderOpen, PanelLeft, Trash2 } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import ToolActions from "@/components/tool/ToolActions.vue";
import { useToolUsage } from "@/composables/useToolUsage";
import { usePanelResize } from "@/composables/usePanelResize";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { showError } from "@/utils/errorToast";
import { saveFile } from "@/utils/saveFile";
import NotebookEditor from "./components/NotebookEditor.vue";
import NotebookDirectory from "./components/NotebookDirectory.vue";
import { directoryRows, moveEntry, subtree, type DirectoryDrop, type Node } from "./notebook";
import { useNotebook } from "./storage";

const { t } = useI18n();
const label = (key: string) => t(`markdown.notebook.${key}`);
const { notebook, loadState, saveState, retryLoad, retrySave } = useNotebook();
const { track } = useToolUsage();
const directoryOpen = ref(true);
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
const index = computed(() => new Map(notebook.value?.nodes.map(node => [node.id, node])));
const selected = computed(() => index.value.get(notebook.value?.selectedId ?? ""));
const note = computed(() => selected.value?.kind === "note" ? selected.value : undefined);
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

async function openDialog(kind: typeof operation.value, item?: Node, atRoot = false) {
  if (!notebook.value || !dialog.value) return;
  operation.value = kind;
  targetId.value = item?.id;
  name.value = item?.name ?? label(kind === "folder" ? "newFolder" : "untitled");
  destination.value = (atRoot ? null : item ? item.parentId : currentFolder.value) ?? "";
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
  if (note.value?.id === id) sourceMode.value = true;
}

const sourceInput = ref<HTMLTextAreaElement>();
const liveEditor = ref<InstanceType<typeof NotebookEditor>>();
watch(sourceMode, active => {
  if (active) sourceInput.value?.focus();
  else liveEditor.value?.focus();
}, { flush: "post" });

useWindowEvent("keydown", event => {
  if (!note.value || dialog.value?.open || event.defaultPrevented || event.isComposing ||
    !event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.code !== "Slash" && event.key !== "/" && event.key !== "?") return;
  event.preventDefault();
  if (!event.repeat) sourceMode.value = !sourceMode.value;
});

async function exportNote() {
  const item = note.value;
  if (!item) return;
  const name = item.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "") || label("untitled");
  try {
    await saveFile(new TextEncoder().encode(item.markdown), `${name.replace(/\.md$/i, "")}.md`);
  } catch (error) {
    showError(error);
  }
}
</script>

<template>
  <ToolActions>
    <button class="btn" :aria-pressed="directoryOpen" :title="label('directory')" @click="directoryOpen = !directoryOpen">
      <PanelLeft :size="15" />{{ label("directory") }}
    </button>
    <div v-if="note" class="seg" :aria-label="label('editor')">
      <button :class="{ on: !sourceMode }" :aria-pressed="!sourceMode" @click="sourceMode = false">{{ label("live") }}</button>
      <button :class="{ on: sourceMode }" :aria-pressed="sourceMode" aria-keyshortcuts="Control+/ Control+Shift+/"
        :title="`${label('source')} (Ctrl+/)`" @click="sourceMode = true">{{ label("source") }}</button>
    </div>
    <button v-if="note" class="btn" @click="exportNote"><Download :size="15" />{{ label("export") }}</button>
  </ToolActions>

  <div v-if="loadState !== 'ready'" class="notice" role="status">
    <span>{{ label(loadState === 'loading' ? 'loading' : 'loadError') }}</span>
    <button v-if="loadState === 'error'" class="btn" @click="retryLoad">{{ label("retry") }}</button>
  </div>
  <div v-else ref="workspace" class="notebook" :class="{ resizing, 'writing-resizing': writingResizing }">
    <template v-if="directoryOpen">
      <NotebookDirectory :nodes="notebook?.nodes ?? []" :selected-id="notebook?.selectedId ?? null" :width="fitted"
        @select="select" @toggle="toggleFolder" @add="(kind, atRoot) => openDialog(kind, undefined, atRoot)"
        @rename="rename" @delete="node => openDialog('delete', node)" @move="relocate" />
      <div class="directory-resizer" role="separator" tabindex="0" aria-orientation="vertical" :aria-label="label('resizeDirectory')"
        :aria-valuemin="min" :aria-valuemax="max" :aria-valuenow="Math.round(fitted)"
        @pointerdown="start" @pointermove="move" @pointerup="stop($event)" @pointercancel="stop($event, true)"
        @lostpointercapture="stop($event)" @dblclick="width = directoryDefault" @keydown="key" />
    </template>

    <section ref="writingViewport" class="workspace">
      <header class="note-head">
        <h2 :title="selected?.name">{{ selected?.name ?? label("root") }}</h2>
        <button v-if="saveState === 'error'" class="btn small save-error" @click="retrySave">{{ label("saveError") }}</button>
        <span v-else role="status" class="save-state">{{ label(saveState) }}</span>
        <button v-if="selected" class="icon-btn" :title="label('delete')" :aria-label="label('delete')" @click="openDialog('delete', selected)"><Trash2 :size="15" /></button>
      </header>
      <div v-if="note" :key="note.id" class="writing">
        <div class="writing-frame" :style="{ width: `${fittedWritingWidth}px` }">
          <div class="writing-scroll">
            <textarea v-if="sourceMode" ref="sourceInput" v-model="source" class="source"
              :aria-label="label('source')" :placeholder="label('placeholder')" spellcheck="false" />
            <NotebookEditor v-else ref="liveEditor" :id="note.id" :markdown="note.markdown" @edit="updateNote" @failed="fallbackToSource" />
          </div>
          <div class="writing-resizer" role="separator" tabindex="0" aria-orientation="vertical"
            :title="label('resizeWriting')" :aria-label="label('resizeWriting')"
            :aria-valuemin="writingMin" :aria-valuemax="writingMax" :aria-valuenow="Math.round(fittedWritingWidth)"
            @pointerdown="startWritingResize" @pointermove="moveWritingResize" @pointerup="stopWritingResize($event)"
            @pointercancel="stopWritingResize($event, true)" @lostpointercapture="stopWritingResize($event)"
            @dblclick="writingWidth = writingDefault" @keydown="writingResizeKey" />
        </div>
      </div>
      <div v-else class="notice">
        <FolderOpen :size="28" />
        <span>{{ label(selected ? "folderHint" : "empty") }}</span>
        <button class="btn primary" @click="openDialog('note')"><FilePlus2 :size="15" />{{ label("addNote") }}</button>
      </div>
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
.directory-resizer { position: relative; flex: 0 0 1px; z-index: 1; background: var(--border); cursor: col-resize; touch-action: none; }
.directory-resizer::before { content: ""; position: absolute; inset: 0 -5px; }
.directory-resizer:hover, .directory-resizer:focus-visible, .resizing .directory-resizer { background: var(--accent); outline: 1px solid var(--accent); }
.resizing, .resizing :deep(*), .writing-resizing, .writing-resizing :deep(*) { cursor: col-resize !important; user-select: none !important; }
.workspace { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; }
.note-head { display: flex; align-items: center; gap: 4px; height: 46px; flex-shrink: 0; padding: 0 9px 0 14px; border-bottom: 1px solid var(--border); }
.note-head h2 { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; font-size: 14px; font-weight: 600; }
.save-state { color: var(--text-2); font-size: 11px; margin-inline: 4px; white-space: nowrap; }
.save-error, .destructive { color: var(--danger); }
.writing { display: flex; flex: 1; justify-content: center; min-height: 0; }
.writing-frame { position: relative; display: flex; min-width: 0; }
.writing-scroll { flex: 1; min-width: 0; overflow: auto; padding-block: clamp(16px, 4vw, 42px); }
.writing-resizer { position: absolute; inset-inline-start: 100%; top: 50%; width: 18px; height: 48px; margin-top: -24px; display: grid; place-items: center; cursor: col-resize; touch-action: none; }
.writing-resizer::before { content: ""; width: 3px; height: 32px; border-radius: 2px; background: var(--border-strong); }
.writing-resizer:hover::before, .writing-resizer:focus-visible::before, .writing-resizing .writing-resizer::before { background: var(--accent); }
.source { display: block; width: 100%; height: 100%; resize: none; padding: 0; border: 0; background: var(--surface); color: var(--text); font: 14px/1.7 var(--font-mono); }
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
