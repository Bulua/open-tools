<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { categories } from "./tools";
import TopBar from "./components/TopBar.vue";
import ToolSidebar from "./components/ToolSidebar.vue";
import ToolPanel from "./components/ToolPanel.vue";
import EmptyState from "./components/EmptyState.vue";
import CommandPalette from "./components/CommandPalette.vue";

/** 读写 localStorage 中的 JSON，用于记住界面状态 */
const stored = <T,>(key: string, fallback: T) => {
  let initial = fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) initial = JSON.parse(raw);
  } catch {}
  const r = ref(initial);
  watch(r, (v) => localStorage.setItem(key, JSON.stringify(v)), { deep: true });
  return r;
};

const activeCategoryId = stored("category", categories[0].id);
// 记住每个分类上次选中的工具
const activeToolByCategory = stored<Record<string, string>>("toolByCategory", {});
const collapsed = stored("sidebarCollapsed", false);

const activeCategory = computed(
  () => categories.find((c) => c.id === activeCategoryId.value) ?? categories[0],
);
const activeTool = computed(() => {
  const tools = activeCategory.value.tools;
  const id = activeToolByCategory.value[activeCategory.value.id];
  return tools.find((t) => t.id === id) ?? tools[0];
});

const selectTool = (id: string) => {
  activeToolByCategory.value[activeCategory.value.id] = id;
};

const theme = stored<"light" | "dark">(
  "theme",
  matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
);
watch(theme, (t) => (document.documentElement.dataset.theme = t), { immediate: true });

const searchOpen = ref(false);
const pickFromSearch = (categoryId: string, toolId: string) => {
  activeCategoryId.value = categoryId;
  activeToolByCategory.value[categoryId] = toolId;
  searchOpen.value = false;
};

const onKey = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    searchOpen.value = !searchOpen.value;
  }
};
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="app">
    <TopBar
      :categories="categories"
      :active-id="activeCategory.id"
      :theme="theme"
      @select="activeCategoryId = $event"
      @toggle-theme="theme = theme === 'dark' ? 'light' : 'dark'"
      @open-search="searchOpen = true"
    />
    <div class="body">
      <ToolSidebar
        :category="activeCategory"
        :active-id="activeTool?.id"
        :collapsed="collapsed"
        @select="selectTool"
        @toggle="collapsed = !collapsed"
      />
      <main class="main">
        <ToolPanel
          v-if="activeTool"
          :key="activeTool.id"
          :tool="activeTool"
          :category-name="activeCategory.name"
        />
        <EmptyState
          v-else
          :title="`${activeCategory.name}，敬请期待`"
          description="这个分类下的工具正在规划中。你可以按 Ctrl K 搜索其他分类的工具。"
        />
      </main>
    </div>

    <CommandPalette
      v-if="searchOpen"
      :categories="categories"
      @pick="pickFromSearch"
      @close="searchOpen = false"
    />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 28px 40px 32px;
  overflow: auto;
}
</style>
