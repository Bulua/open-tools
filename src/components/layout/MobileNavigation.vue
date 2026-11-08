<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { ArrowLeft, ChevronRight, Info, Search, Wrench } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import type { Category, Tool } from "@/tools";
import { isAvailable } from "@/tools";
import { searchTextOf } from "@/locales/tools";
import ToolView from "@/components/tool/ToolView.vue";

export type MobilePage = "home" | "category" | "tool" | "about";

const props = defineProps<{
  page: MobilePage;
  categories: Category[];
  activeCategoryId: string;
  activeTool?: Tool;
}>();

const emit = defineEmits<{
  "update:page": [page: MobilePage];
  selectCategory: [id: string];
  selectTool: [categoryId: string, toolId: string];
}>();

const { t } = useI18n();
const keyword = ref("");
const categoryScroller = ref<HTMLElement>();
const scrollTop = ref(0);
const scrollHeight = ref(0);
const scrollClientHeight = ref(0);
const transitionName = ref("page-forward");
const swipeOffset = ref(0);
const swiping = ref(false);
const swipeAnimating = ref(false);
let swipeStartX = 0;
let swipeStartY = 0;
let swipePointer = -1;
let swipeTimer = 0;

const activeCategory = computed(() => props.categories.find((category) => category.id === props.activeCategoryId) ?? props.categories[0]);
const searchResults = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase();
  if (!query) return [];
  return props.categories.flatMap((category) =>
    category.tools
      .filter((tool) => category.name.toLocaleLowerCase().includes(query) || searchTextOf(tool).includes(query))
      .map((tool) => ({ category, tool })),
  );
});
const showCategoryScrollbar = computed(() => scrollHeight.value > scrollClientHeight.value + 1);
const canSwipeBack = computed(() => props.page === "category" || props.page === "tool");
const previousPage = computed<MobilePage>(() => (props.page === "tool" ? "category" : "home"));
const pageShellStyle = computed(() => {
  if (!swiping.value && !swipeAnimating.value) return undefined;
  return {
    transform: `translate3d(${swipeOffset.value}px, 0, 0)`,
    transition: swipeAnimating.value ? `transform var(--dur) var(--ease-out)` : "none",
  };
});
const categoryScrollbarStyle = computed(() => {
  const viewport = scrollClientHeight.value;
  const content = scrollHeight.value;
  if (!viewport || !content) return { height: "0px", transform: "translateY(0)" };

  const thumbHeight = Math.max(36, (viewport / content) * viewport);
  const maxThumbTop = Math.max(0, viewport - thumbHeight);
  const maxScrollTop = Math.max(1, content - viewport);
  const thumbTop = Math.min(maxThumbTop, (scrollTop.value / maxScrollTop) * maxThumbTop);
  return {
    height: `${thumbHeight}px`,
    transform: `translateY(${thumbTop}px)`,
  };
});

const updateCategoryScroll = () => {
  const element = categoryScroller.value;
  if (!element) return;
  scrollTop.value = element.scrollTop;
  scrollHeight.value = element.scrollHeight;
  scrollClientHeight.value = element.clientHeight;
};

const navigate = (page: MobilePage, direction: "forward" | "back" = "forward") => {
  transitionName.value = direction === "forward" ? "page-forward" : "page-back";
  emit("update:page", page);
};

const openCategory = (id: string) => {
  emit("selectCategory", id);
  navigate("category");
};

const openTool = (categoryId: string, toolId: string) => {
  emit("selectTool", categoryId, toolId);
  navigate("tool");
};

const openToolsHome = () => {
  keyword.value = "";
  navigate("home", "back");
};

const beginSwipe = (event: PointerEvent) => {
  if (!canSwipeBack.value || event.clientX > 32 || event.button !== 0) return;
  swipePointer = event.pointerId;
  swipeStartX = event.clientX;
  swipeStartY = event.clientY;
  swipeOffset.value = 0;
};

const moveSwipe = (event: PointerEvent) => {
  if (event.pointerId !== swipePointer) return;
  const dx = Math.max(0, event.clientX - swipeStartX);
  const dy = Math.abs(event.clientY - swipeStartY);
  if (!swiping.value && (dx < 8 || dx < dy * 1.2)) return;
  swiping.value = true;
  event.preventDefault();
  swipeOffset.value = Math.min(dx, event.currentTarget instanceof HTMLElement ? event.currentTarget.clientWidth : dx);
};

