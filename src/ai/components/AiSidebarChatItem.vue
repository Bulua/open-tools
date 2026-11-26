<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Check, LoaderCircle, Pencil, Pin, Trash2 } from "lucide-vue-next";
import type { ConversationSummary } from "../types";

const props = defineProps<{
  item: ConversationSummary;
  active: boolean;
  pinned: boolean;
  folderId?: string;
  streaming: boolean;
  dragging: boolean;
  dropPosition?: "before" | "after" | null;
  timeLabel: string;
}>();

const emit = defineEmits<{
  select: [id: string];
  pin: [id: string];
  rename: [id: string, title: string];
  delete: [id: string];
  dragPointerDown: [item: ConversationSummary, event: PointerEvent];
}>();

const { t } = useI18n();
const editing = ref(false);
const draftTitle = ref("");
const inputRef = ref<HTMLInputElement>();

async function startEdit() {
  editing.value = true;
  draftTitle.value = props.item.title;
  await nextTick();
  inputRef.value?.focus();
  inputRef.value?.select();
}

function commitEdit() {
  if (!editing.value) return;
  const trimmed = draftTitle.value.trim();
  editing.value = false;
  if (trimmed && trimmed !== props.item.title) {
    emit("rename", props.item.id, trimmed);
  }
}

function cancelEdit() {
  editing.value = false;
}

function onMainPointerDown(event: PointerEvent) {
  if (editing.value) return;
  emit("dragPointerDown", props.item, event);
}
</script>

<template>
  <div
    class="chat-row"
    :class="{
      active,
      editing,
      dragging,
      'drop-before': dropPosition === 'before',
      'drop-after': dropPosition === 'after',
    }"
    :data-chat-id="item.id"
    :data-chat-pinned="pinned ? '1' : '0'"
    :data-chat-folder="folderId || ''"
  >
    <span v-if="dropPosition === 'before'" class="drop-line before" aria-hidden="true" />
    <span v-if="dropPosition === 'after'" class="drop-line after" aria-hidden="true" />

    <template v-if="editing">
      <div class="rename-wrap">
        <input
          ref="inputRef"
          v-model="draftTitle"
          type="text"
          class="rename-input"
          @keydown.enter.prevent="commitEdit"
          @keydown.esc.prevent="cancelEdit"
          @blur="commitEdit"
        />
        <button type="button" class="row-btn" :title="t('datetime.ok')" @mousedown.prevent="commitEdit">
          <Check :size="13" />
        </button>
      </div>
    </template>

    <template v-else>
      <button
        type="button"
        class="chat-main draggable"
        :title="item.title"
        @pointerdown="onMainPointerDown"
        @click="emit('select', item.id)"
        @dblclick="startEdit"
      >
        <LoaderCircle v-if="streaming" :size="13" class="spin streaming-icon" />
        <span class="chat-title">{{ item.title }}</span>
      </button>

      <div class="chat-trail">
        <span class="chat-time">{{ timeLabel }}</span>

        <div class="chat-actions">
          <button
            type="button"
            class="row-btn"
            :class="{ pinned }"
            :title="pinned ? t('ai.unpinChat') : t('ai.pinChat')"
            :aria-label="pinned ? t('ai.unpinChat') : t('ai.pinChat')"
            @pointerdown.stop
            @click.stop="emit('pin', item.id)"
          >
            <Pin :size="13" />
          </button>
          <button
            type="button"
            class="row-btn"
            :title="t('ai.rename')"
            :aria-label="t('ai.rename')"
            @pointerdown.stop
            @click.stop="startEdit"
          >
            <Pencil :size="13" />
          </button>
          <button
            type="button"
            class="row-btn danger"
            :title="t('ai.deleteChat')"
            :aria-label="t('ai.deleteChat')"
            @pointerdown.stop
            @click.stop="emit('delete', item.id)"
          >
            <Trash2 :size="13" />
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chat-row {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 30px;
  padding: 0 4px 0 8px;
  border-radius: 7px;
  background: transparent;
  color: var(--text);
  transition: background var(--dur) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
}
.chat-row:hover {
  background: var(--hover);
}
.chat-row.active {
  background: var(--active);
}
.chat-row.dragging {
  opacity: 0.34;
  background: var(--hover);
  box-shadow: inset 0 0 0 1px var(--border-strong);
}

/* 拖拽插入指示线：顶部/底部细线配起点圆点，落点一目了然 */
.drop-line {
  position: absolute;
  left: 8px;
  right: 6px;
  height: 2px;
  border-radius: 2px;
  background: var(--accent);
  pointer-events: none;
  z-index: 3;
}
.drop-line::before {
  content: "";
  position: absolute;
  left: -4px;
  top: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  transform: translateY(-50%);
}
.drop-line.before {
  top: -2px;
}
.drop-line.after {
  bottom: -2px;
}

.chat-main {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0;
  border: 0;
  background: none;
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  color: inherit;
  cursor: pointer;
}
.chat-main.draggable {
  touch-action: none;
}

.streaming-icon {
  flex-shrink: 0;
  color: var(--accent);
}
.chat-title {
  font-size: 13px;
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color var(--dur-fast) var(--ease-out);
}
.chat-row.active .chat-title {
  font-weight: 500;
}

/* 右侧时间与悬停操作平滑交叉过渡，避免硬跳变 */
.chat-trail {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 34px;
  height: 24px;
  margin-left: 6px;
  transition: min-width var(--dur) var(--ease-out);
}
.chat-row:hover .chat-trail,
.chat-row:focus-within .chat-trail {
  min-width: 68px;
}

.chat-time {
  padding-right: 4px;
  font-size: 11.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 1;
  transform: translateX(0);
  transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.chat-row:hover .chat-time,
.chat-row:focus-within .chat-time {
  opacity: 0;
  transform: translateX(-4px);
  pointer-events: none;
}

.chat-actions {
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
.chat-row:hover .chat-actions,
.chat-row:focus-within .chat-actions {
  opacity: 1;
  transform: translate(0, -50%);
  pointer-events: auto;
}

.row-btn {
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
.row-btn:hover {
  background: var(--active);
  color: var(--text);
}
.row-btn:active {
  transform: scale(0.92);
}
.row-btn.pinned {
  color: var(--accent);
}
.row-btn.danger:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.rename-wrap {
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
</style>
