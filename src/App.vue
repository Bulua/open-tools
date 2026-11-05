<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { localizedCategories as categories } from "@/locales/tools";
import { useStoredRef } from "@/composables/useStoredRef";
import { useTheme } from "@/composables/useTheme";
import AppHeader from "@/components/layout/AppHeader.vue";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import ToolView from "@/components/tool/ToolView.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import CommandPalette from "@/components/common/CommandPalette.vue";
import UpdateDialog from "@/components/layout/UpdateDialog.vue";
import { useUpdater } from "@/composables/useUpdater";
import CountdownAlerts from "@/components/layout/CountdownAlerts.vue";
import ErrorToast from "@/components/layout/ErrorToast.vue";
import { startCountdownTicker } from "@/tools/utility/countdownStore";
import { startBrandingSync } from "@/utils/branding";

const { t } = useI18n();
const { theme, toggleTheme } = useTheme();

// ---------- 当前分类与工具（会被记住，下次打开时恢复） ----------
const activeCategoryId = useStoredRef("category", categories.value[0].id);
/** 每个分类上次选中的工具 */
const activeToolByCategory = useStoredRef<Record<string, string>>("toolByCategory", {});
const sidebarCollapsed = useStoredRef("sidebarCollapsed", false);

const activeCategory = computed(
  () => categories.value.find((c) => c.id === activeCategoryId.value) ?? categories.value[0],
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

// ---------- 在线更新：启动几秒后在后台检查，之后定时检查，发现新版本时弹出更新对话框（见 useUpdater） ----------
const { startAutoCheck, dialogOpen: updateOpen } = useUpdater();
onMounted(startAutoCheck);

// ---------- 倒计时：在后台每秒检查，到期时在任何工具里都会提醒 ----------
onMounted(startCountdownTicker);

// ---------- 远程图标：不发新版本也能换图标，见 utils/branding.ts ----------
onMounted(startBrandingSync);
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
    />
    <div class="body">
      <AppSidebar
        :category="activeCategory"
        :active-id="activeTool?.id"
        :collapsed="sidebarCollapsed"
        @select="selectTool(activeCategory.id, $event)"
        @toggle="sidebarCollapsed = !sidebarCollapsed"
        @open-update="updateOpen = true"
      />
      <main class="main">
        <!-- 切换工具时保留之前工具的输入和结果，最多缓存 12 个 -->
        <KeepAlive :max="12">
          <ToolView v-if="activeTool" :key="activeTool.id" :tool="activeTool" />
        </KeepAlive>
        <EmptyState
          v-if="!activeTool"
          :title="t('app.comingSoonTitle', { name: activeCategory.name })"
          :description="t('app.comingSoonDesc')"
        />
      </main>
    </div>

    <Transition name="modal">
      <CommandPalette
        v-if="searchOpen"
        :categories="categories"
        @pick="(c, t) => (selectTool(c, t), (searchOpen = false))"
        @close="searchOpen = false"
      />
    </Transition>

    <Transition name="modal">
      <UpdateDialog v-if="updateOpen" @close="updateOpen = false" />
    </Transition>
    <CountdownAlerts @open="selectTool('time', 'countdown')" />
    <!-- 各工具的报错统一在窗口上方提示，见 utils/errorToast.ts -->
    <ErrorToast />
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
