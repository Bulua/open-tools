<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  MessageSquarePlus,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-vue-next";
import { sortConversationsByMeta } from "../store";
import type { AiConversationMeta, AiFolder, ConversationSummary } from "@/types/ai";
import AiSidebarChatItem from "./AiSidebarChatItem.vue";

const SIDEBAR_WIDTH_KEY = "open-tools:ai:sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 268;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 460;

type DropTarget =
  | { type: "item"; id: string; position: "before" | "after"; pinned: boolean; folderId?: string }
  | { type: "folder"; id: string }
  | { type: "section"; pinned: boolean };

const props = defineProps<{
  conversations: ConversationSummary[];
  folders: AiFolder[];
  conversationMeta: Record<string, AiConversationMeta>;
  activeId: string;
  isStreaming: (id: string) => boolean;
}>();

const emit = defineEmits<{
  newChat: [];
  newChatInFolder: [folderId: string];
  select: [id: string];
  rename: [id: string, title: string];
  delete: [id: string];
  pin: [id: string];
  move: [id: string, target: { pinned: boolean; folderId?: string; beforeId?: string; afterId?: string }];
  createFolder: [pinned: boolean];
  renameFolder: [id: string, name: string];
  toggleFolder: [id: string];
  deleteFolder: [id: string];
  openSettings: [];
}>();

const { t } = useI18n();

const scrollRef = ref<HTMLElement>();
const editingFolderId = ref("");
const editingFolderName = ref("");
const folderInputRef = ref<HTMLInputElement[]>();

// ---------- 侧栏宽度拖拽调节 ----------
function clampSidebarWidth(raw: number): number {
  const viewportCap = typeof window !== "undefined" && window.innerWidth > 0
    ? Math.max(MIN_SIDEBAR_WIDTH, Math.round(window.innerWidth * 0.45))
    : MAX_SIDEBAR_WIDTH;
  const maxWidth = Math.min(MAX_SIDEBAR_WIDTH, viewportCap);
  return Math.round(Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, raw)));
}

function loadInitialWidth(): number {
  try {
    const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= MIN_SIDEBAR_WIDTH) {
      return clampSidebarWidth(saved);
    }
  } catch {
    // 忽略存储读取异常
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

function saveSidebarWidth(width: number) {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {
    // 忽略存储写入异常
  }
}

const sidebarWidth = ref(loadInitialWidth());
const resizing = ref(false);
let resizeState: { startX: number; startWidth: number } | null = null;

function onResizePointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  resizeState = { startX: event.clientX, startWidth: sidebarWidth.value };
  resizing.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", onResizePointerMove);
  window.addEventListener("pointerup", onResizePointerEnd);
  window.addEventListener("pointercancel", onResizePointerEnd);
}

function onResizePointerMove(event: PointerEvent) {
  if (!resizeState) return;
  const delta = event.clientX - resizeState.startX;
  sidebarWidth.value = clampSidebarWidth(resizeState.startWidth + delta);
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
  if (shouldSave) saveSidebarWidth(sidebarWidth.value);
}

function resetSidebarWidth() {
  sidebarWidth.value = DEFAULT_SIDEBAR_WIDTH;
  saveSidebarWidth(sidebarWidth.value);
}

function onResizeKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    sidebarWidth.value = clampSidebarWidth(sidebarWidth.value - 16);
    saveSidebarWidth(sidebarWidth.value);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    sidebarWidth.value = clampSidebarWidth(sidebarWidth.value + 16);
    saveSidebarWidth(sidebarWidth.value);
  } else if (event.key === "Home") {
    event.preventDefault();
    resetSidebarWidth();
  }
}

// ---------- 会话平滑拖拽排序与跨区移动 ----------
const draggingChat = ref<ConversationSummary | null>(null);
const dragCard = ref({ x: 0, y: 0, width: 220 });
const dropTarget = ref<DropTarget | null>(null);

let pendingDrag: {
  item: ConversationSummary;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  started: boolean;
} | null = null;
let lastPointer = { x: 0, y: 0 };
let suppressClickUntil = 0;
let autoScrollRaf = 0;
let autoExpandTimer = 0;
let autoExpandFolderId = "";

function metaOf(id: string): AiConversationMeta {
  return props.conversationMeta[id] ?? {};
}

function foldersIn(pinned: boolean): AiFolder[] {
  return props.folders.filter((f) => f.pinned === pinned);
}

