<script lang="ts">
export interface Session {
  id: number;
  /** 用户改过的名称；为空时显示默认的「会话 N」，跟着界面语言变 */
  name: string;
}
</script>

<script setup lang="ts">
import { nextTick, ref } from "vue";
import { Plus, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

/** 会话标签栏：切换、新建、关闭，双击标签重命名 */
defineProps<{ sessions: Session[]; activeId: number; max: number }>();
const emit = defineEmits<{
  select: [id: number];
  add: [];
  close: [id: number];
  rename: [id: number, name: string];
}>();

const { t } = useI18n();
const labelOf = (s: Session) => s.name || t("tool.session", { n: s.id });

const editingId = ref<number | null>(null);
const draft = ref("");
const input = ref<HTMLInputElement[]>();

const startRename = async (s: Session) => {
  editingId.value = s.id;
  draft.value = labelOf(s);
  await nextTick();
  input.value?.[0]?.select();
};

const commit = () => {
  if (editingId.value !== null && draft.value.trim()) emit("rename", editingId.value, draft.value.trim());
  editingId.value = null;
};

// 鼠标中键关闭标签，与浏览器习惯一致
const onMouseUp = (e: MouseEvent, id: number) => e.button === 1 && emit("close", id);
</script>

<template>
  <div class="session-tabs" role="tablist">
    <div
      v-for="s in sessions"
      :key="s.id"
      class="session-tab"
      :class="{ active: s.id === activeId }"
      role="tab"
      :aria-selected="s.id === activeId"
      :title="editingId === s.id ? '' : t('tool.renameHint', { name: labelOf(s) })"
      @click="emit('select', s.id)"
      @dblclick="startRename(s)"
      @mouseup="onMouseUp($event, s.id)"
    >
      <input
        v-if="editingId === s.id"
        ref="input"
        v-model="draft"
        class="rename"
        maxlength="20"
        @keydown.enter="commit"
        @keydown.esc="editingId = null"
        @blur="commit"
        @click.stop
      />
      <span v-else class="name">{{ labelOf(s) }}</span>
      <button class="close" :title="t('tool.closeSession')" @click.stop="emit('close', s.id)"><X :size="12" /></button>
    </div>
    <button v-if="sessions.length < max" class="add" :title="t('tool.newSession')" @click="emit('add')"><Plus :size="14" /></button>
  </div>
</template>

<style scoped>
/* 向下多出 1px 压住外层的分隔线，当前标签才能「打通」到下方工作区 */
.session-tabs {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 2px;
  min-width: 0;
  margin-bottom: -1px;
  overflow-x: auto;
  scrollbar-width: none;
}
.session-tabs::-webkit-scrollbar {
  display: none;
}
.session-tab {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 33px;
  max-width: 180px;
  padding: 0 6px 0 12px;
  border: 1px solid transparent;
  border-radius: 8px 8px 0 0;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.session-tab:hover {
  background: var(--hover);
  color: var(--text);
}
/* 当前标签：三边描边，底边用工作区的颜色盖住分隔线，与下方连成一体 */
.session-tab.active {
  background: var(--bg);
  border-color: var(--border);
  border-bottom-color: var(--bg);
  color: var(--text);
  font-weight: 500;
}
.session-tab.active:hover {
  background: var(--bg);
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rename {
  width: 110px;
  height: 22px;
  padding: 0 4px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  outline: none;
  background: var(--surface);
  font-size: 13px;
}
.close {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--text-3);
  opacity: 0;
}
.session-tab:hover .close,
.session-tab.active .close {
  opacity: 1;
}
.close:hover {
  background: var(--active);
  color: var(--text);
}
.add {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin: 0 0 2px 4px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-3);
}
.add:hover {
  background: var(--hover);
  color: var(--text);
}
</style>
