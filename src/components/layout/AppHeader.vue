<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Bug, Check, ChevronLeft, ChevronRight, Github, House, Languages, Moon, Sparkles, Sun } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { hasDesktopRuntime } from "@/api/common";
import type { Category } from "@/tools";
import { usePopover } from "@/composables/usePopover";
import { LOCALES, useLocale, type LocalePref } from "@/locales";
import { REPO_URL, openExternal } from "@/utils/openExternal";
import { boxOf, glide } from "@/utils/motion";
import ToolSearchButton from "@/components/common/ToolSearchButton.vue";
import AppLogo from "./AppLogo.vue";

const props = defineProps<{
  categories: Category[];
  activeId: string;
  theme: "light" | "dark";
  /** 侧栏收起时品牌区跟着收窄，保持与侧栏对齐 */
  compact?: boolean;
}>();
defineEmits<{ home: []; ai: []; select: [id: string]; toggleTheme: []; openSearch: [] }>();

const { t } = useI18n();

// 窗口最大化状态同步与基础窗口控制（一体化自定义标题栏）
const isMaximized = ref(false);
let unlistenResize: (() => void) | undefined;
let disposed = false;

const syncMaximized = async () => {
  if (!hasDesktopRuntime()) return;
  isMaximized.value = await getCurrentWindow().isMaximized().catch(() => isMaximized.value);
};

const minimizeWindow = () => {
  if (!hasDesktopRuntime()) return;
  void getCurrentWindow().minimize().catch(() => {});
};

const toggleMaximizeWindow = async () => {
  if (!hasDesktopRuntime()) return;
  const win = getCurrentWindow();
  await win.toggleMaximize().catch(() => {});
  isMaximized.value = await win.isMaximized().catch(() => isMaximized.value);
};

const closeWindow = () => {
  if (!hasDesktopRuntime()) return;
  void getCurrentWindow().close().catch(() => {});
};

// 语言切换菜单：跟随系统，或固定某种语言
const { pref: localePref } = useLocale();
const langBtn = ref<HTMLElement>();
const langMenu = ref<HTMLElement>();
const { open: langOpen, style: langStyle, toggle: toggleLang, close: closeLang } = usePopover(langBtn, langMenu, { minWidth: 140 });
const localeOptions = computed<{ value: LocalePref; label: string }[]>(() => [{ value: "auto", label: t("locale.auto") }, ...LOCALES]);
const pickLocale = (value: LocalePref) => {
  localePref.value = value;
  closeLang();
};

const issueBtn = ref<HTMLElement>();
const issueMenu = ref<HTMLElement>();
const { open: issueOpen, style: issueStyle, toggle: toggleIssue, close: closeIssue } = usePopover(issueBtn, issueMenu, { minWidth: 160 });
const issueLinks = [
  { label: "header.githubIssues", url: "https://github.com/Bulua/open-tools/issues/new" },
  { label: "header.giteeIssues", url: "https://gitee.com/bulua/open-tools/issues/new" },
];
const openIssue = (url: string) => {
  closeIssue();
  openExternal(url);
};
const showIssueMenu = () => {
  closeLang();
  toggleIssue();
};
const showLangMenu = () => {
  closeIssue();
  toggleLang();
};

// 分类多了以后横向滚动，两侧出现箭头
const scroller = ref<HTMLElement>();
const canLeft = ref(false);
const canRight = ref(false);

const update = () => {
  const el = scroller.value;
  if (!el) return;
  canLeft.value = el.scrollLeft > 1;
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
};

const scrollBy = (dir: number) => {
  scroller.value?.scrollBy({ left: dir * scroller.value.clientWidth * 0.6, behavior: "smooth" });
};

// 鼠标滚轮纵向滚动时也能横向翻分类
const onWheel = (e: WheelEvent) => {
  if (!scroller.value || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  scroller.value.scrollLeft += e.deltaY;
};

let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(update);
  observer.observe(scroller.value!);
  update();

  if (hasDesktopRuntime()) {
    void syncMaximized();
    void getCurrentWindow()
      .onResized(() => {
        void syncMaximized();
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else unlistenResize = unlisten;
      })
      .catch(() => {});
  }
});
onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  unlistenResize?.();
});

// 切换分类时，暖色胶囊底框从旧标签平滑滑到新标签
watch(
  () => props.activeId,
  async () => {
    const old = scroller.value?.querySelector<HTMLElement>(".tab.active");
    if (!old) return;
    const from = boxOf(old);
    await nextTick();
    const now = scroller.value?.querySelector<HTMLElement>(".tab.active");
    if (scroller.value && now && now !== old) glide(scroller.value, from, boxOf(now), "nav");
  },
  { flush: "pre" },
);