function rootChatsIn(pinned: boolean): ConversationSummary[] {
  const matched = props.conversations.filter((c) => {
    const m = metaOf(c.id);
    return Boolean(m.pinned) === pinned && !m.folderId;
  });
  return sortConversationsByMeta(matched, props.conversationMeta);
}

function folderChats(folderId: string): ConversationSummary[] {
  const matched = props.conversations.filter((c) => metaOf(c.id).folderId === folderId);
  return sortConversationsByMeta(matched, props.conversationMeta);
}

const pinnedFolders = computed(() => foldersIn(true));
const pinnedRootChats = computed(() => rootChatsIn(true));
const normalFolders = computed(() => foldersIn(false));
const normalRootChats = computed(() => rootChatsIn(false));

function formatShortTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return t("ai.shortTime.now");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t("ai.shortTime.min", { n: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t("ai.shortTime.hour", { n: diffHour });
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return t("ai.shortTime.day", { n: diffDay });
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return t("ai.shortTime.week", { n: diffWeek });
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return t("ai.shortTime.month", { n: diffMonth });
  return t("ai.shortTime.year", { n: Math.floor(diffDay / 365) });
}

async function startFolderRename(folder: AiFolder) {
  editingFolderId.value = folder.id;
  editingFolderName.value = folder.name;
  await nextTick();
  const el = folderInputRef.value?.[0];
  el?.focus();
  el?.select();
}

function commitFolderRename() {
  if (!editingFolderId.value) return;
  const id = editingFolderId.value;
  const name = editingFolderName.value.trim();
  editingFolderId.value = "";
  if (name) emit("renameFolder", id, name);
}

async function onAddFolder(pinned: boolean) {
  const before = new Set(props.folders.map((f) => f.id));
  emit("createFolder", pinned);
  const created = props.folders.find((f) => !before.has(f.id));
  if (created) {
    await startFolderRename(created);
    return;
  }
  await nextTick();
  const late = props.folders.find((f) => !before.has(f.id));
  if (late) await startFolderRename(late);
}

function onSelectChat(id: string) {
  if (performance.now() < suppressClickUntil) return;
  emit("select", id);
}

function clearAutoExpand() {
  if (autoExpandTimer) {
    window.clearTimeout(autoExpandTimer);
    autoExpandTimer = 0;
  }
  autoExpandFolderId = "";
}

function scheduleFolderAutoExpand(folderId: string) {
  const folder = props.folders.find((f) => f.id === folderId);
  if (!folder || !folder.collapsed) {
    clearAutoExpand();
    return;
  }
  if (autoExpandFolderId === folderId) return;
  clearAutoExpand();
  autoExpandFolderId = folderId;
  autoExpandTimer = window.setTimeout(() => {
    autoExpandTimer = 0;
    const latest = props.folders.find((f) => f.id === folderId);
    if (draggingChat.value && latest?.collapsed) {
      emit("toggleFolder", folderId);
    }
  }, 450);
}

function detectDropTarget(x: number, y: number): DropTarget | null {
  if (typeof document.elementFromPoint !== "function") return null;
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;

  const activeDragId = draggingChat.value?.id;

  // 1. 优先命中共用列表中的其他会话行，精确计算上方/下方插入位
  const chatRow = el.closest<HTMLElement>("[data-chat-id]");
  if (chatRow?.dataset.chatId && chatRow.dataset.chatId !== activeDragId) {
    const rect = chatRow.getBoundingClientRect();
    const position: "before" | "after" = y < rect.top + rect.height / 2 ? "before" : "after";
    return {
      type: "item",
      id: chatRow.dataset.chatId,
      position,
      pinned: chatRow.dataset.chatPinned === "1",
      folderId: chatRow.dataset.chatFolder || undefined,
    };
  }

  // 2. 命中文件夹标题行或文件夹内容区
  const folderEl = el.closest<HTMLElement>("[data-drop-folder]");
  if (folderEl?.dataset.dropFolder) {
    return { type: "folder", id: folderEl.dataset.dropFolder };
  }

  // 3. 命中固定会话区或普通会话区空白处
  const sectionEl = el.closest<HTMLElement>("[data-drop-section]");
  if (sectionEl?.dataset.dropSection) {
    const pinned = sectionEl.dataset.dropSection === "pinned";
    if (activeDragId) {
      const srcMeta = metaOf(activeDragId);
      // 拖在原分组空白区域且未命中其他行时不额外闪烁外框
      if (Boolean(srcMeta.pinned) === pinned && !srcMeta.folderId) {
        return null;
      }
    }
    return { type: "section", pinned };
  }

  return null;
}

function stopAutoScroll() {
  if (autoScrollRaf) {
    window.cancelAnimationFrame(autoScrollRaf);
    autoScrollRaf = 0;
  }
}

function stepAutoScroll() {
  autoScrollRaf = 0;
  if (!draggingChat.value || !scrollRef.value) return;
  const el = scrollRef.value;
  const rect = el.getBoundingClientRect();
  const edge = 40;
  let delta = 0;
  if (lastPointer.y < rect.top + edge && el.scrollTop > 0) {
    const ratio = Math.min(1, (rect.top + edge - lastPointer.y) / edge);
    delta = -Math.ceil(ratio * 10);
  } else if (lastPointer.y > rect.bottom - edge && el.scrollTop + el.clientHeight < el.scrollHeight) {
    const ratio = Math.min(1, (lastPointer.y - (rect.bottom - edge)) / edge);
    delta = Math.ceil(ratio * 10);
  }
  if (delta !== 0) {
    el.scrollTop += delta;
    updateDropAt(lastPointer.x, lastPointer.y);
    autoScrollRaf = window.requestAnimationFrame(stepAutoScroll);
  }
}

function updateDropAt(x: number, y: number) {
  const next = detectDropTarget(x, y);
  dropTarget.value = next;
  if (next?.type === "folder") {
    scheduleFolderAutoExpand(next.id);
  } else {
    clearAutoExpand();
  }
}

function onDragKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    cancelDrag();
  }
}

