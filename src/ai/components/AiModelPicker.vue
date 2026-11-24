<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, ChevronDown, ChevronRight, Info, Search } from "lucide-vue-next";
import type { ModelOption, ThinkingEffort } from "../types";

const props = defineProps<{
  models: ModelOption[];
  selectedId: string;
}>();

const emit = defineEmits<{
  select: [modelConfigId: string, effort?: ThinkingEffort];
}>();

const { t } = useI18n();

const triggerRef = ref<HTMLButtonElement>();
const menuRef = ref<HTMLDivElement>();
const submenuRef = ref<HTMLDivElement>();
const searchRef = ref<HTMLInputElement>();

const open = ref(false);
const query = ref("");
const menuStyle = ref<Record<string, string>>({});

const hoveredModel = ref<ModelOption | null>(null);
const submenuSide = ref<"right" | "left">("right");
const submenuStyle = ref<Record<string, string>>({});
let submenuHideTimer = 0;

interface ProviderGroup {
  providerId: string;
  providerName: string;
  items: ModelOption[];
}

const selectedModel = computed(() => props.models.find((m) => m.modelConfigId === props.selectedId) ?? null);

const showSearch = computed(() => props.models.length > 8);

const filteredModels = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.models;
  return props.models.filter(
    (m) =>
      m.modelLabel.toLowerCase().includes(q) ||
      m.modelId.toLowerCase().includes(q) ||
      m.providerName.toLowerCase().includes(q),
  );
});

/** 严格按提供商分组呈现：提供商1 -> 多个模型，提供商2 -> 多个模型 */
const groups = computed<ProviderGroup[]>(() => {
  const map = new Map<string, ProviderGroup>();
  for (const item of filteredModels.value) {
    let group = map.get(item.providerId);
    if (!group) {
      group = { providerId: item.providerId, providerName: item.providerName, items: [] };
      map.set(item.providerId, group);
    }
    group.items.push(item);
  }
  return [...map.values()];
});

function effortLabel(effort?: ThinkingEffort): string {
  if (!effort) return "";
  return t(`ai.thinkingEffort.${effort}`);
}

/** 触发器和主列表中仅在非关闭状态时展示等级副文字，保持清爽 */
function badgeEffortLabel(effort?: ThinkingEffort): string {
  if (!effort || effort === "none") return "";
  return effortLabel(effort);
}

function positionMenu() {
  const trigger = triggerRef.value;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const menuWidth = Math.max(288, Math.min(340, window.innerWidth - 24));
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
  const spaceAbove = rect.top - 12;
  const spaceBelow = window.innerHeight - rect.bottom - 12;

  if (spaceAbove >= 220 || spaceAbove >= spaceBelow) {
    const maxHeight = Math.max(180, Math.min(420, spaceAbove - 6));
    menuStyle.value = {
      left: `${left}px`,
      bottom: `${window.innerHeight - rect.top + 8}px`,
      width: `${menuWidth}px`,
      maxHeight: `${maxHeight}px`,
    };
  } else {
    const maxHeight = Math.max(180, Math.min(420, spaceBelow - 6));
    menuStyle.value = {
      left: `${left}px`,
      top: `${rect.bottom + 8}px`,
      width: `${menuWidth}px`,
      maxHeight: `${maxHeight}px`,
    };
  }
}

