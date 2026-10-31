<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Search, PackageOpen } from "lucide-vue-next";
import type { Category } from "../tools";

const props = defineProps<{ category: Category; activeId?: string }>();
defineEmits<{ select: [id: string] }>();

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
  <aside class="sidebar">
    <div class="search">
      <Search :size="15" class="search-icon" />
      <input v-model="keyword" placeholder="搜索工具" />
    </div>

    <div class="section-title">
      {{ category.name }}
      <span>{{ filtered.length }}</span>
    </div>

    <ul v-if="filtered.length" class="list">
      <li
        v-for="t in filtered"
        :key="t.id"
        class="item"
        :class="{ active: t.id === activeId }"
        @click="$emit('select', t.id)"
      >
        <div class="item-icon"><component :is="t.icon" :size="17" /></div>
        <div class="item-text">
          <div class="item-name">
            {{ t.name }}
            <span v-if="!t.actions" class="badge">开发中</span>
          </div>
          <div class="item-desc">{{ t.desc }}</div>
        </div>
      </li>
    </ul>

    <div v-else class="empty">
      <PackageOpen :size="28" />
      <span>{{ category.tools.length ? "没有匹配的工具" : "暂无工具" }}</span>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--border);
  padding: 16px 12px;
  overflow: hidden;
}

.search {
  position: relative;
  margin-bottom: 16px;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-3);
}
.search input {
  width: 100%;
  height: 34px;
  padding: 0 10px 0 32px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.search input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.search input::placeholder {
  color: var(--text-3);
}

.section-title {
  display: flex;
  justify-content: space-between;
  padding: 0 8px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.5px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
}
.item:hover {
  background: var(--surface-2);
}
.item.active {
  background: var(--accent-soft);
}
.item.active::before {
  content: "";
  position: absolute;
  left: -12px;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}
.item-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
}
.item.active .item-icon {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: transparent;
  color: #fff;
}
.item-text {
  min-width: 0;
}
.item-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}
.item.active .item-name {
  color: var(--accent-text);
}
.item-desc {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge {
  font-size: 10px;
  padding: 0 5px;
  border-radius: 4px;
  line-height: 16px;
  font-weight: 500;
  color: var(--text-3);
  border: 1px solid var(--border);
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-3);
  font-size: 13px;
}
</style>
