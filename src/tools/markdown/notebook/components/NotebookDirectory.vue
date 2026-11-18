<script setup lang="ts">
import { computed, nextTick, onDeactivated, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronRight, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from "lucide-vue-next";
import { usePopover } from "@/composables/usePopover";
import { directoryRows, subtree, type DirectoryDrop, type Node } from "../notebook";

const props = defineProps<{ nodes: Node[]; selectedId: string | null; width: number }>();
const emit = defineEmits<{
  select: [node?: Node];
  toggle: [node: Node];
  add: [kind: "note" | "folder", atRoot?: boolean];
  rename: [id: string, name: string];
  delete: [node: Node];
  move: [id: string, drop: DirectoryDrop];
}>();
const { t } = useI18n();
const label = (key: string) => t(`markdown.notebook.${key}`);
const rows = computed(() => directoryRows(props.nodes));
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
      <button class="root" :class="{ current: !selectedId }" @click="emit('select')">{{ label("root") }}</button>
      <button class="icon-btn" :title="label('addFolder')" :aria-label="label('addFolder')" @click="emit('add', 'folder')"><FolderPlus :size="16" /></button>
      <button class="icon-btn" :title="label('addNote')" :aria-label="label('addNote')" @click="emit('add', 'note')"><FilePlus2 :size="16" /></button>
    </header>
    <ul class="directory-list" :class="{ 'drop-root': dropTarget === null }" tabindex="-1"
      @contextmenu.self.prevent="openContext($event)" @dragover.self="dragOver($event)" @dragleave.self="leaveDropZone" @drop.self="drop($event)">
      <li v-for="{ node, depth } in rows" :key="node.id" class="directory-row"
        :class="[{ current: selectedId === node.id, dragging: draggedId === node.id }, dropTarget?.id === node.id && `drop-${dropTarget.position}`]"
        :style="{ paddingInlineStart: `${Math.min(depth, 12) * 13}px` }" :draggable="editingId !== node.id"
        @click="activate(node)" @contextmenu.stop.prevent="openContext($event, node)" @dragstart="startDrag($event, node)" @dragend="finishDrag"
        @dragover.stop="dragOver($event, node)" @dragleave="leaveDropZone" @drop.stop="drop($event, node)">
        <button v-if="node.kind === 'folder'" type="button" class="disclosure" :class="{ expanded: !node.collapsed }"
          :aria-label="label(node.collapsed ? 'expand' : 'collapse')" :aria-expanded="!node.collapsed">
          <ChevronRight :size="13" />
        </button>
        <span v-else class="disclosure" />
        <input v-if="editingId === node.id" v-model="draftName" class="field rename-input" :aria-label="label('name')" maxlength="120"
          @click.stop @keydown="renameKey" @blur="finishRename()" />
        <button v-else type="button" class="entry" :data-entry="node.id" :aria-current="selectedId === node.id ? 'true' : undefined"
          :title="node.name" @dblclick="node.kind === 'note' && beginRename(node)" @keydown="entryKey($event, node)">
          <component :is="node.kind === 'note' ? FileText : node.collapsed ? Folder : FolderOpen" :size="15" />
          <span>{{ node.name }}</span>
        </button>
      </li>
    </ul>
    <Teleport to="body">
      <span ref="menuAnchor" class="context-anchor" :style="menuPosition" aria-hidden="true" />
      <div v-if="menuOpen" ref="menuPanel" class="directory-menu" :style="menuStyle" role="menu" @keydown="menuKey">
        <template v-if="menuNode">
          <button role="menuitem" @click="beginRename(menuNode)"><Pencil :size="14" />{{ label("rename") }}</button>
          <button role="menuitem" @click="closeMenu(); emit('delete', menuNode)"><Trash2 :size="14" />{{ label("delete") }}</button>
        </template>
        <template v-else>
          <button role="menuitem" @click="closeMenu(); emit('add', 'folder', true)"><FolderPlus :size="15" />{{ label("addFolder") }}</button>
          <button role="menuitem" @click="closeMenu(); emit('add', 'note', true)"><FilePlus2 :size="15" />{{ label("addNote") }}</button>
        </template>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.directory { display: flex; flex: 0 0 auto; flex-direction: column; min-width: 0; min-height: 0; background: var(--surface); }
.directory-head { display: flex; align-items: center; gap: 4px; height: 46px; flex-shrink: 0; padding: 0 10px; border-bottom: 1px solid var(--border); }
.root { flex: 1; min-width: 0; text-align: start; border: 0; border-radius: 5px; padding: 5px 6px; font: inherit; font-weight: 600; color: var(--text-2); background: none; cursor: pointer; }
.root:hover, .directory-row:hover { background: var(--hover); }
.root.current, .directory-row.current { color: var(--accent); background: var(--accent-soft); }
.directory-list { flex: 1; min-height: 0; margin: 0; padding: 7px 6px 28px; list-style: none; overflow: auto; }
.directory-list.drop-root { outline: 1px solid var(--accent); outline-offset: -1px; }
.directory-row { display: flex; align-items: center; border-radius: 5px; border-block: 1px solid transparent; cursor: pointer; }
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