const finishSwipe = (event: PointerEvent) => {
  if (event.pointerId !== swipePointer) return;
  swipePointer = -1;
  if (!swiping.value) return;

  const width = event.currentTarget instanceof HTMLElement ? event.currentTarget.clientWidth : window.innerWidth;
  const complete = swipeOffset.value >= Math.min(96, width * 0.24);
  swipeAnimating.value = true;
  swipeOffset.value = complete ? width : 0;
  clearTimeout(swipeTimer);
  swipeTimer = window.setTimeout(() => {
    if (complete) {
      transitionName.value = "page-none";
      emit("update:page", previousPage.value);
    }
    swiping.value = false;
    swipeAnimating.value = false;
    swipeOffset.value = 0;
  }, 200);
};

watch(
  () => [props.page, props.activeCategoryId, activeCategory.value?.tools.length],
  () => nextTick(updateCategoryScroll),
);

onMounted(() => {
  window.addEventListener("resize", updateCategoryScroll);
  nextTick(updateCategoryScroll);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateCategoryScroll);
  clearTimeout(swipeTimer);
});
</script>

<template>
  <div class="mobile-navigation">
    <main class="mobile-content" @pointerdown="beginSwipe" @pointermove="moveSwipe" @pointerup="finishSwipe" @pointercancel="finishSwipe">
      <div v-if="swiping || swipeAnimating" class="swipe-underlay" aria-hidden="true" />
      <Transition :name="transitionName">
        <div :key="page" class="page-shell" :class="{ locked: page === 'category' || page === 'tool' }" :style="pageShellStyle">
          <section v-if="page === 'home'" class="home-page">
        <label class="search-box">
          <Search :size="19" />
          <input v-model="keyword" :placeholder="t('mobile.searchPlaceholder')" />
        </label>

        <div v-if="keyword.trim()" class="tool-list search-results">
          <button
            v-for="result in searchResults"
            :key="`${result.category.id}:${result.tool.id}`"
            class="tool-row"
            @click="openTool(result.category.id, result.tool.id)"
          >
            <span class="tool-icon"><component :is="result.tool.icon" :size="20" :stroke-width="1.75" /></span>
            <span class="tool-copy">
              <strong>{{ result.tool.name }}</strong>
              <small>{{ result.category.name }} · {{ result.tool.desc }}</small>
            </span>
            <ChevronRight :size="18" class="chevron" />
          </button>
          <p v-if="!searchResults.length" class="empty">{{ t("mobile.noResults") }}</p>
        </div>

        <template v-else>
          <h1 class="section-title">{{ t("mobile.allCategories") }}</h1>
          <div class="category-grid">
            <button v-for="category in categories" :key="category.id" class="category-card" @click="openCategory(category.id)">
              <span class="category-icon">
                <component :is="category.tools[0]?.icon" :size="22" :stroke-width="1.7" />
              </span>
              <span class="category-copy">
                <strong>{{ category.name }}</strong>
                <small>{{ t("mobile.toolCount", { n: category.tools.length }) }}</small>
              </span>
              <ChevronRight :size="18" class="chevron" />
            </button>
          </div>
        </template>
          </section>

          <section v-else-if="page === 'category'" class="category-page">
        <header class="page-heading">
          <button class="back" :aria-label="t('mobile.back')" @click="navigate('home', 'back')"><ArrowLeft :size="20" /></button>
          <h1>{{ activeCategory.name }}</h1>
          <span class="tool-count">{{ t("mobile.toolCount", { n: activeCategory.tools.length }) }}</span>
        </header>
        <div class="category-list-region">
          <div ref="categoryScroller" class="category-list-scroll" @scroll="updateCategoryScroll">
            <div class="tool-list">
              <button v-for="tool in activeCategory.tools" :key="tool.id" class="tool-row" @click="openTool(activeCategory.id, tool.id)">
                <span class="tool-icon"><component :is="tool.icon" :size="20" :stroke-width="1.75" /></span>
                <span class="tool-copy">
                  <strong>{{ tool.name }} <em v-if="!isAvailable(tool)">{{ t("sidebar.soon") }}</em></strong>
                  <small>{{ tool.desc }}</small>
                </span>
                <ChevronRight :size="18" class="chevron" />
              </button>
            </div>
          </div>
          <div v-if="showCategoryScrollbar" class="scroll-track" aria-hidden="true">
            <span class="scroll-thumb" :style="categoryScrollbarStyle" />
          </div>
        </div>
          </section>

          <section v-else-if="page === 'tool'" class="tool-page">
        <header class="tool-heading">
          <button class="tool-back" @click="navigate('category', 'back')"><ArrowLeft :size="19" />{{ activeCategory.name }}</button>
          <div v-if="activeTool" class="tool-identity">
            <span><component :is="activeTool.icon" :size="17" :stroke-width="1.75" /></span>
            <strong>{{ activeTool.name }}</strong>
          </div>
        </header>
        <KeepAlive :max="12">
          <ToolView v-if="activeTool" :key="activeTool.id" :tool="activeTool" mobile />
        </KeepAlive>
          </section>

          <section v-else class="about-page" :aria-label="t('mobile.about')" />
        </div>
      </Transition>
    </main>

    <nav class="bottom-nav" :aria-label="t('mobile.navigation')">
      <button :class="{ active: page !== 'about' }" @click="openToolsHome">
        <Wrench :size="22" />
        <span>{{ t("mobile.tools") }}</span>
      </button>
      <button :class="{ active: page === 'about' }" @click="navigate('about')">
        <Info :size="22" />
        <span>{{ t("mobile.about") }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.mobile-navigation {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-sunken);
}
.mobile-content {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  touch-action: pan-y;
}
.page-shell {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: auto;
  background: var(--bg-sunken);
  will-change: transform;
}
.page-shell.locked {
  overflow: hidden;
}
.swipe-underlay {
  position: absolute;
  inset: 0;
  background: var(--bg-sunken);
}
.page-forward-enter-active,
.page-forward-leave-active,
.page-back-enter-active,
.page-back-leave-active {
  transition: transform var(--dur-slow) var(--ease-out), box-shadow var(--dur-slow) var(--ease-out);
}
.page-forward-enter-from {
  transform: translate3d(100%, 0, 0);
  box-shadow: -12px 0 32px rgba(31, 30, 29, 0.12);
}
.page-forward-leave-to {
  transform: translate3d(-18%, 0, 0);
}
.page-back-enter-from {
  transform: translate3d(-18%, 0, 0);
}
.page-back-leave-to {
  transform: translate3d(100%, 0, 0);
  box-shadow: -12px 0 32px rgba(31, 30, 29, 0.12);
}
.page-forward-leave-active,
.page-back-leave-active {
  z-index: 2;
}
.home-page {
  min-height: 100%;
  padding: 16px 14px 24px;
}
.category-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.search-box {
  height: 46px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  color: var(--text-3);
  box-shadow: var(--shadow-sm);
}
.search-box:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
  color: var(--accent);
}
.search-box input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: none;
  font-size: 15px;
}
.section-title {
  margin: 20px 2px 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-2);
}
.category-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.category-card {
  min-height: 88px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 9px;
  padding: 14px 10px 14px 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  text-align: left;
  box-shadow: var(--shadow-sm);
}
.category-card:active,
.tool-row:active {
  background: var(--active);
}
.category-icon,
.tool-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 11px;
  background: var(--accent-soft);
  color: var(--accent);
}
.category-copy,
.tool-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.category-copy strong,
.tool-copy strong {
  overflow: hidden;
  font-size: 14px;
  font-style: normal;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category-copy small,
.tool-copy small {
  overflow: hidden;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chevron {
  flex-shrink: 0;
  color: var(--text-3);
}
.page-heading {
  min-height: 62px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  flex-shrink: 0;
  gap: 10px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.page-heading h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  line-height: 1.2;
  text-align: center;
}
.back {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  justify-self: start;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}
.back:active {
  background: var(--active);
}
.tool-count {
  justify-self: end;
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--bg-sunken);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.category-list-region {
  position: relative;
  flex: 1;
  min-height: 0;
}
.category-list-scroll {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px 18px 24px 14px;
  scrollbar-width: none;
}
.category-list-scroll::-webkit-scrollbar {
  display: none;
}
.scroll-track {
  position: absolute;
  top: 14px;
  right: 5px;
  bottom: 24px;
  width: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--border);
  pointer-events: none;
}
.scroll-thumb {
  display: block;
  width: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: transform var(--dur-fast) var(--ease-out);
}
.tool-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.search-results {
  margin-top: 14px;
}
.tool-row {
  min-height: 66px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  text-align: left;
}
.tool-copy {
  flex: 1;
}
.tool-copy em {
  color: var(--text-3);
  font-size: 11px;
  font-style: normal;
  font-weight: 400;
}
.empty {
  margin: 48px 0;
  color: var(--text-3);
  text-align: center;
}
.tool-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.tool-heading {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
}
.tool-back {
  min-width: 0;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 4px 0 0;
  border: none;
  background: none;
  color: var(--text-2);
  font-size: 13px;
  white-space: nowrap;
}
.tool-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.tool-identity span {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent);
}
.tool-identity strong {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.about-page {
  min-height: 100%;
}
.bottom-nav {
  min-height: calc(58px + env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex-shrink: 0;
  padding: 4px 32px env(safe-area-inset-bottom);
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.bottom-nav button {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 11px;
}
.bottom-nav button.active {
  color: var(--accent);
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .page-forward-enter-active,
  .page-forward-leave-active,
  .page-back-enter-active,
  .page-back-leave-active {
    transition-duration: 1ms;
  }
}
</style>