function onDragPointerDown(item: ConversationSummary, event: PointerEvent) {
  if (event.button !== 0) return;
  const rowEl = (event.currentTarget as HTMLElement | null)?.closest<HTMLElement>(".chat-row");
  const rect = rowEl?.getBoundingClientRect();
  pendingDrag = {
    item,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: rect ? Math.min(Math.max(event.clientX - rect.left, 12), rect.width - 12) : 20,
    offsetY: rect ? Math.min(Math.max(event.clientY - rect.top, 8), rect.height - 8) : 15,
    width: rect && rect.width > 0 ? Math.round(rect.width) : Math.max(160, sidebarWidth.value - 28),
    started: false,
  };
  lastPointer = { x: event.clientX, y: event.clientY };
  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", cancelDrag);
}

function onWindowPointerMove(event: PointerEvent) {
  if (!pendingDrag) return;
  lastPointer = { x: event.clientX, y: event.clientY };
  const dx = event.clientX - pendingDrag.startX;
  const dy = event.clientY - pendingDrag.startY;
  if (!pendingDrag.started && Math.hypot(dx, dy) >= 4) {
    pendingDrag.started = true;
    draggingChat.value = pendingDrag.item;
    document.body.style.cursor = "grabbing";
    document.addEventListener("keydown", onDragKeydown, true);
  }
  if (pendingDrag.started) {
    dragCard.value = {
      x: Math.round(event.clientX - pendingDrag.offsetX),
      y: Math.round(event.clientY - pendingDrag.offsetY),
      width: pendingDrag.width,
    };
    updateDropAt(event.clientX, event.clientY);
    if (!autoScrollRaf) {
      autoScrollRaf = window.requestAnimationFrame(stepAutoScroll);
    }
  }
}

function cleanupDragListeners() {
  window.removeEventListener("pointermove", onWindowPointerMove);
  window.removeEventListener("pointerup", onWindowPointerUp);
  window.removeEventListener("pointercancel", cancelDrag);
  document.removeEventListener("keydown", onDragKeydown, true);
  stopAutoScroll();
  clearAutoExpand();
  if (draggingChat.value) {
    document.body.style.cursor = "";
  }
}

function onWindowPointerUp() {
  const state = pendingDrag;
  const target = dropTarget.value;
  cleanupDragListeners();
  pendingDrag = null;
  draggingChat.value = null;
  dropTarget.value = null;

  if (!state?.started) return;
  suppressClickUntil = performance.now() + 260;
  if (!target) return;

  if (target.type === "item") {
    emit("move", state.item.id, {
      pinned: target.pinned,
      folderId: target.folderId,
      ...(target.position === "before" ? { beforeId: target.id } : { afterId: target.id }),
    });
  } else if (target.type === "folder") {
    const folder = props.folders.find((f) => f.id === target.id);
    if (folder) emit("move", state.item.id, { pinned: folder.pinned, folderId: folder.id });
  } else {
    emit("move", state.item.id, { pinned: target.pinned, folderId: undefined });
  }
}

