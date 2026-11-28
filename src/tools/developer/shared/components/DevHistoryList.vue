<script lang="ts">
export type DevHistoryTone = "accent" | "success" | "danger" | "warning" | "muted";

export interface DevHistoryItem {
  id: string;
  tag?: string;
  tone?: DevHistoryTone;
  time: string;
  title: string;
  subtitle?: string;
}
</script>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { History, Trash2, X } from "lucide-vue-next";
import { boxOf, glide } from "@/utils/motion";

/** 左侧通用历史记录列表：带胶囊标签、平滑高亮滑动与单条/清空操作 */
const props = withDefaults(
  defineProps<{
    items: DevHistoryItem[];
    activeId: string | null;
    title?: string;
    emptyText?: string;
    clearTitle?: string;
    deleteTitle?: string;
  }>(),
  {
    title: undefined,
    emptyText: undefined,
    clearTitle: undefined,
    deleteTitle: undefined,
  },
);

const emit = defineEmits<{ select: [id: string]; remove: [id: string]; clear: [] }>();
const { t } = useI18n();
const listRef = ref<HTMLDivElement>();

const onSelect = (id: string, event: MouseEvent | KeyboardEvent) => {
  const list = listRef.value;
  const previous = list?.querySelector<HTMLElement>(".history-item[aria-current]");
  const next = event.currentTarget as HTMLElement | null;
  if (list && previous && next && previous !== next && typeof list.animate === "function") {
    glide(list, boxOf(previous), boxOf(next), "dev-history");
  }
  emit("select", id);
};
</script>

<template>
  <section class="section history-section">
    <header class="history-head">
      <div class="history-heading">
        <h3>{{ props.title ?? t("dev.history") }}</h3>
        <span v-if="items.length" class="history-count">{{ items.length }}</span>
      </div>
      <button
        v-if="items.length"
        type="button"
        class="icon-btn"
        :title="props.clearTitle ?? t('dev.clearHistory')"
        :aria-label="props.clearTitle ?? t('dev.clearHistory')"
        @click="emit('clear')"
      >
        <Trash2 :size="14" />
      </button>
    </header>

    <div v-if="items.length" ref="listRef" class="history-list">
      <div
        v-for="item in items"
        :key="item.id"
        role="button"
        tabindex="0"
        class="history-item"
        :class="{ active: item.id === activeId }"
        :aria-current="item.id === activeId ? 'true' : undefined"
        @click="onSelect(item.id, $event)"
        @keydown.enter.prevent="onSelect(item.id, $event)"
        @keydown.space.prevent="onSelect(item.id, $event)"
      >
        <div class="history-meta">
          <span v-if="item.tag" class="history-tag" :class="item.tone ?? 'accent'">{{ item.tag }}</span>
          <span class="history-time">{{ item.time }}</span>
          <button
            type="button"
            class="icon-btn history-del"
            :title="props.deleteTitle ?? t('dev.deleteRecord')"
            :aria-label="props.deleteTitle ?? t('dev.deleteRecord')"
            @click.stop="emit('remove', item.id)"
            @keydown.stop
          >
            <X :size="12" />
          </button>
        </div>
        <strong class="history-title" :title="item.title">{{ item.title }}</strong>
        <span v-if="item.subtitle" class="history-sub" :title="item.subtitle">{{ item.subtitle }}</span>
      </div>
    </div>

    <div v-else class="history-empty">
      <span class="history-empty-icon"><History :size="16" /></span>
      <p>{{ props.emptyText ?? t("dev.historyEmpty") }}</p>
    </div>
  </section>
</template>

<style scoped>
.history-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 10px 10px;
}
.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px;
}
.history-heading {
  display: flex;
  align-items: center;
  gap: 6px;
}
.history-head h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.history-count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--active);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.history-list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 2px;
}
.history-list.gliding .history-item[aria-current] {
  background: transparent;
  border-color: transparent;
}
.history-list :deep(.glide-dev-history) {
  border-radius: 8px;
  background: var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
}
.history-item {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  animation: history-item-in var(--dur) var(--ease-out);
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
@keyframes history-item-in {
  from {
    opacity: 0;
    translate: 0 -4px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}
.history-item:hover {
  background: var(--hover);
  border-color: var(--border);
}
.history-item.active {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
}
.history-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}
.history-tag {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
}
.history-tag.accent {
  color: var(--accent);
  background: var(--accent-soft);
}
.history-tag.success {
  color: var(--success);
  background: var(--success-soft);
}
.history-tag.danger {
  color: var(--danger);
  background: var(--danger-soft);
}
.history-tag.warning {
  color: var(--warning);
  background: var(--warning-soft);
}
.history-tag.muted {
  color: var(--text-2);
  background: var(--active);
}
.history-time {
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
}
.history-del {
  width: 20px;
  height: 20px;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.history-item:hover .history-del,
.history-item:focus-within .history-del,
.history-item.active .history-del {
  opacity: 1;
}
.history-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-sub {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 14px;
  text-align: center;
  color: var(--text-3);
}
.history-empty p {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
}
.history-empty-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
}
@media (max-width: 860px) {
  .history-list {
    max-height: 220px;
  }
}
</style>
