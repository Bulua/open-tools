<script setup lang="ts">
import { computed, nextTick, onDeactivated, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronRight, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from "lucide-vue-next";
import { usePopover } from "@/composables/usePopover";
import { directoryRows, subtree, type DirectoryDrop, type Node } from "../notebook";
import type { OutlineHeading } from "../outline";

const props = defineProps<{
  nodes: Node[]; selectedId: string | null; width: number; canReveal?: boolean;
  hasNote?: boolean; headings?: OutlineHeading[];
}>();
const view = defineModel<"files" | "outline">("view", { default: "files" });
const emit = defineEmits<{
  select: [node: Node];
  toggle: [node: Node];
  addNote: [parentId: string | null];
  addFolder: [parentId: string | null];
  rename: [id: string, name: string];
  delete: [node: Node];
  move: [id: string, drop: DirectoryDrop];
  reveal: [id: string];
  goToHeading: [heading: OutlineHeading];
}>();
const { t } = useI18n();
const label = (key: string) => t(`markdown.notebook.${key}`);
const rows = computed(() => directoryRows(props.nodes));
const outlineBase = computed(() => props.headings?.reduce((base, heading) => Math.min(base, heading.depth), 6) ?? 6);
const directory = ref<HTMLElement>();
const menuAnchor = ref<HTMLElement>();
const menuPanel = ref<HTMLElement>();
const menuPosition = ref({ left: "0px", top: "0px" });
const menuNode = ref<Node>();
const returnFocus = ref<HTMLElement>();
const { open: menuOpen, style: menuStyle, show: showMenu, close: closeMenu } =
  usePopover(menuAnchor, menuPanel, { minWidth: 162, maxHeight: 76 });

function activate(node: Node) {
  emit("select", node);
  if (node.kind === "folder") emit("toggle", node);
}

function displayName(node: Node) {
  return node.kind === "note" && !/\.md$/i.test(node.name) ? `${node.name}.md` : node.name;
}

function showView(next: typeof view.value) {
  closeMenu();
  finishDrag();
  view.value = next;
}

async function openContext(event: MouseEvent, node?: Node) {
  closeMenu();
  const origin = (event.target as HTMLElement).closest<HTMLElement>("button") ??
    directory.value?.querySelector<HTMLElement>(".directory-list");
  returnFocus.value = origin ?? undefined;
  menuNode.value = node;
  const rect = origin?.getBoundingClientRect();
  menuPosition.value = { left: `${event.clientX || rect?.left || 0}px`, top: `${event.clientY || rect?.bottom || 0}px` };
  await nextTick();
  await showMenu();
  menuPanel.value?.querySelector("button")?.focus();
}

function menuKey(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeMenu();
    returnFocus.value?.focus();
  } else if (event.key === "Tab") {
    closeMenu();
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const buttons = [...(menuPanel.value?.querySelectorAll("button") ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
}

const editingId = ref<string>();
const draftName = ref("");
defineExpose({ beginRename });

async function beginRename(node: Node) {
  closeMenu();
  if (editingId.value && editingId.value !== node.id) finishRename();
  draftName.value = node.name;
  editingId.value = node.id;
  await nextTick();
  const input = directory.value?.querySelector<HTMLInputElement>(".rename-input");
  input?.focus();
  input?.select();
}

function finishRename(cancel = false, restoreFocus = false) {
  const id = editingId.value;
  if (!id) return;
  editingId.value = undefined;
  if (!cancel && draftName.value.trim()) emit("rename", id, draftName.value.trim());
  if (restoreFocus) void nextTick(() => {
    focusEntry(id);
  });
}

function focusEntry(id: string) {
  const entries = directory.value?.querySelectorAll<HTMLButtonElement>("[data-entry]") ?? [];
  Array.from(entries).find(entry => entry.dataset.entry === id)?.focus();
}

function renameKey(event: KeyboardEvent) {
  if (event.isComposing || (event.key !== "Enter" && event.key !== "Escape")) return;
  event.preventDefault();
  finishRename(event.key === "Escape", true);
}

function entryKey(event: KeyboardEvent, node: Node) {
  if (event.key === "F2") {
    event.preventDefault();
    void beginRename(node);
  } else if (event.key === "Delete") {
    event.preventDefault();
    emit("delete", node);
  } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && node.kind === "folder") {
    if (node.collapsed === (event.key === "ArrowRight")) emit("toggle", node);
    event.preventDefault();
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    const index = rows.value.findIndex(row => row.node.id === node.id);
    const next = rows.value[index + (event.key === "ArrowDown" ? 1 : -1)]?.node;
    if (next) focusEntry(next.id);
  }
}

const draggedId = ref<string>();
const dragBranch = computed(() => draggedId.value ? subtree(props.nodes, draggedId.value) : new Set<string>());
const dropTarget = ref<DirectoryDrop>();

function startDrag(event: DragEvent, node: Node) {
  if (!event.dataTransfer || editingId.value === node.id) return;
  closeMenu();
  draggedId.value = node.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-open-tools-notebook-entry", node.id);
}

function dragOver(event: DragEvent, node?: Node) {
  dropTarget.value = undefined;
  if (!draggedId.value || (node && dragBranch.value.has(node.id))) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  if (!node) {
    dropTarget.value = null;
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
  const position = node.kind === "folder" && ratio >= 0.25 && ratio <= 0.75
    ? "inside"
    : ratio < 0.5 ? "before" : "after";
  dropTarget.value = { id: node.id, position };
}

function leaveDropZone(event: DragEvent) {
  const next = event.relatedTarget;
  if (next instanceof globalThis.Node && (event.currentTarget as HTMLElement).contains(next)) return;
  dropTarget.value = undefined;
}

function finishDrag() {
  draggedId.value = undefined;
  dropTarget.value = undefined;
}

function drop(event: DragEvent, node?: Node) {
  if (!draggedId.value) return;
  event.preventDefault();
  const target = dropTarget.value;
  if (target !== undefined && (target?.id ?? null) === (node?.id ?? null)) {
    emit("move", draggedId.value, target);
  }
  finishDrag();
}

onDeactivated(() => { closeMenu(); finishDrag(); });
</script>

<template>
  <aside ref="directory" class="directory" :style="{ flexBasis: `${width}px` }" :aria-label="label('directory')">
    <header class="directory-head">
      <div class="seg fill" role="group" :aria-label="label('directory')">
        <button type="button" :class="{ on: view === 'files' }" :aria-pressed="view === 'files'" @click="showView('files')">{{ label("files") }}</button>
        <button type="button" :class="{ on: view === 'outline' }" :aria-pressed="view === 'outline'" @click="showView('outline')">{{ label("outline") }}</button>
      </div>
    </header>
    <TransitionGroup v-show="view === 'files'" tag="ul" name="directory-fold" class="directory-list"
      :class="{ 'drop-root': dropTarget === null }" tabindex="-1"
      @contextmenu.self.prevent="openContext($event)" @dragover.self="dragOver($event)" @dragleave.self="leaveDropZone" @drop.self="drop($event)">
      <li v-for="{ node, depth } in rows" :key="node.id" class="directory-row"
        :class="[{ current: selectedId === node.id, dragging: draggedId === node.id }, dropTarget?.id === node.id && `drop-${dropTarget.position}`]"
        :style="{ paddingInlineStart: `${Math.min(depth, 12) * 13}px` }" :draggable="editingId !== node.id"
        @click="activate(node)" @contextmenu.stop.prevent="openContext($event, node)" @dragstart="startDrag($event, node)" @dragend="finishDrag"
        @dragover.stop="dragOver($event, node)" @dragleave="leaveDropZone" @drop.stop="drop($event, node)">
        <div class="directory-row-content">
          <button v-if="node.kind === 'folder'" type="button" class="disclosure" :class="{ expanded: !node.collapsed }"
            :aria-label="label(node.collapsed ? 'expand' : 'collapse')" :aria-expanded="!node.collapsed">
            <ChevronRight :size="13" />
          </button>
          <span v-else class="disclosure" />
          <input v-if="editingId === node.id" v-model="draftName" class="field rename-input" :aria-label="label('name')" maxlength="120"
            @click.stop @keydown="renameKey" @blur="finishRename()" />
          <button v-else type="button" class="entry" :data-entry="node.id" :aria-current="selectedId === node.id ? 'true' : undefined"
            :title="displayName(node)" @dblclick="node.kind === 'note' && beginRename(node)" @keydown="entryKey($event, node)">
            <component :is="node.kind === 'note' ? FileText : node.collapsed ? Folder : FolderOpen" :size="15" />
            <span>{{ displayName(node) }}</span>
          </button>
        </div>
      </li>
    </TransitionGroup>
    <template v-if="view === 'outline'">
      <ul v-if="headings?.length" class="directory-list" :aria-label="label('outline')">
        <li v-for="heading in headings" :key="heading.index"
          :style="{ paddingInlineStart: `${(heading.depth - outlineBase) * 12}px` }">
          <button type="button" class="btn small subtle outline-entry" :title="heading.title" @click="emit('goToHeading', heading)">
            <span>{{ heading.title }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="outline-empty">{{ label(hasNote ? "noHeadings" : "noNoteForOutline") }}</p>
    </template>
    <Teleport to="body">
      <span ref="menuAnchor" class="context-anchor" :style="menuPosition" aria-hidden="true" />
      <div v-if="menuOpen" ref="menuPanel" class="directory-menu" :style="menuStyle" role="menu" @keydown="menuKey">
        <template v-if="menuNode">
          <button v-if="canReveal" role="menuitem" @click="closeMenu(); returnFocus?.focus(); emit('reveal', menuNode.id)">
            <FolderOpen :size="14" />{{ label("reveal") }}
          </button>
          <template v-if="menuNode.kind === 'folder'">
            <button role="menuitem" @click="closeMenu(); emit('addFolder', menuNode.id)"><FolderPlus :size="15" />{{ label("addFolder") }}</button>
            <button role="menuitem" @click="closeMenu(); emit('addNote', menuNode.id)"><FilePlus2 :size="15" />{{ label("addNote") }}</button>
          </template>
          <button role="menuitem" @click="beginRename(menuNode)"><Pencil :size="14" />{{ label("rename") }}</button>
          <button role="menuitem" @click="closeMenu(); emit('delete', menuNode)"><Trash2 :size="14" />{{ label("delete") }}</button>
        </template>
        <template v-else>
          <button role="menuitem" @click="closeMenu(); emit('addFolder', null)"><FolderPlus :size="15" />{{ label("addFolder") }}</button>
          <button role="menuitem" @click="closeMenu(); emit('addNote', null)"><FilePlus2 :size="15" />{{ label("addNote") }}</button>
        </template>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.directory { display: flex; flex: 0 0 auto; flex-direction: column; min-width: 0; min-height: 0; background: var(--surface); }
.directory-head { display: grid; align-items: center; height: 46px; flex-shrink: 0; padding: 0 8px; border-bottom: 1px solid var(--border); }
.directory-head .seg button { min-width: 0; padding-inline: 4px; overflow: hidden; text-overflow: ellipsis; }
.directory-row:hover { background: var(--hover); }
.directory-row.current { color: var(--accent); background: var(--accent-soft); }
.outline-entry { width: 100%; }
.outline-entry span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.outline-empty { margin: 12px; color: var(--text-2); font-size: 12px; }
.directory-list { flex: 1; min-height: 0; margin: 0; padding: 7px 6px 28px; list-style: none; overflow: auto; }
.directory-list.drop-root { outline: 1px solid var(--accent); outline-offset: -1px; }
.directory-row { display: grid; grid-template-rows: 1fr; border-radius: 5px; border-block: 1px solid transparent; cursor: pointer; }
.directory-row-content { display: flex; align-items: center; min-width: 0; min-height: 0; }
.directory-fold-enter-active, .directory-fold-leave-active {
  transition: grid-template-rows var(--dur) var(--ease-out), border-block-width var(--dur) var(--ease-out);
}
.directory-fold-enter-active .directory-row-content, .directory-fold-leave-active .directory-row-content { overflow: clip; }
.directory-fold-leave-active { pointer-events: none; }
.directory-fold-enter-from, .directory-fold-leave-to { grid-template-rows: 0fr; border-block-width: 0; }
.directory-row.drop-before { border-top-color: var(--accent); }
.directory-row.drop-after { border-bottom-color: var(--accent); }
.directory-row.drop-inside { background: var(--accent-soft); outline: 1px solid var(--accent); outline-offset: -1px; }
.directory-row.dragging { color: var(--text-3); }
.entry, .disclosure { display: flex; align-items: center; border: 0; background: none; color: inherit; }
.entry { flex: 1; gap: 6px; min-width: 0; min-height: 33px; text-align: start; font: inherit; font-size: 13px; padding: 4px 6px 4px 2px; cursor: pointer; }
.entry > svg { flex-shrink: 0; }
.entry > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.disclosure { flex: 0 0 21px; justify-content: center; height: 29px; padding: 0; }
button.disclosure { cursor: pointer; }
.disclosure > svg { transition: transform var(--dur-fast) var(--ease-out); }
.disclosure.expanded > svg { transform: rotate(90deg); }
.rename-input { flex: 1; min-width: 0; height: 29px; margin: 2px 5px 2px 0; padding-inline: 6px; font-size: 13px; }
.context-anchor { position: fixed; width: 0; height: 0; pointer-events: none; }
.directory-menu { position: fixed; z-index: 300; padding: 4px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); box-shadow: var(--shadow-lg); }
.directory-menu button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 0 10px; border: 0; border-radius: 5px; background: none; color: var(--text); text-align: start; font-size: 12px; cursor: pointer; }
.directory-menu button:hover, .directory-menu button:focus-visible { background: var(--hover); outline: none; }
@media (prefers-reduced-motion: reduce) { .disclosure > svg { transition: none; } }
</style>
