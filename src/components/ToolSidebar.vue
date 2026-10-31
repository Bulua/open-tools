<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-vue-next";
import type { Category } from "../tools";

const props = defineProps<{ category: Category; activeId?: string; collapsed: boolean }>();
defineEmits<{ select: [id: string]; toggle: [] }>();

const keyword = ref("");
watch(
  () => props.category.id,
  () => (keyword.value = ""),
);

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  if (!k) return props.category.tools;
  return props.category.tools.filter((t) => (t.name + t.desc).toLowerCase().includes(k));
});
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <div v-if="!collapsed" class="head">
      <h2>{{ category.name }}</h2>
      <span class="count">{{ category.tools.length }}</span>
    </div>

    <label v-if="!collapsed && category.tools.length > 6" class="filter">
      <Search :size="14" />
      <input v-model="keyword" placeholder="筛选" />
    </label>

    <ul class="list">
      <li v-for="t in filtered" :key="t.id">
        <button
          class="item"
          :class="{ active: t.id === activeId }"
          :title="collapsed ? t.name : t.desc"
          @click="$emit('select', t.id)"
        >
          <component :is="t.icon" :size="16" :stroke-width="1.75" class="icon" />
          <span v-if="!collapsed" class="label">{{ t.name }}</span>
          <span v-if="!collapsed && !t.actions" class="soon">即将上线</span>
        </button>
      </li>
    </ul>

    <p v-if="!collapsed && !filtered.length" class="empty">
      {{ category.tools.length ? "没有匹配的工具" : "这个分类还是空的" }}
    </p>

    <button class="toggle" :title="collapsed ? '展开侧栏' : '收起侧栏'" @click="$emit('toggle')">
      <PanelLeftOpen v-if="collapsed" :size="16" />
      <PanelLeftClose v-else :size="16" />
    </button>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 232px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 20px 10px 10px;
  background: var(--bg-sunken);
  border-right: 1px solid var(--border);
  transition: width 0.2s ease;
  overflow: hidden;
}
.sidebar.collapsed {
  width: 56px;
  padding-top: 14px;
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 10px 12px;
}
h2 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 400;
  white-space: nowrap;
}
.count {
  font-size: 12px;
  color: var(--text-3);
}

.filter {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 4px 10px;
  padding: 0 8px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-3);
}
.filter:focus-within {
  border-color: var(--border-strong);
}
.filter input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: none;
  font-size: 13px;
}

.list {
  min-height: 0;
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.item {
  width: 100%;
  height: 34px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-2);
  text-align: left;
  white-space: nowrap;
}
.collapsed .item {
  justify-content: center;
  padding: 0;
}
.item:hover {
  background: var(--hover);
  color: var(--text);
}
.item.active {
  background: var(--active);
  color: var(--text);
  font-weight: 500;
}
.item.active .icon {
  color: var(--accent);
}
.icon {
  flex-shrink: 0;
}
.label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.soon {
  font-size: 11px;
  color: var(--text-3);
  font-weight: 400;
}

.empty {
  margin: 0;
  padding: 4px 10px;
  font-size: 13px;
  color: var(--text-3);
}

.toggle {
  align-self: flex-start;
  width: 32px;
  height: 32px;
  margin: auto 2px 0;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-3);
}
.collapsed .toggle {
  align-self: center;
  margin: auto 0 0;
}
.toggle:hover {
  background: var(--hover);
  color: var(--text);
}
</style>
