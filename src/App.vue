<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { localizedCategories } from "@/locales/tools";
import { useStoredRef } from "@/composables/useStoredRef";
import { useTheme } from "@/composables/useTheme";
import AppHeader from "@/components/layout/AppHeader.vue";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import LaunchIntro from "@/components/layout/LaunchIntro.vue";
import { rememberRecentTool } from "@/composables/toolLibrary";
import ToolWorkspace, { type WorkspacePage } from "@/components/layout/ToolWorkspace.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import CommandPalette from "@/components/common/CommandPalette.vue";
import UpdateDialog from "@/components/layout/UpdateDialog.vue";
import { useUpdater } from "@/composables/useUpdater";
import ClockAlerts from "@/components/layout/ClockAlerts.vue";
import AppToast from "@/components/layout/AppToast.vue";
import { startCountdownTicker } from "@/tools/time/clock/clockStore";
import { startCalendarReminders } from "@/tools/time/calendar/calendarStore";
import { startBrandingSync } from "@/utils/branding";
import { categories as allCategories } from "@/tools";
import { restoreCategorySelection } from "@/tools/categorySelection";
import { registerScreenshotShortcut } from "@/tools/daily/screenshot-history/screenshot";
import { registerClipboardShortcut } from "@/tools/daily/clipboard-history/clipboardHistory";
import { showError } from "@/utils/errorToast";

const { t } = useI18n();
const { theme, toggleTheme } = useTheme();

const categories = localizedCategories;
const activePage = ref<WorkspacePage>("home");
const fullPanel = computed(() => activePage.value !== "tool");
const openHome = () => { activePage.value = "home"; };
const openAi = () => { activePage.value = "ai"; };

// ---------- 当前分类与工具（会被记住，下次打开时恢复） ----------
const activeCategoryId = useStoredRef("category", categories.value[0].id);
/** 每个分类上次选中的工具 */
const activeToolByCategory = useStoredRef<Record<string, string>>("toolByCategory", {});
const restoredSelection = restoreCategorySelection(allCategories, activeCategoryId.value, activeToolByCategory.value);
activeCategoryId.value = restoredSelection.categoryId;
if (JSON.stringify(restoredSelection.tools) !== JSON.stringify(activeToolByCategory.value)) {
  activeToolByCategory.value = restoredSelection.tools;
}
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
  activePage.value = "tool";
};

const selectCategory = (id: string) => {
  activeCategoryId.value = id;
  activePage.value = "tool";
};
watch(
  () => activePage.value === "tool" ? activeTool.value?.id : undefined,
  (id) => { if (id) rememberRecentTool(id); },
);

const pickSearchTool = (categoryId: string, toolId: string) => {
  selectTool(categoryId, toolId);
  searchOpen.value = false;
};

const openClock = () => {
  selectTool("time", "clock");
};

// 主窗口隐藏到托盘时不会卸载；完全退出后再次启动才会重新播放。
const introPhase = ref<"playing" | "leaving" | "done">("playing");
let introFrame = 0;
let playTimer = 0;
let finishTimer = 0;
onMounted(() => {
  introFrame = requestAnimationFrame(() => {
    playTimer = window.setTimeout(() => {
      introPhase.value = "leaving";
      finishTimer = window.setTimeout(() => (introPhase.value = "done"), 1500);
    }, 2000);
  });
});
onBeforeUnmount(() => {
  cancelAnimationFrame(introFrame);
  clearTimeout(playTimer);
  clearTimeout(finishTimer);
});

// ---------- 全局搜索（Ctrl + K） ----------
const searchOpen = ref(false);

const onKeydown = (e: KeyboardEvent) => {
  if (introPhase.value !== "done") return;
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
onBeforeUnmount(startCalendarReminders());

// ---------- 远程图标：不发新版本也能换图标，见 utils/branding.ts ----------
onMounted(startBrandingSync);

// ---------- Windows 全局截图快捷键 ----------
onMounted(() => void registerScreenshotShortcut().catch(() => undefined));

// ---------- Windows 剪贴板历史入口 ----------
let removeTrayListener = () => {};
let disposed = false;
onMounted(() => {
  void registerClipboardShortcut().catch(() => undefined);
  void getCurrentWebviewWindow().listen<string>("clipboard-history-tray-error", ({ payload }) => showError(payload))
    .then((unlisten) => {
      if (disposed) unlisten();
      else removeTrayListener = unlisten;
    }).catch(showError);
});
onBeforeUnmount(() => {
  disposed = true;
  removeTrayListener();
});
</script>

<template>
  <div class="app">
    <AppHeader
      :inert="introPhase !== 'done'"
      :categories="categories"
      :active-id="activePage === 'tool' ? activeCategory.id : activePage"
      :theme="theme"
      :compact="!fullPanel && sidebarCollapsed"
      @select="selectCategory"
      @home="openHome"
      @ai="openAi"
      @toggle-theme="toggleTheme"
      @open-search="searchOpen = true"
    />
    <div class="body" :inert="introPhase !== 'done'">
      <div class="sidebar-region" :class="{ compact: sidebarCollapsed, hidden: fullPanel }" :inert="fullPanel" :aria-hidden="fullPanel">
        <AppSidebar
          :category="activeCategory"
          :active-id="activeTool?.id"
          :collapsed="sidebarCollapsed"
          @select="selectTool(activeCategory.id, $event)"
          @toggle="sidebarCollapsed = !sidebarCollapsed"
          @open-update="updateOpen = true"
        />
      </div>
      <main class="main">
        <!-- 切换工具时保留之前工具的输入和结果，最多缓存 12 个 -->
        <ToolWorkspace
          :page="activePage"
          :categories="categories"
          :tool="activeTool"
          @select="selectTool"
          @search="searchOpen = true"
        />
        <EmptyState
          v-if="activePage === 'tool' && !activeTool"
          :title="t('app.comingSoonTitle', { name: activeCategory.name })"
          :description="t('app.comingSoonDesc')"
        />
      </main>
    </div>
    <Transition name="modal">
      <CommandPalette
        v-if="searchOpen"
        :categories="categories"
        @pick="pickSearchTool"
        @close="searchOpen = false"
      />
    </Transition>

    <Transition name="modal">
      <UpdateDialog v-if="updateOpen" @close="updateOpen = false" />
    </Transition>
    <ClockAlerts @open="openClock" />
    <!-- 各工具的报错统一在窗口上方提示，见 utils/errorToast.ts -->
    <AppToast />
    <LaunchIntro v-if="introPhase !== 'done'" :leaving="introPhase === 'leaving'" />
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
.sidebar-region {
  display: flex;
  width: 240px;
  flex-shrink: 0;
  overflow: hidden;
  transition: width var(--dur-slow) var(--ease-out);
}
.sidebar-region.compact { width: 56px; }
.sidebar-region.hidden { width: 0; }
/* 内边距由工具区自己控制，工具栏可以贴边铺满 */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

</style>