function cancelDrag() {
  const wasStarted = Boolean(pendingDrag?.started);
  cleanupDragListeners();
  pendingDrag = null;
  draggingChat.value = null;
  dropTarget.value = null;
  if (wasStarted) suppressClickUntil = performance.now() + 260;
}

function dropPositionFor(chatId: string): "before" | "after" | null {
  const t = dropTarget.value;
  return t?.type === "item" && t.id === chatId ? t.position : null;
}

onBeforeUnmount(() => {
  cleanupDragListeners();
  cleanupResize();
});

const sections = computed(() => [
  {
    key: "pinned",
    pinned: true,
    title: t("ai.pinnedChats"),
    folders: pinnedFolders.value,
    chats: pinnedRootChats.value,
  },
  {
    key: "normal",
    pinned: false,
    title: t("ai.normalChats"),
    folders: normalFolders.value,
    chats: normalRootChats.value,
  },
]);
</script>

<template>
  <aside
    class="ai-sidebar"
    :class="{ 'is-dragging': Boolean(draggingChat), 'is-resizing': resizing }"
    :style="{ width: `${sidebarWidth}px` }"
  >
    <div class="sidebar-top">
      <button type="button" class="btn primary full new-chat-btn" @click="emit('newChat')">
        <MessageSquarePlus :size="15" />
        <span>{{ t("ai.newChat") }}</span>
      </button>
    </div>

    <div ref="scrollRef" class="chat-scroll">
      <section
        v-for="section in sections"
        :key="section.key"
        class="chat-section"
        :class="{
          'drop-active': dropTarget?.type === 'section' && dropTarget.pinned === section.pinned,
        }"
        :data-drop-section="section.pinned ? 'pinned' : 'normal'"
      >
        <header class="section-head">
          <span class="section-title">{{ section.title }}</span>
          <button
            type="button"
            class="head-btn"
            :title="t('ai.newFolder')"
            :aria-label="t('ai.newFolder')"
            @click="onAddFolder(section.pinned)"
          >
            <FolderPlus :size="14" />
          </button>
        </header>

        <!-- 该区域下的文件夹 -->
        <TransitionGroup name="sidebar-list" tag="div" class="folder-list" :duration="{ enter: 200, leave: 120 }">
          <div v-for="folder in section.folders" :key="folder.id" class="folder-block">
            <div
              class="folder-row"
              :class="{
                'drop-active': dropTarget?.type === 'folder' && dropTarget.id === folder.id,
              }"
              :data-drop-folder="folder.id"
            >
              <template v-if="editingFolderId === folder.id">
                <div class="folder-rename">
                  <input
                    ref="folderInputRef"
                    v-model="editingFolderName"
                    type="text"
                    class="rename-input"
                    @keydown.enter.prevent="commitFolderRename"
                    @keydown.esc.prevent="editingFolderId = ''"
                    @blur="commitFolderRename"
                  />
                  <button type="button" class="mini-btn" :title="t('datetime.ok')" @mousedown.prevent="commitFolderRename">
                    <Check :size="13" />
                  </button>
                </div>
              </template>

              <template v-else>
                <button
                  type="button"
                  class="folder-toggle"
                  :aria-expanded="!folder.collapsed"
                  @click="emit('toggleFolder', folder.id)"
                  @dblclick="startFolderRename(folder)"
                >
                  <ChevronRight :size="13" class="folder-chevron" :class="{ open: !folder.collapsed }" />
                  <FolderOpen v-if="!folder.collapsed" :size="14" class="folder-icon" />
                  <Folder v-else :size="14" class="folder-icon" />
                  <span class="folder-name">{{ folder.name }}</span>
                </button>

                <div class="folder-trail">
                  <span class="folder-count">{{ folderChats(folder.id).length }}</span>

                  <div class="folder-actions">
                    <button
                      type="button"
                      class="mini-btn"
                      :title="t('ai.newChatInFolder')"
                      :aria-label="t('ai.newChatInFolder')"
                      @click.stop="emit('newChatInFolder', folder.id)"
                    >
                      <Plus :size="13" />
                    </button>
                    <button
                      type="button"
                      class="mini-btn"
                      :title="t('ai.rename')"
                      :aria-label="t('ai.rename')"
                      @click.stop="startFolderRename(folder)"
                    >
                      <Pencil :size="12" />
                    </button>
                    <button
                      type="button"
                      class="mini-btn danger"
                      :title="t('ai.deleteFolder')"
                      :aria-label="t('ai.deleteFolder')"
                      @click.stop="emit('deleteFolder', folder.id)"
                    >
                      <Trash2 :size="12" />
                    </button>
                  </div>
                </div>
              </template>
            </div>

            <div class="folder-fold" :class="{ 'is-collapsed': folder.collapsed }">
              <div class="folder-fold-inner">
                <div class="folder-children" :data-drop-folder="folder.id">
                  <TransitionGroup name="sidebar-list" tag="div" class="chat-group-list" :duration="{ enter: 200, leave: 120 }">
                    <AiSidebarChatItem
                      v-for="item in folderChats(folder.id)"
                      :key="item.id"
                      :item="item"
                      :active="item.id === activeId"
                      :pinned="section.pinned"
                      :folder-id="folder.id"
                      :streaming="isStreaming(item.id)"
                      :dragging="draggingChat?.id === item.id"
                      :drop-position="dropPositionFor(item.id)"
                      :time-label="formatShortTime(item.updatedAt)"
                      @select="onSelectChat"
                      @pin="emit('pin', $event)"
                      @rename="(id, title) => emit('rename', id, title)"
                      @delete="emit('delete', $event)"
                      @drag-pointer-down="onDragPointerDown"
                    />
                  </TransitionGroup>
                  <p v-if="!folderChats(folder.id).length" class="folder-empty">{{ t("ai.emptyFolder") }}</p>
                </div>
              </div>
            </div>
          </div>
        </TransitionGroup>

        <!-- 该区域根目录下的会话 -->
        <TransitionGroup name="sidebar-list" tag="div" class="chat-group-list" :duration="{ enter: 200, leave: 120 }">
          <AiSidebarChatItem
            v-for="item in section.chats"
            :key="item.id"
            :item="item"
            :active="item.id === activeId"
            :pinned="section.pinned"
            :streaming="isStreaming(item.id)"
            :dragging="draggingChat?.id === item.id"
            :drop-position="dropPositionFor(item.id)"
            :time-label="formatShortTime(item.updatedAt)"
            @select="onSelectChat"
            @pin="emit('pin', $event)"
            @rename="(id, title) => emit('rename', id, title)"
            @delete="emit('delete', $event)"
            @drag-pointer-down="onDragPointerDown"
          />
        </TransitionGroup>

        <p v-if="!section.folders.length && !section.chats.length" class="section-empty">
          {{ section.pinned ? t("ai.noPinnedChats") : t("ai.noChats") }}
        </p>
      </section>
    </div>

    <footer class="sidebar-foot">
      <button type="button" class="settings-btn" @click="emit('openSettings')">
        <Settings :size="15" class="settings-icon" />
        <span class="settings-label">{{ t("ai.settings") }}</span>
      </button>
    </footer>

    <!-- 右边缘可拖拽调节宽度分隔条 -->
    <div
      class="sidebar-resizer"
      :class="{ active: resizing }"
      role="separator"
      aria-orientation="vertical"
      :aria-label="t('ai.resizeSidebar')"
      :aria-valuenow="sidebarWidth"
      :aria-valuemin="MIN_SIDEBAR_WIDTH"
      :aria-valuemax="MAX_SIDEBAR_WIDTH"
      tabindex="0"
      :title="t('ai.resizeSidebar')"
      @pointerdown="onResizePointerDown"
      @dblclick="resetSidebarWidth"
      @keydown="onResizeKeydown"
    />

    <!-- 拖拽中的跟手悬浮卡片（使用 GPU transform 保持流畅不卡顿） -->
    <Teleport to="body">
      <div
        v-if="draggingChat"
        class="drag-ghost"
        :style="{
          width: `${dragCard.width}px`,
          transform: `translate3d(${dragCard.x}px, ${dragCard.y}px, 0)`,
        }"
      >
        <span class="drag-ghost-title">{{ draggingChat.title }}</span>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.ai-sidebar {
  position: relative;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-sunken);
  border-right: 1px solid var(--border);
}
.ai-sidebar.is-dragging,
.ai-sidebar.is-resizing {
  user-select: none;
}

