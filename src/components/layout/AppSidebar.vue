<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ArrowUpCircle, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { isAvailable, type Category } from "@/tools";
import { searchTextOf } from "@/locales/tools";
import { useUpdater } from "@/composables/useUpdater";
import { boxOf, glide } from "@/utils/motion";

const props = defineProps<{ category: Category; activeId?: string; collapsed: boolean }>();
defineEmits<{ select: [id: string]; toggle: []; openUpdate: [] }>();
const { t } = useI18n();
const { status: updateStatus, newVersion } = useUpdater();

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
  return props.category.tools.filter((tool) => searchTextOf(tool).includes(k));
});
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <label v-if="!collapsed" class="filter">
      <Search :size="14" />
      <input v-model="keyword" :placeholder="t('sidebar.search', { name: category.name })" @keydown.esc="keyword = ''" />
      <button v-if="keyword" class="clear" :title="t('sidebar.clear')" @click="keyword = ''"><X :size="12" /></button>
    </label>

    <ul ref="list" class="list">
      <li v-for="tool in filtered" :key="tool.id">
        <button
          class="item"
          :class="{ active: tool.id === activeId }"
          :title="collapsed ? tool.name : tool.desc"
          @click="$emit('select', tool.id)"
        >
          <component :is="tool.icon" :size="16" :stroke-width="1.75" class="icon" />
          <span class="label">{{ tool.name }}</span>
          <span v-if="!isAvailable(tool)" class="soon">{{ t("sidebar.soon") }}</span>
        </button>
      </li>
    </ul>

    <p v-if="!collapsed && !filtered.length" class="empty">
      {{ category.tools.length ? t("sidebar.noMatch") : t("sidebar.empty") }}
    </p>

    <!-- 底部：左边是更新（有新版本时醒目提示），右边是收起侧栏；收起时上下排列 -->
    <div class="footer">
      <button
        class="update"
        :class="{ available: updateStatus === 'available' }"
        :title="updateStatus === 'available' ? t('header.newVersion', { version: newVersion }) : t('header.checkUpdate')"
        @click="$emit('openUpdate')"
      >
        <ArrowUpCircle :size="16" />
        <span v-if="!collapsed">{{ updateStatus === "available" ? t("header.newVersion", { version: newVersion }) : t("header.checkUpdate") }}</span>
      </button>
      <button class="toggle" :title="collapsed ? t('sidebar.expand') : t('sidebar.collapse')" @click="$emit('toggle')">
        <PanelLeftOpen v-if="collapsed" :size="16" />
        <PanelLeftClose v-else :size="16" />
      </button>
    </div>
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
.collapsed .label,
.collapsed .soon {
  display: none;
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

.footer {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: auto 2px 0;
  padding-top: 8px;
}
.collapsed .footer {
  flex-direction: column;
  margin: auto 0 0;
}
.update,
.toggle {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-3);
  white-space: nowrap;
}
.toggle {
  flex-shrink: 0;
  width: 32px;
  margin-left: auto;
}
.collapsed .toggle {
  margin-left: 0;
}
.update {
  min-width: 32px;
  gap: 6px;
  padding: 0 8px;
  font-size: 12px;
  overflow: hidden;
}
.collapsed .update {
  padding: 0;
}
.update:hover,
.toggle:hover {
  background: var(--hover);
  color: var(--text);
}
/* 有新版本：强调色的按钮 */
.update.available {
  background: var(--accent);
  color: #fff;
  font-weight: 500;
}
.update.available:hover {
  background: var(--accent-hover);
  color: #fff;
}

@media (max-width: 720px) {
  .sidebar,
  .sidebar.collapsed {
    width: 100%;
    height: 56px;
    flex-direction: row;
    padding: 7px 8px;
    border-right: none;
    border-bottom: 1px solid var(--border);
    transition: none;
  }
  .filter,
  .footer,
  .empty {
    display: none;
  }
  .list {
    width: 100%;
    flex-direction: row;
    gap: 6px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    scroll-snap-type: x proximity;
  }
  .list::-webkit-scrollbar {
    display: none;
  }
  .list li {
    flex-shrink: 0;
    scroll-snap-align: center;
  }
  .item,
  .collapsed .item {
    width: auto;
    height: 40px;
    justify-content: flex-start;
    gap: 7px;
    padding: 0 12px;
    border-radius: 10px;
    font-size: 13px;
  }
  .collapsed .label,
  .collapsed .soon {
    display: inline;
  }
  .label {
    flex: none;
    max-width: 132px;
  }
}
</style>
