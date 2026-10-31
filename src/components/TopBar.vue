<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChevronLeft, ChevronRight, Moon, Search, Sun } from "lucide-vue-next";
import type { Category } from "../tools";

const props = defineProps<{ categories: Category[]; activeId: string; theme: "light" | "dark" }>();
defineEmits<{ select: [id: string]; toggleTheme: []; openSearch: [] }>();

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
});
onBeforeUnmount(() => observer?.disconnect());

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
  <header class="topbar">
    <div class="brand">
      <span class="mark" />
      <span class="name">Open Tools</span>
    </div>

    <div class="tabs-wrap" :class="{ 'fade-left': canLeft, 'fade-right': canRight }">
      <button v-show="canLeft" class="arrow left" aria-label="向左滚动" @click="scrollBy(-1)">
        <ChevronLeft :size="16" />
      </button>
      <nav ref="scroller" class="tabs" @scroll="update" @wheel.prevent="onWheel">
        <button
          v-for="c in categories"
          :key="c.id"
          :data-id="c.id"
          class="tab"
          :class="{ active: c.id === activeId }"
          @click="$emit('select', c.id)"
        >
          {{ c.name }}
        </button>
      </nav>
      <button v-show="canRight" class="arrow right" aria-label="向右滚动" @click="scrollBy(1)">
        <ChevronRight :size="16" />
      </button>
    </div>

    <div class="actions">
      <button class="search" @click="$emit('openSearch')">
        <Search :size="14" />
        <span>搜索工具</span>
        <kbd>Ctrl K</kbd>
      </button>
      <button class="icon-btn" :title="theme === 'dark' ? '浅色模式' : '深色模式'" @click="$emit('toggleTheme')">
        <Sun v-if="theme === 'dark'" :size="16" />
        <Moon v-else :size="16" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  gap: 24px;
  padding: 0 16px 0 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
}
.mark {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  background: var(--accent);
  transform: rotate(45deg) scale(0.85);
}
.name {
  font-family: var(--font-serif);
  font-size: 17px;
  letter-spacing: -0.2px;
}

.tabs-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
}
.tabs {
  flex: 1;
  display: flex;
  gap: 4px;
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
  flex-shrink: 0;
  padding: 0 12px;
  border: none;
  background: none;
  color: var(--text-2);
  white-space: nowrap;
  transition: color 0.15s;
}
.tab:hover {
  color: var(--text);
}
.tab.active {
  color: var(--text);
  font-weight: 600;
}
.tab.active::after {
  content: "";
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--accent);
}

.arrow {
  position: absolute;
  top: 50%;
  z-index: 1;
  width: 24px;
  height: 24px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text-2);
}
.arrow:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.arrow.left {
  left: 0;
}
.arrow.right {
  right: 0;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.search {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-3);
  font-size: 13px;
  transition: border-color 0.15s, color 0.15s;
}
.search span {
  width: 120px;
  text-align: left;
}
.search:hover {
  border-color: var(--border-strong);
  color: var(--text-2);
}
.icon-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-2);
}
.icon-btn:hover {
  background: var(--hover);
  color: var(--text);
}
</style>
