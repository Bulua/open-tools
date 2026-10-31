<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { categories } from "./tools";
import TopBar from "./components/TopBar.vue";
import ToolSidebar from "./components/ToolSidebar.vue";
import ToolPanel from "./components/ToolPanel.vue";
import EmptyState from "./components/EmptyState.vue";

const activeCategoryId = ref(categories[0].id);
// 记住每个分类上次选中的工具
const activeToolByCategory = ref<Record<string, string>>({});

const activeCategory = computed(() => categories.find((c) => c.id === activeCategoryId.value)!);
const activeTool = computed(() => {
  const tools = activeCategory.value.tools;
  const id = activeToolByCategory.value[activeCategoryId.value];
  return tools.find((t) => t.id === id) ?? tools[0];
});

const selectTool = (id: string) => {
  activeToolByCategory.value[activeCategoryId.value] = id;
};

const savedTheme = localStorage.getItem("theme");
const theme = ref<"light" | "dark">(
  savedTheme === "dark" || savedTheme === "light"
    ? savedTheme
    : matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
);
watch(
  theme,
  (t) => {
    document.documentElement.dataset.theme = t;
    localStorage.setItem("theme", t);
  },
  { immediate: true },
);
</script>

<template>
  <div class="app">
    <TopBar
      :categories="categories"
      :active-id="activeCategoryId"
      :theme="theme"
      @select="activeCategoryId = $event"
      @toggle-theme="theme = theme === 'dark' ? 'light' : 'dark'"
    />
    <div class="body">
      <ToolSidebar
        :category="activeCategory"
        :active-id="activeTool?.id"
        @select="selectTool"
      />
      <main class="main">
        <ToolPanel v-if="activeTool" :key="activeTool.id" :tool="activeTool" />
        <EmptyState
          v-else
          title="这里还没有工具"
          :description="`「${activeCategory.name}」分类下的工具正在规划中，敬请期待。`"
        />
      </main>
    </div>
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
  padding: 20px 24px 24px;
  overflow: auto;
}
</style>