.sidebar-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  bottom: 0;
  width: 6px;
  z-index: 6;
  cursor: col-resize;
  touch-action: none;
}
.sidebar-resizer::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
  background: transparent;
  transition: background var(--dur-fast) var(--ease-out);
}
.sidebar-resizer:hover::after,
.sidebar-resizer.active::after,
.sidebar-resizer:focus-visible::after {
  background: var(--accent);
}
.sidebar-resizer:focus-visible {
  outline: none;
}

.sidebar-top {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}
.new-chat-btn {
  height: 36px;
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scrollbar-width: thin;
}

.chat-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: border-color var(--dur) var(--ease-out), background var(--dur) var(--ease-out);
}
.chat-section.drop-active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px 4px 8px;
}
.section-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-3);
}
.head-btn {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text-3);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.head-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.head-btn:active {
  transform: scale(0.92);
}

.folder-list,
.chat-group-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.folder-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.folder-row {
  display: flex;
  align-items: center;
  min-height: 30px;
  padding: 0 4px 0 6px;
  border-radius: 7px;
  border: 1px solid transparent;
  transition: background var(--dur) var(--ease-out), border-color var(--dur) var(--ease-out);
}
.folder-row:hover {
  background: var(--hover);
}
.folder-row.drop-active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.folder-toggle {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0;
  border: 0;
  background: none;
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  color: var(--text-2);
  cursor: pointer;
}
.folder-chevron {
  flex-shrink: 0;
  color: var(--text-3);
  transition: transform var(--dur) var(--ease-out);
}
.folder-chevron.open {
  transform: rotate(90deg);
}
.folder-icon {
  flex-shrink: 0;
  color: var(--text-3);
}
.folder-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-trail {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 24px;
  height: 24px;
  margin-left: 4px;
  transition: min-width var(--dur) var(--ease-out);
}
.folder-row:hover .folder-trail,
.folder-row:focus-within .folder-trail {
  min-width: 68px;
}
.folder-count {
  padding-right: 4px;
  font-size: 11.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  opacity: 1;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.folder-row:hover .folder-count,
.folder-row:focus-within .folder-count {
  opacity: 0;
  pointer-events: none;
}

.folder-actions {
  position: absolute;
  right: 0;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 1px;
  opacity: 0;
  transform: translate(6px, -50%);
  pointer-events: none;
  transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur) var(--ease-out);
}
.folder-row:hover .folder-actions,
.folder-row:focus-within .folder-actions {
  opacity: 1;
  transform: translate(0, -50%);
  pointer-events: auto;
}

