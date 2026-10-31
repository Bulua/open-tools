<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { categories } from "@/tools";
import { useStoredRef } from "@/composables/useStoredRef";
import { useTheme } from "@/composables/useTheme";
import AppHeader from "@/components/layout/AppHeader.vue";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import ToolView from "@/components/tool/ToolView.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import CommandPalette from "@/components/common/CommandPalette.vue";
import UpdateDialog from "@/components/layout/UpdateDialog.vue";
import { useUpdater } from "@/composables/useUpdater";

const { theme, toggleTheme } = useTheme();

// ---------- 当前分类与工具（会被记住，下次打开时恢复） ----------
const activeCategoryId = useStoredRef("category", categories[0].id);
/** 每个分类上次选中的工具 */
const activeToolByCategory = useStoredRef<Record<string, string>>("toolByCategory", {});
const sidebarCollapsed = useStoredRef("sidebarCollapsed", false);

const activeCategory = computed(
  () => categories.find((c) => c.id === activeCategoryId.value) ?? categories[0],
);
const activeTool = computed(() => {
  const tools = activeCategory.value.tools;
  const id = activeToolByCategory.value[activeCategory.value.id];
  return tools.find((t) => t.id === id) ?? tools[0];
});

const selectTool = (categoryId: string, toolId: string) => {
  activeCategoryId.value = categoryId;
  activeToolByCategory.value[categoryId] = toolId;
};

// ---------- 全局搜索（Ctrl + K） ----------
const searchOpen = ref(false);

const onKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    searchOpen.value = !searchOpen.value;
  }
};
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

// ---------- 在线更新：启动几秒后在后台检查一次，不影响打开速度 ----------
const updateOpen = ref(false);
const { checkForUpdate } = useUpdater();
onMounted(() => setTimeout(() => checkForUpdate(true), 3000));
</script>

<template>
  <div class="app">
    <AppHeader
      :categories="categories"
      :active-id="activeCategory.id"
      :theme="theme"
      :compact="sidebarCollapsed"
      @select="activeCategoryId = $event"
      @toggle-theme="toggleTheme"
      @open-search="searchOpen = true"
      @open-update="updateOpen = true"
    />
    <div class="body">
      <AppSidebar
        :category="activeCategory"
        :active-id="activeTool?.id"
        :collapsed="sidebarCollapsed"
        @select="selectTool(activeCategory.id, $event)"
        @toggle="sidebarCollapsed = !sidebarCollapsed"
      />
      <main class="main">
        <!-- 切换工具时保留之前工具的输入和结果，最多缓存 12 个 -->
        <KeepAlive :max="12">
          <ToolView v-if="activeTool" :key="activeTool.id" :tool="activeTool" />
        </KeepAlive>
        <EmptyState
          v-if="!activeTool"
          :title="`${activeCategory.name}，敬请期待`"
          description="这个分类下的工具正在规划中。你可以按 Ctrl K 搜索其他分类的工具。"
        />
      </main>
    </div>

    <CommandPalette
      v-if="searchOpen"
      :categories="categories"
      @pick="(c, t) => (selectTool(c, t), (searchOpen = false))"
      @close="searchOpen = false"
    />

    <UpdateDialog v-if="updateOpen" @close="updateOpen = false" />
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
/* 内边距由工具区自己控制，工具栏可以贴边铺满 */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
