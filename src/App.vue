<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { localizedCategories } from "@/locales/tools";
import { useStoredRef } from "@/composables/useStoredRef";
import { useTheme } from "@/composables/useTheme";
import AppHeader from "@/components/layout/AppHeader.vue";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import MobileNavigation, { type MobilePage } from "@/components/layout/MobileNavigation.vue";
import LaunchIntro from "@/components/layout/LaunchIntro.vue";
import ToolView from "@/components/tool/ToolView.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import CommandPalette from "@/components/common/CommandPalette.vue";
import UpdateDialog from "@/components/layout/UpdateDialog.vue";
import { useUpdater } from "@/composables/useUpdater";
import CountdownAlerts from "@/components/layout/CountdownAlerts.vue";
import ErrorToast from "@/components/layout/ErrorToast.vue";
import { startCountdownTicker } from "@/tools/utility/countdownStore";
import { calendarDesktop, startCalendarReminders } from "@/tools/utility/calendarStore";
import { startBrandingSync } from "@/utils/branding";
import { categoriesForPlatform } from "@/tools";
import { getAppPlatform } from "@/utils/platform";
import { registerScreenshotShortcut } from "@/tools/image/screenshot/screenshot";
import { registerClipboardShortcut } from "@/tools/encode/clipboardHistory";
import { showError } from "@/utils/errorToast";

const { t } = useI18n();
const { theme, toggleTheme } = useTheme();

const platform = getAppPlatform();
const categories = computed(() => categoriesForPlatform(localizedCategories.value, platform));

// 手机端使用独立的页面式导航，桌面端继续使用顶部分类 + 左侧工具栏。
const mobileMedia = window.matchMedia("(max-width: 720px)");
const isMobile = ref(mobileMedia.matches);
const mobilePage = ref<MobilePage>("home");
const onMobileChange = (event: MediaQueryListEvent) => (isMobile.value = event.matches);
onMounted(() => mobileMedia.addEventListener("change", onMobileChange));
onBeforeUnmount(() => mobileMedia.removeEventListener("change", onMobileChange));

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

const pickSearchTool = (categoryId: string, toolId: string) => {
  selectTool(categoryId, toolId);
  if (isMobile.value) mobilePage.value = "tool";
  searchOpen.value = false;
};

const openCountdown = () => {
  selectTool("time", "countdown");
  if (isMobile.value) mobilePage.value = "tool";
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
const { supported: updaterSupported, startAutoCheck, dialogOpen: updateOpen } = useUpdater();
onMounted(startAutoCheck);

// ---------- 倒计时：在后台每秒检查，到期时在任何工具里都会提醒 ----------
onMounted(startCountdownTicker);
if (calendarDesktop) {
  const stopCalendarReminders = startCalendarReminders();
  onBeforeUnmount(stopCalendarReminders);
}

// ---------- 远程图标：不发新版本也能换图标，见 utils/branding.ts ----------
onMounted(startBrandingSync);

// ---------- Windows 全局截图快捷键 ----------
onMounted(() => void registerScreenshotShortcut().catch(() => undefined));

// ---------- Windows 剪贴板历史入口 ----------
if (platform === "desktop") {
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
}
</script>

<template>
  <div class="app">
    <AppHeader
      :inert="introPhase !== 'done'"
      :categories="categories"
      :active-id="activeCategory.id"
      :theme="theme"
      :compact="sidebarCollapsed"
      @select="activeCategoryId = $event"
      @toggle-theme="toggleTheme"
      @open-search="searchOpen = true"
    />
    <div v-if="!isMobile" class="body" :inert="introPhase !== 'done'">
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
    <MobileNavigation
      v-else
      v-model:page="mobilePage"
      :inert="introPhase !== 'done'"
      :categories="categories"
      :active-category-id="activeCategory.id"
      :active-tool="activeTool"
      @select-category="activeCategoryId = $event"
      @select-tool="selectTool"
    />

    <Transition name="modal">
      <CommandPalette
        v-if="searchOpen"
        :categories="categories"
        @pick="pickSearchTool"
        @close="searchOpen = false"
      />
    </Transition>

    <Transition name="modal">
      <UpdateDialog v-if="updaterSupported && updateOpen" @close="updateOpen = false" />
    </Transition>
    <CountdownAlerts @open="openCountdown" />
    <!-- 各工具的报错统一在窗口上方提示，见 utils/errorToast.ts -->
    <ErrorToast />
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
/* 内边距由工具区自己控制，工具栏可以贴边铺满 */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

</style>