.mini-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text-3);
  display: inline-grid;
  place-items: center;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.mini-btn:hover {
  background: var(--active);
  color: var(--text);
}
.mini-btn:active {
  transform: scale(0.92);
}
.mini-btn.danger:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.folder-rename {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
}
.rename-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 7px;
  border: 1px solid var(--accent);
  border-radius: 5px;
  background: var(--surface);
  color: var(--text);
  font-size: 12.5px;
  outline: none;
}

/* 文件夹展开/折叠平滑过渡，不缩放文字 */
.folder-fold {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows var(--dur) var(--ease-out), opacity var(--dur) var(--ease-out);
  opacity: 1;
}
.folder-fold.is-collapsed {
  grid-template-rows: 0fr;
  opacity: 0;
}
.folder-fold-inner {
  min-height: 0;
  overflow: hidden;
}

.folder-children {
  margin-left: 12px;
  padding: 2px 0 2px 8px;
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.folder-empty,
.section-empty {
  margin: 0;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-3);
}

/* 会话与文件夹新增、移除、重排过渡 */
.sidebar-list-move {
  transition: transform var(--dur) var(--ease-out);
}
.sidebar-list-enter-active {
  transition: opacity var(--dur) var(--ease-out), transform var(--dur) var(--ease-out);
}
.sidebar-list-leave-active {
  transition: opacity var(--dur-fast) ease-in, transform var(--dur-fast) ease-in;
}
.sidebar-list-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.sidebar-list-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}

/* 底部设置按钮：融入侧栏底色，悬停轻柔高亮且图标微转 */
.sidebar-foot {
  flex-shrink: 0;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--border);
  background: var(--bg-sunken);
}
.settings-btn {
  width: 100%;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--dur) var(--ease-out), color var(--dur) var(--ease-out), border-color var(--dur) var(--ease-out);
}
.settings-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.settings-btn:active {
  background: var(--active);
}
.settings-icon {
  flex-shrink: 0;
  color: var(--text-3);
  transition: color var(--dur) var(--ease-out), transform var(--dur-slow) var(--ease-out);
}
.settings-btn:hover .settings-icon {
  color: var(--accent);
  transform: rotate(30deg);
}
</style>

<style>
.drag-ghost {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 200;
  height: 32px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  border: 1px solid var(--accent);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--shadow-lg);
  opacity: 0.95;
  pointer-events: none;
  will-change: transform;
}
.drag-ghost-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
