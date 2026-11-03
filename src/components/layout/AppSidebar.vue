<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-vue-next";
import { isAvailable, type Category } from "@/tools";
import { boxOf, glide } from "@/utils/motion";

const props = defineProps<{ category: Category; activeId?: string; collapsed: boolean }>();
defineEmits<{ select: [id: string]; toggle: [] }>();

const keyword = ref("");
watch(
  () => props.category.id,
  () => (keyword.value = ""),
);

// 切换工具时，当前工具的卡片从旧位置滑到新位置（同一分类内才滑）
const list = ref<HTMLElement>();
watch(
  () => props.activeId,
  async () => {
    const old = list.value?.querySelector<HTMLElement>(".item.active");
    if (!old) return;
    const from = boxOf(old);
    await nextTick();
    const now = list.value?.querySelector<HTMLElement>(".item.active");
    if (list.value && now && now !== old && old.isConnected) glide(list.value, from, boxOf(now), "card");
  },
  { flush: "pre" },
);

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  if (!k) return props.category.tools;
  return props.category.tools.filter((t) => (t.name + t.desc).toLowerCase().includes(k));
});
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <label v-if="!collapsed" class="filter">
      <Search :size="14" />
      <input v-model="keyword" :placeholder="`搜索 ${category.name}`" @keydown.esc="keyword = ''" />
      <button v-if="keyword" class="clear" title="清空" @click="keyword = ''"><X :size="12" /></button>
    </label>

    <ul ref="list" class="list">
      <li v-for="t in filtered" :key="t.id">
        <button
          class="item"
          :class="{ active: t.id === activeId }"
          :title="collapsed ? t.name : t.desc"
          @click="$emit('select', t.id)"
        >
          <component :is="t.icon" :size="16" :stroke-width="1.75" class="icon" />
          <span v-if="!collapsed" class="label">{{ t.name }}</span>
          <span v-if="!collapsed && !isAvailable(t)" class="soon">即将上线</span>
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
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 10px 10px;
  background: var(--bg-sunken);
  border-right: 1px solid var(--border);
  transition: width var(--dur-slow) var(--ease-out);
  overflow: hidden;
}
.sidebar.collapsed {
  width: 56px;
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
  transition: border-color var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out), color var(--dur) var(--ease-out);
}
/* 聚焦时边框和放大镜变成强调色，外面一圈柔和的光晕，与输入框 .field 一致 */
.filter:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
  color: var(--accent);
}
.filter input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: none;
  font-size: 13px;
}
.filter input::placeholder {
  color: var(--text-3);
}
.clear {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: var(--active);
  color: var(--text-2);
  animation: clear-in var(--dur) var(--ease-out);
}
/* 输入内容后出现的清空按钮从小放大 */
@keyframes clear-in {
  from {
    transform: scale(0.4);
  }
}
.clear:hover {
  color: var(--text);
}

.list {
  position: relative;
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
  height: 36px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: var(--text-2);
  text-align: left;
  white-space: nowrap;
  /* 在滑动的卡片（.glide-card）上面 */
  position: relative;
  z-index: 1;
  /* 底色不做过渡：当前工具的卡片由滑块接管，过渡会让新旧卡片在滑动前后各闪一下 */
  transition: color var(--dur-fast) var(--ease-out);
}
.collapsed .item {
  justify-content: center;
  padding: 0;
}
.item:hover {
  background: var(--hover);
  color: var(--text);
}
/* 当前工具像一张浮起的卡片，与分段按钮的选中样式一致 */
.item.active {
  background: var(--surface);
  border-color: var(--border);
  box-shadow: var(--shadow-sm);
  color: var(--text);
  font-weight: 500;
}
/* 卡片滑动期间由滑块代替当前工具自己的卡片样式 */
.gliding .item.active {
  background: none;
  border-color: transparent;
  box-shadow: none;
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