function positionSubmenu(rowEl: HTMLElement) {
  const menuEl = menuRef.value;
  if (!menuEl) return;
  const menuRect = menuEl.getBoundingClientRect();
  const rowRect = rowEl.getBoundingClientRect();
  const subWidth = 176;
  const gap = 6;

  const rightSpace = window.innerWidth - menuRect.right - gap - 12;
  if (rightSpace >= subWidth) {
    submenuSide.value = "right";
  } else {
    submenuSide.value = "left";
  }
  const left = submenuSide.value === "right"
    ? menuRect.right + gap
    : Math.max(12, menuRect.left - subWidth - gap);

  const estimatedHeight = 200;
  const top = Math.max(12, Math.min(rowRect.top - 8, window.innerHeight - estimatedHeight - 12));
  submenuStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${subWidth}px`,
  };
}

function clearSubmenuTimer() {
  clearTimeout(submenuHideTimer);
}

function scheduleHideSubmenu() {
  clearTimeout(submenuHideTimer);
  submenuHideTimer = window.setTimeout(() => {
    hoveredModel.value = null;
  }, 220);
}

function showSubmenuFor(model: ModelOption, rowEl: HTMLElement | null) {
  clearSubmenuTimer();
  if (!model.supportedEfforts.length) {
    hoveredModel.value = null;
    return;
  }
  hoveredModel.value = model;
  if (rowEl) positionSubmenu(rowEl);
}

function onRowEnter(model: ModelOption, event: MouseEvent) {
  showSubmenuFor(model, event.currentTarget as HTMLElement | null);
}

function onRowLeave() {
  scheduleHideSubmenu();
}

function onSubmenuEnter() {
  clearSubmenuTimer();
}

function onSubmenuLeave() {
  scheduleHideSubmenu();
}

function close() {
  open.value = false;
  hoveredModel.value = null;
  clearSubmenuTimer();
}

async function toggle() {
  if (open.value) {
    close();
    return;
  }
  query.value = "";
  hoveredModel.value = null;
  open.value = true;
  positionMenu();
  await nextTick();
  positionMenu();
  searchRef.value?.focus();
}

function pickModel(model: ModelOption) {
  emit("select", model.modelConfigId);
  close();
}

function pickEffort(model: ModelOption, effort: ThinkingEffort) {
  emit("select", model.modelConfigId, effort);
  close();
}

function onOutsidePointerDown(event: PointerEvent) {
  const target = event.target as Node | null;
  if (!target) return;
  if (triggerRef.value?.contains(target)) return;
  if (menuRef.value?.contains(target)) return;
  if (submenuRef.value?.contains(target)) return;
  close();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    triggerRef.value?.focus();
  }
}

function onViewportChange() {
  if (open.value) {
    positionMenu();
    hoveredModel.value = null;
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener("pointerdown", onOutsidePointerDown, true);
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", onViewportChange);
  } else {
    window.removeEventListener("pointerdown", onOutsidePointerDown, true);
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("resize", onViewportChange);
  }
});

onBeforeUnmount(() => {
  clearSubmenuTimer();
  window.removeEventListener("pointerdown", onOutsidePointerDown, true);
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("resize", onViewportChange);
});
</script>

<template>
  <button
    ref="triggerRef"
    type="button"
    class="model-trigger"
    :class="{ open }"
    :aria-expanded="open"
    aria-haspopup="menu"
    @click="toggle"
  >
    <span class="trigger-name">{{ selectedModel?.modelLabel || t("ai.selectModel") }}</span>
    <span v-if="badgeEffortLabel(selectedModel?.thinkingEffort)" class="trigger-effort">
      {{ badgeEffortLabel(selectedModel?.thinkingEffort) }}
    </span>
    <ChevronDown :size="14" class="trigger-chevron" :class="{ open }" />
  </button>

  <Teleport to="body">
    <Transition name="pop">
      <div
        v-if="open"
        ref="menuRef"
        class="picker-menu"
        role="menu"
        :style="menuStyle"
      >
        <header class="picker-head">
          <span class="picker-title">{{ t("ai.modelMenuTitle") }}</span>
          <label v-if="showSearch" class="picker-search">
            <Search :size="12" />
            <input
              ref="searchRef"
              v-model="query"
              type="text"
              :placeholder="t('common.search')"
              spellcheck="false"
            />
          </label>
        </header>

        <div class="picker-body" @scroll="hoveredModel = null">
          <template v-if="groups.length">
            <section v-for="group in groups" :key="group.providerId" class="provider-group">
              <div class="provider-heading">{{ group.providerName }}</div>
              <button
                v-for="item in group.items"
                :key="item.modelConfigId"
                type="button"
                role="menuitem"
                class="model-row"
                :class="{
                  selected: item.modelConfigId === selectedId,
                  hovered: hoveredModel?.modelConfigId === item.modelConfigId,
                }"
                @mouseenter="onRowEnter(item, $event)"
                @mouseleave="onRowLeave"
                @focus="showSubmenuFor(item, $event.currentTarget as HTMLElement)"
                @click="pickModel(item)"
              >
                <span class="row-main">
                  <span class="row-name">{{ item.modelLabel }}</span>
                  <span v-if="badgeEffortLabel(item.thinkingEffort)" class="row-effort">
                    {{ badgeEffortLabel(item.thinkingEffort) }}
                  </span>
                </span>
                <span class="row-end">
                  <Check v-if="item.modelConfigId === selectedId" :size="14" class="row-check" />
                  <ChevronRight
                    v-if="item.supportedEfforts.length"
                    :size="14"
                    class="row-arrow"
                  />
                </span>
              </button>
            </section>
          </template>
          <p v-else class="picker-empty">{{ t("common.noOptions") }}</p>
        </div>
      </div>
    </Transition>

    <Transition name="pop">
      <div
        v-if="open && hoveredModel && hoveredModel.supportedEfforts.length"
        ref="submenuRef"
        class="effort-submenu"
        :class="submenuSide"
        role="menu"
        :style="submenuStyle"
        @mouseenter="onSubmenuEnter"
        @mouseleave="onSubmenuLeave"
      >
        <div class="submenu-head">
          <span>{{ t("ai.thinkingEffortTitle") }}</span>
          <span class="submenu-info" :title="t('ai.thinkingEffortTip')">
            <Info :size="13" />
          </span>
        </div>

        <button
          v-for="level in hoveredModel.supportedEfforts"
          :key="level"
          type="button"
          role="menuitemradio"
          :aria-checked="hoveredModel.thinkingEffort === level"
          class="effort-option"
          :class="{ active: hoveredModel.thinkingEffort === level }"
          @click="pickEffort(hoveredModel, level)"
        >
          <span>{{ effortLabel(level) }}</span>
          <Check v-if="hoveredModel.thinkingEffort === level" :size="14" class="row-check" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.model-trigger {
  height: 30px;
  max-width: 300px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.model-trigger:hover {
  background: var(--hover);
}
.model-trigger.open {
  background: var(--active);
}
.trigger-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trigger-effort {
  flex-shrink: 0;
  color: var(--text-3);
  font-weight: 400;
}
.trigger-chevron {
  flex-shrink: 0;
  color: var(--text-3);
  transition: transform var(--dur-fast) var(--ease-out);
}
.trigger-chevron.open {
  transform: rotate(180deg);
}

.picker-menu {
  position: fixed;
  z-index: 130;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.picker-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px 6px;
}
.picker-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
}
.picker-search {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 148px;
  height: 24px;
  padding: 0 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text-3);
}
.picker-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: none;
  color: var(--text);
  font-size: 12px;
}

.picker-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 6px 8px;
  scrollbar-width: thin;
}

.provider-group + .provider-group {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.provider-heading {
  padding: 4px 8px 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-3);
}

.model-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 9px;
  border: 0;
  border-radius: 9px;
  background: none;
  color: var(--text);
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.model-row:hover,
.model-row.hovered {
  background: var(--hover);
}
.model-row.selected {
  font-weight: 500;
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 7px;
}
.row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-effort {
  flex-shrink: 0;
  font-size: 12.5px;
  font-weight: 400;
  color: var(--text-3);
}
.row-end {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.row-check {
  color: var(--text);
}
.row-arrow {
  color: var(--text-3);
}

.picker-empty {
  margin: 0;
  padding: 18px 12px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-3);
}

/* 右侧思考等级二级子菜单，带透明 hover 桥接区避免鼠标横向移入时断触 */
.effort-submenu {
  position: fixed;
  z-index: 135;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.effort-submenu.right::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -12px;
  width: 12px;
}
.effort-submenu.left::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  right: -12px;
  width: 12px;
}
.submenu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
}
.submenu-info {
  display: inline-flex;
  color: var(--text-3);
}
.effort-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 9px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text);
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.effort-option:hover {
  background: var(--hover);
}
.effort-option.active {
  font-weight: 500;
}
</style>
