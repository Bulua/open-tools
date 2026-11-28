<script setup lang="ts">
import { computed, nextTick, onDeactivated, ref, watch } from "vue";
import { closePanelDialog, vPanelDismiss } from "@/utils/panelDialog";
import { useI18n } from "vue-i18n";
import { ChevronRight, Folder, FolderOpen, FolderPlus, Pencil, Plus, Radio, Trash2 } from "lucide-vue-next";
import { usePopover } from "@/composables/usePopover";
import { usePanelResize } from "@/composables/usePanelResize";
import MqttSession from "./components/MqttSession.vue";
import { canMove, descendants, moveNode, removeNode, useMqttTree, visibleRows, type SessionNode, type TreeNode } from "./workspace";
import { connectionAddress } from "./mqtt";
import { createDraft, type MqttDraft } from "./draft";

const { t } = useI18n();
const tree = useMqttTree();
const selectedId = ref(tree.value.activeId);
const visited = ref(new Set(tree.value.activeId ? [tree.value.activeId] : []));
watch(
  () => tree.value,
  (next) => {
    if (next.activeId) visited.value.add(next.activeId);
    if (!selectedId.value || !next.nodes.some((node) => node.id === selectedId.value)) {
      selectedId.value = next.activeId;
    }
  },
);
const pending = ref<SessionNode>();
const statuses = ref<Record<string, string>>({});
const selected = computed(() => tree.value.nodes.find(node => node.id === selectedId.value));
const sessions = computed(() => [...tree.value.nodes.filter((node): node is SessionNode => node.kind === "session" && visited.value.has(node.id)), ...(pending.value ? [pending.value] : [])]);
const rows = computed(() => visibleRows(tree.value.nodes));
const workspaceElement = ref<HTMLElement>();
const {
  width: directoryWidth, max: widthLimit, fitted: fittedWidth, resizing,
  start: startResize, move: resizeDirectory, stop: stopResize, key: resizeKey,
} = usePanelResize(workspaceElement, {
  storageKey: "mqtt.directoryWidth", initial: 280, available: 900,
  bounds: available => ({ min: 160, max: Math.max(160, Math.min(600, available - 320, available * 0.65)) }),
});
onDeactivated(() => closeMenu());
const menuAnchor = ref<HTMLElement>();
const menuPanel = ref<HTMLElement>();
const menuPosition = ref({ left: "0px", top: "0px" });
const menuKind = ref<"node" | "blank">("blank");
const { open: menuOpen, style: menuStyle, show: showMenu, close: closeMenu } = usePopover(menuAnchor, menuPanel, { minWidth: 160, maxHeight: 150 });
const openContext = async (event: MouseEvent, node?: TreeNode) => {
  event.preventDefault(); closeMenu();
  selectedId.value = node?.id ?? "";
  menuKind.value = node ? "node" : "blank";
  menuPosition.value = { left: `${event.clientX}px`, top: `${event.clientY}px` };
  await nextTick(); await showMenu();
  menuPanel.value?.querySelector<HTMLButtonElement>("button")?.focus();
};
const menuKey = (event: KeyboardEvent) => {
  if (event.key === "Escape" || event.key === "Tab") {
    closeMenu();
    if (event.key === "Escape") { event.preventDefault(); treeElement.value?.querySelector<HTMLElement>('[tabindex="0"]')?.focus(); }
    return;
  }
  const buttons = [...(menuPanel.value?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault(); buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
};
const treeElement = ref<HTMLElement>();
const editingId = ref("");
const editName = ref("");
const beginRename = async (node = selected.value) => {
  if (!node) return;
  editingId.value = node.id; editName.value = node.name;
  await nextTick(); const input = treeElement.value?.querySelector<HTMLInputElement>("input"); input?.focus(); input?.select();
};
const finishRename = () => {
  const node = tree.value.nodes.find(item => item.id === editingId.value);
  if (node && editName.value.trim()) node.name = editName.value.trim();
  editingId.value = "";
};
const select = (node: TreeNode) => {
  pending.value = undefined;
  selectedId.value = node.id;
  if (node.kind === "session") { tree.value.activeId = node.id; visited.value.add(node.id); }
};
const add = async (kind: "folder" | "session") => {
  const parentId = selected.value?.kind === "folder" ? selected.value.id : selected.value?.parentId ?? null;
  const id = crypto.randomUUID();
  if (kind === "session") {
    pending.value = { id, name: "", parentId, kind, draft: createDraft() };
    return;
  }
  const baseName = t("network.mqtt.newFolder");
  let name = baseName;
  for (let i = 2; tree.value.nodes.some(node => node.parentId === parentId && node.name === name); i++) name = `${baseName} ${i}`;
  const base = { id, name, parentId };
  const node: TreeNode = { ...base, kind, collapsed: false };
  const parent = tree.value.nodes.find(item => item.id === parentId);
  if (parent?.kind === "folder") parent.collapsed = false;
  tree.value.nodes.push(node); select(node); await beginRename(node);
};
const saveConnection = (name: string, draft: MqttDraft) => {
  const candidate = pending.value;
  if (!candidate) return;
  const node: SessionNode = { ...candidate, name, draft, parentId: tree.value.nodes.some(item => item.id === candidate.parentId && item.kind === "folder") ? candidate.parentId : null };
  const parent = tree.value.nodes.find(item => item.id === node.parentId);
  if (parent?.kind === "folder") parent.collapsed = false;
  tree.value.nodes.push(node);
  select(node);
};
const updateStatus = (id: string, status: string) => {
  if (tree.value.nodes.some(node => node.id === id)) statuses.value[id] = status;
};
const renameConnection = (id: string, name: string) => {
  const node = tree.value.nodes.find(item => item.id === id);
  if (node?.kind === "session" && name.trim()) node.name = name.trim();
};
const updateDraft = (id: string, draft: MqttDraft) => {
  const node = tree.value.nodes.find(item => item.id === id);
  if (node?.kind === "session") node.draft = draft;
};
const deleteDialog = ref<HTMLDialogElement>();
const deletingId = ref("");
const deletePrompt = ref({ name: "", n: 0 });
onDeactivated(() => closePanelDialog(deleteDialog.value, true));
const performDelete = () => {
  if (!deletingId.value) return;
  const removed = descendants(tree.value.nodes, deletingId.value);
  removeNode(tree.value, deletingId.value);
  for (const id of removed) { visited.value.delete(id); delete statuses.value[id]; }
  if (tree.value.activeId) visited.value.add(tree.value.activeId);
  selectedId.value = tree.value.activeId; deletingId.value = ""; closePanelDialog(deleteDialog.value);
};
const requestDelete = () => {
  if (!selected.value) return;
  deletingId.value = selected.value.id;
  const ids = descendants(tree.value.nodes, deletingId.value);
  if (selected.value.kind !== "folder" || ids.size <= 1) {
    performDelete();
    return;
  }
  deletePrompt.value = { name: selected.value.name, n: tree.value.nodes.filter(node => node.kind === "session" && ids.has(node.id)).length };
  deleteDialog.value?.showModal();
};
const draggingId = ref("");
const dropId = ref("");
const dropMode = ref<"before" | "inside" | "after">("inside");
const dragOver = (event: DragEvent, node: TreeNode) => {
  if (!draggingId.value || draggingId.value === node.id) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / rect.height;
  const mode = ratio < 0.25 ? "before" : ratio > 0.75 || node.kind === "session" ? "after" : "inside";
  if (!canMove(tree.value.nodes, draggingId.value, mode === "inside" ? node.id : node.parentId)) return;
  event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  dropId.value = node.id; dropMode.value = mode;
};
const dragEnd = () => { draggingId.value = ""; dropId.value = ""; };
const drop = (event: DragEvent, node?: TreeNode) => {
  event.preventDefault(); event.stopPropagation();
  if (!draggingId.value) return;
  if (!node) moveNode(tree.value, draggingId.value, null);
  else if (dropId.value === node.id) {
    if (dropMode.value === "inside") moveNode(tree.value, draggingId.value, node.id);
    else {
      const siblings = tree.value.nodes.filter(item => item.parentId === node.parentId && item.id !== draggingId.value);
      const nextId = dropMode.value === "before" ? node.id : siblings[siblings.findIndex(item => item.id === node.id) + 1]?.id ?? "";
      moveNode(tree.value, draggingId.value, node.parentId, nextId);
    }
  }
  dragEnd();
};
const keydown = async (event: KeyboardEvent, node: TreeNode) => {
  if (editingId.value) return;
  if (event.key === "F2") { event.preventDefault(); await beginRename(node); return; }
  if (event.key === "Delete") { event.preventDefault(); select(node); requestDelete(); return; }
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(node); if (node.kind === "folder") node.collapsed = !node.collapsed; return; }
  let target: TreeNode | undefined;
  const index = rows.value.findIndex(row => row.node.id === node.id);
  if (event.key === "ArrowDown") target = rows.value[index + 1]?.node;
  if (event.key === "ArrowUp") target = rows.value[index - 1]?.node;
  if (event.key === "ArrowRight" && node.kind === "folder") { if (node.collapsed) node.collapsed = false; else target = tree.value.nodes.find(item => item.parentId === node.id); }
  if (event.key === "ArrowLeft") { if (node.kind === "folder" && !node.collapsed) node.collapsed = true; else target = tree.value.nodes.find(item => item.id === node.parentId); }
  if (event.key.startsWith("Arrow")) { event.preventDefault(); if (target) select(target); await nextTick(); treeElement.value?.querySelector<HTMLElement>('[tabindex="0"]')?.focus(); }
};
</script>

<template>
  <div ref="workspaceElement" class="mqtt-workspace" :class="{ resizing }">
    <aside class="directory" :style="{ flexBasis: `${fittedWidth}px` }" @contextmenu.prevent="openContext($event)">
      <header class="directory-head"><span>{{ t("network.mqtt.sessions") }}</span><div>
        <button class="icon-btn" :title="t('network.mqtt.newFolder')" :aria-label="t('network.mqtt.newFolder')" @click="add('folder')"><FolderPlus :size="15" /></button>
        <button class="icon-btn" :title="t('network.mqtt.newSession')" :aria-label="t('network.mqtt.newSession')" @click="add('session')"><Plus :size="15" /></button>
      </div></header>
      <div ref="treeElement" class="directory-tree" role="tree" :aria-label="t('network.mqtt.sessions')" @click.self="selectedId = ''; closeMenu()" @dragover.self.prevent @drop.self="drop($event)">
        <TransitionGroup name="mqtt-tree">
        <div v-for="{ node, depth } in rows" :key="node.id" class="tree-row" :class="{ selected: !pending && selectedId === node.id, current: !pending && tree.activeId === node.id, ['drop-' + dropMode]: dropId === node.id }" :style="{ paddingInlineStart: `${8 + depth * 16}px` }" role="treeitem" :aria-level="depth + 1" :aria-selected="!pending && selectedId === node.id" :aria-expanded="node.kind === 'folder' ? !node.collapsed : undefined" :tabindex="selectedId === node.id || (!selectedId && node.id === rows[0]?.node.id) ? 0 : -1" :draggable="editingId !== node.id" @click="select(node)" @contextmenu.stop.prevent="openContext($event, node)" @dblclick="beginRename(node)" @keydown="keydown($event, node)" @dragstart="draggingId = node.id; $event.dataTransfer?.setData('text/plain', node.id)" @dragend="dragEnd" @dragover.stop="dragOver($event, node)" @dragleave="dropId === node.id && (dropId = '')" @drop="drop($event, node)">
          <button v-if="node.kind === 'folder'" class="folder-toggle icon-btn" :aria-label="t(node.collapsed ? 'network.mqtt.expandFolder' : 'network.mqtt.collapseFolder')" @click.stop="select(node); node.collapsed = !node.collapsed"><ChevronRight :size="12" :class="{ expanded: !node.collapsed }" /></button>
          <span v-else class="tree-spacer" />
          <Folder v-if="node.kind === 'folder' && node.collapsed" :size="15" /><FolderOpen v-else-if="node.kind === 'folder'" :size="15" /><Radio v-else :size="14" />
          <input v-if="editingId === node.id" v-model="editName" class="field rename-input" :aria-label="t('network.mqtt.nodeName')" maxlength="100" @click.stop @keydown.stop @keydown.enter.prevent="finishRename" @keydown.escape.prevent="editingId = ''" @blur="finishRename" />
          <span v-else class="node-label"><span class="node-name" :title="node.name">{{ node.name }}</span><small v-if="node.kind === 'session'">{{ connectionAddress(node.draft.config) }}</small></span>
          <span v-if="statuses[node.id] === 'connected'" class="connection-dot" :title="t('network.mqtt.connected')" />
        </div>
        </TransitionGroup>
      </div>
    </aside>
    <div class="directory-resizer" role="separator" tabindex="0" aria-orientation="vertical" :aria-label="t('network.mqtt.resizeDirectory')" :aria-valuemin="160" :aria-valuemax="Math.round(widthLimit)" :aria-valuenow="Math.round(fittedWidth)" @pointerdown="startResize" @pointermove="resizeDirectory" @pointerup="stopResize($event)" @pointercancel="stopResize($event, true)" @lostpointercapture="stopResize($event)" @dblclick="directoryWidth = 280" @keydown="resizeKey" />
    <main class="session-area">
      <MqttSession v-for="session in sessions" v-show="pending ? pending.id === session.id : tree.activeId === session.id" :key="session.id" :session="session" :active="pending ? pending.id === session.id : tree.activeId === session.id" :creating="pending?.id === session.id" @create="saveConnection" @cancel="pending = undefined" @draft="updateDraft" @rename="renameConnection" @status="updateStatus" />
      <div v-if="!tree.activeId && !pending" class="empty-workspace"><button class="btn" @click="add('session')"><Plus :size="15" />{{ t("network.mqtt.newSession") }}</button></div>
    </main>
    <Teleport to="body">
      <span ref="menuAnchor" class="context-anchor" :style="menuPosition" aria-hidden="true" />
      <Transition name="pop">
        <div v-if="menuOpen" ref="menuPanel" class="directory-menu" :style="menuStyle" role="menu" @keydown="menuKey">
          <template v-if="menuKind === 'node'">
            <button role="menuitem" @click="closeMenu(); beginRename()"><Pencil :size="14" />{{ t("network.mqtt.rename") }}</button>
            <button role="menuitem" @click="closeMenu(); requestDelete()"><Trash2 :size="14" />{{ t("network.mqtt.deleteNode") }}</button>
          </template>
          <template v-else>
            <button role="menuitem" @click="closeMenu(); add('folder')"><FolderPlus :size="15" />{{ t("network.mqtt.newFolder") }}</button>
            <button role="menuitem" @click="closeMenu(); add('session')"><Plus :size="15" />{{ t("network.mqtt.newSession") }}</button>
          </template>
        </div>
      </Transition>
    </Teleport>
    <dialog v-panel-dismiss ref="deleteDialog" class="mqtt-dialog panel-dialog" :aria-label="t('network.mqtt.deleteNode')" @cancel.prevent="closePanelDialog(deleteDialog)"><form @submit.prevent="performDelete">
      <h2>{{ t("network.mqtt.deleteNode") }}</h2><p>{{ t("network.mqtt.deleteFolderConfirm", deletePrompt) }}</p>
      <footer><button type="button" class="btn" @click="closePanelDialog(deleteDialog)">{{ t("network.mqtt.cancelAction") }}</button><button class="btn primary">{{ t("network.mqtt.deleteNode") }}</button></footer>
    </form></dialog>
  </div>
</template>

<style scoped>
.mqtt-workspace { --mqtt-header-height: 53px; --mqtt-row-height: 52px; flex: 1; display: flex; min-height: 0; min-width: 0; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
.directory { display: flex; flex-direction: column; flex-shrink: 0; min-height: 0; min-width: 0; }
.directory-head { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; height: var(--mqtt-header-height); padding: 0 14px; border-bottom: 1px solid var(--border); font-size: 16px; font-weight: 600; }
.directory-head > div { display: flex; align-items: center; gap: 2px; }
.node-label { display: flex; flex: 1; flex-direction: column; gap: 4px; min-width: 0; }
.node-label small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-3); font: 11px var(--font-sans); }
.directory-tree { flex: 1; min-height: 0; overflow: auto; padding: 6px 0 28px; }
.tree-row { display: flex; align-items: center; gap: 6px; min-height: var(--mqtt-row-height); padding-inline-end: 10px; border-block: 2px solid transparent; font-size: 14px; color: var(--text-2); cursor: pointer; }
/* 文件夹展开与收起只改变行高和裁剪，保持文字尺寸不变。 */
.tree-row.mqtt-tree-enter-active, .tree-row.mqtt-tree-leave-active { overflow: clip; transition: min-height var(--dur) var(--ease-out), max-height var(--dur) var(--ease-out), border-width var(--dur) var(--ease-out); }
.mqtt-tree-enter-from, .mqtt-tree-leave-to { min-height: 0; max-height: 0; border-block-width: 0; pointer-events: none; }
.mqtt-tree-enter-to, .mqtt-tree-leave-from { min-height: var(--mqtt-row-height); max-height: var(--mqtt-row-height); }
.tree-row { transition: background-color var(--dur) var(--ease-out), color var(--dur) var(--ease-out); }
.tree-row:hover { background: var(--hover); }
.tree-row.selected { background: var(--accent-soft); color: var(--accent); }
.tree-row.current .node-name { font-weight: 600; }
.tree-row:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }
.tree-row > svg { flex-shrink: 0; }
.folder-toggle { width: 14px; height: 22px; }
.folder-toggle svg { transition: transform var(--dur) var(--ease-out); }
.folder-toggle svg.expanded { transform: rotate(90deg); }
.tree-spacer { width: 14px; flex-shrink: 0; }
.node-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rename-input { height: 25px; padding: 0 5px; font-size: 12px; }
.connection-dot { width: 6px; height: 6px; flex-shrink: 0; margin-inline-start: auto; border-radius: 50%; background: var(--success); }
.tree-row.drop-before { border-top-color: var(--accent); }
.tree-row.drop-after { border-bottom-color: var(--accent); }
.tree-row.drop-inside { background: var(--accent-soft); outline: 1px solid var(--accent); outline-offset: -2px; }
.session-area { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; padding: 0; }
.directory-resizer { position: relative; flex: 0 0 1px; z-index: 1; background: var(--border); cursor: col-resize; touch-action: none; }
.directory-resizer::before { content: ""; position: absolute; inset: 0 -4px; }
.directory-resizer:hover, .directory-resizer:focus-visible, .resizing .directory-resizer { background: var(--accent); outline: 1px solid var(--accent); }
.resizing, .resizing :deep(*) { cursor: col-resize !important; user-select: none !important; }
.context-anchor { position: fixed; width: 0; height: 0; pointer-events: none; }
.directory-menu { position: fixed; z-index: 1000; padding: 4px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); box-shadow: var(--shadow-lg); }
.directory-menu button { display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 10px; border: 0; border-radius: 5px; background: none; color: var(--text); text-align: start; font-size: 12px; }
.directory-menu button:hover, .directory-menu button:focus-visible { background: var(--hover); outline: none; }
.empty-workspace { display: grid; place-content: center; flex: 1; }
.mqtt-dialog { width: min(420px, calc(100vw - 32px)); padding: 22px; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface); color: var(--text); box-shadow: var(--shadow-lg); }
.mqtt-dialog::backdrop { background: var(--modal-scrim); }
.mqtt-dialog form, .mqtt-dialog label { display: flex; flex-direction: column; gap: 10px; }
.mqtt-dialog form { gap: 18px; }
.mqtt-dialog h2, .mqtt-dialog p { margin: 0; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.mqtt-dialog label { color: var(--text-2); font-size: 12px; }
.mqtt-dialog footer { display: flex; justify-content: flex-end; gap: 8px; }
@media (prefers-reduced-motion: reduce) { .folder-toggle svg { transition: none; } }
</style>