watch(
  () => props.activeId,
  async (id) => {
    await nextTick();
    scroller.value
      ?.querySelector<HTMLElement>(`[data-id="${id}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  },
);
</script>

<template>
  <header class="topbar" data-tauri-drag-region>
    <div class="brand-wrap" :class="{ compact }" data-tauri-drag-region>
      <button class="brand" :title="t('home.title')" :aria-label="t('home.title')" @click="$emit('home')">
        <span class="logo-shell">
          <AppLogo :size="20" />
        </span>
        <span v-if="!compact" class="name">Open Tools</span>
      </button>
    </div>

    <div class="tabs-wrap" :class="{ 'fade-left': canLeft, 'fade-right': canRight }" data-tauri-drag-region>
      <button v-show="canLeft" class="arrow left" :aria-label="t('header.scrollLeft')" @click="scrollBy(-1)">
        <ChevronLeft :size="15" />
      </button>
      <nav ref="scroller" class="tabs" data-tauri-drag-region @scroll="update" @wheel.prevent="onWheel">
        <button data-id="home" class="tab home-tab" :class="{ active: activeId === 'home' }" @click="$emit('home')">
          <House :size="15" />
          <span>{{ t('home.title') }}</span>
        </button>
        <button data-id="ai" class="tab ai-tab" :class="{ active: activeId === 'ai' }" @click="$emit('ai')">
          <Sparkles :size="15" />
          <span>{{ t('ai.navTitle') }}</span>
        </button>
        <button
          v-for="c in categories"
          :key="c.id"
          :data-id="c.id"
          class="tab"
          :class="{ active: c.id === activeId }"
          @click="$emit('select', c.id)"
        >
          <span>{{ c.name }}</span>
          <span class="count">{{ c.tools.length }}</span>
        </button>
      </nav>
      <button v-show="canRight" class="arrow right" :aria-label="t('header.scrollRight')" @click="scrollBy(1)">
        <ChevronRight :size="15" />
      </button>
    </div>

    <div class="actions" data-tauri-drag-region>
      <div class="search-slot" :class="{ hidden: activeId === 'home' }" :inert="activeId === 'home'" :aria-hidden="activeId === 'home'">
        <ToolSearchButton @search="$emit('openSearch')" />
      </div>
      <div class="action-group">
        <button ref="langBtn" class="theme-btn" :class="{ active: langOpen }" :title="t('locale.title')" :aria-label="t('locale.title')" @click="showLangMenu">
          <Languages :size="15" />
        </button>
        <button class="theme-btn" :title="theme === 'dark' ? t('header.lightMode') : t('header.darkMode')" :aria-label="theme === 'dark' ? t('header.lightMode') : t('header.darkMode')" @click="$emit('toggleTheme')">
          <Sun v-if="theme === 'dark'" :size="15" />
          <Moon v-else :size="15" />
        </button>
        <button class="theme-btn" :title="t('header.github', { url: REPO_URL })" :aria-label="t('header.github', { url: REPO_URL })" @click="openExternal(REPO_URL)">
          <Github :size="15" />
        </button>
        <button ref="issueBtn" class="theme-btn desktop-extra" :class="{ active: issueOpen }" :title="t('header.reportBug')" :aria-label="t('header.reportBug')" :aria-expanded="issueOpen" aria-haspopup="menu" @click="showIssueMenu">
          <Bug :size="15" />
        </button>
      </div>
      <span class="win-divider" data-tauri-drag-region aria-hidden="true" />
      <div class="window-controls">
        <button class="win-btn" :title="t('header.minimize')" :aria-label="t('header.minimize')" @click="minimizeWindow">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M1 5h8" />
          </svg>
        </button>
        <button class="win-btn" :title="isMaximized ? t('header.restore') : t('header.maximize')" :aria-label="isMaximized ? t('header.restore') : t('header.maximize')" @click="toggleMaximizeWindow">
          <svg v-if="isMaximized" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 3V1.5h5.5V7H7" />
            <rect x="1.5" y="3" width="5.5" height="5.5" rx="0.8" />
          </svg>
          <svg v-else width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="1.5" y="1.5" width="7" height="7" rx="1" />
          </svg>
        </button>
        <button class="win-btn close" :title="t('header.close')" :aria-label="t('header.close')" @click="closeWindow">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="pop">
        <div v-if="langOpen" ref="langMenu" class="lang-menu" role="listbox" :style="langStyle">
          <div
            v-for="o in localeOptions"
            :key="o.value"
            class="lang-option"
            role="option"
            :aria-selected="o.value === localePref"
            :class="{ selected: o.value === localePref }"
            @click="pickLocale(o.value)"
          >
            <span>{{ o.label }}</span>
            <Check v-if="o.value === localePref" :size="13" />
          </div>
        </div>
      </Transition>
      <Transition name="pop">
        <div v-if="issueOpen" ref="issueMenu" class="lang-menu" role="menu" :style="issueStyle">
          <button v-for="link in issueLinks" :key="link.url" class="lang-option issue-option" role="menuitem" @click="openIssue(link.url)">
            {{ t(link.label) }}
          </button>
        </div>
      </Transition>
    </Teleport>
  </header>
</template>

<style scoped>
.topbar {
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  padding: 0;
  border-bottom: 1px solid var(--header-border);
  background: var(--header-glow), var(--header-bg);
  box-shadow: var(--header-top-highlight);
  user-select: none;
}

/* 品牌区与左侧栏同宽（240px），周围留白支持拖拽移动窗口 */
.brand-wrap {
  flex: 0 0 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-right: 1px solid var(--header-border);
  transition: flex-basis var(--dur-slow) var(--ease-out);
}
.brand-wrap.compact {
  flex-basis: 56px;
  padding: 0 6px;
}
.brand {
  padding: 4px 10px 4px 6px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: none;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.brand-wrap.compact .brand {
  padding: 4px;
}
.brand:hover {
  background: var(--hover);
  border-color: var(--header-border);
}
.logo-shell {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--header-logo-bg);
  border: 1px solid var(--header-logo-border);
  flex-shrink: 0;
}
.name {
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.2px;
  white-space: nowrap;
}

.tabs-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
}
.tabs {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 14px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar {
  display: none;
}
.fade-left .tabs {
  mask-image: linear-gradient(to right, transparent 0, #000 40px);
}
.fade-right .tabs {
  mask-image: linear-gradient(to left, transparent 0, #000 40px);
}
.fade-left.fade-right .tabs {
  mask-image: linear-gradient(to right, transparent 0, #000 40px, #000 calc(100% - 40px), transparent 100%);
}

.tab {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: none;
  color: var(--text-2);
  font-size: 13.5px;
  white-space: nowrap;
  transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.ai-tab svg {
  color: var(--accent);
  opacity: 0.85;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.ai-tab:hover svg,
.ai-tab.active svg {
  opacity: 1;
}
.tab:hover {
  background: var(--hover);
  color: var(--text);
}
.tab.active {
  background: var(--header-pill-bg);
  border-color: var(--header-pill-border);
  box-shadow: var(--header-pill-shadow);
  color: var(--text);
  font-weight: 600;
}
.tab.active svg {
  color: var(--accent);
}
/* 胶囊滑块移动期间隐藏目标标签自己的底框，避免重影 */
.gliding .tab.active {
  background: none;
  border-color: transparent;
  box-shadow: none;
}
.tab .count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--header-badge-bg);
  font-size: 10px;
  line-height: 1;
  font-weight: 500;
  color: var(--text-3);
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.tab.active .count {
  background: var(--header-badge-active-bg);
  color: var(--accent);
  font-weight: 600;
}

.arrow {
  position: absolute;
  top: 50%;
  z-index: 2;
  width: 26px;
  height: 26px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  color: var(--text-2);
  transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.arrow:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.arrow.left {
  left: 4px;
}
.arrow.right {
  right: 4px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 8px;
  flex-shrink: 0;
}
.search-slot {
  width: var(--tool-search-width);
  overflow: hidden;
  transition: width var(--dur-slow) var(--ease-out), visibility 0s;
}
.search-slot.hidden {
  width: 0;
  visibility: hidden;
  transition: width var(--dur-slow) var(--ease-out), visibility 0s var(--dur-slow);
}
.search-slot :deep(.tool-search-button) { max-width: none; }

.action-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--header-border);
  border-radius: 9px;
  background: var(--header-group-bg);
}
.theme-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 7px;
  background: none;
  color: var(--text-2);
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.theme-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.theme-btn.active {
  background: var(--header-pill-bg);
  color: var(--accent);
}

.win-divider {
  width: 1px;
  height: 18px;
  background: var(--header-border);
  margin-left: 2px;
  flex-shrink: 0;
}

.window-controls {
  display: flex;
  align-items: stretch;
  height: 100%;
}
.win-btn {
  width: 42px;
  height: 100%;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: var(--text-2);
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.win-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.win-btn:active {
  background: var(--active);
}
.win-btn.close:hover {
  background: var(--win-close-hover);
  color: var(--on-accent);
}
.win-btn.close:active {
  background: var(--win-close-active);
  color: var(--on-accent);
}

@media (max-width: 1140px) {
  .search-slot:not(.hidden) {
    width: 156px;
  }
  .search-slot :deep(.tool-search-button) {
    width: 100%;
  }
}

/* 语言菜单（Teleport 到 body 下，scoped 样式仍然生效） */
.lang-menu {
  position: fixed;
  z-index: 100;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}
.lang-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 30px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
}
.lang-option:hover {
  background: var(--hover);
}
.lang-option.selected {
  color: var(--accent);
  font-weight: 500;
}
.issue-option {
  width: 100%;
  border: none;
  background: none;
  text-align: left;
}
</style>
