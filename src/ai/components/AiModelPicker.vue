<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, ChevronDown, ChevronRight, Info } from "lucide-vue-next";
import type { ModelOption, ThinkingEffort } from "@/types/ai";

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
const bodyRef = ref<HTMLDivElement>();
const submenuRef = ref<HTMLDivElement>();

const open = ref(false);
const menuStyle = ref<Record<string, string>>({});
const thumbVisible = ref(false);
const thumbStyle = ref<Record<string, string>>({});
const draggingThumb = ref(false);
let dragCleanup: (() => void) | null = null;

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

/** 严格按具体模型厂商名称分组呈现：厂商1 -> 多个模型，厂商2 -> 多个模型 */
const groups = computed<ProviderGroup[]>(() => {
  const map = new Map<string, ProviderGroup>();
  for (const item of props.models) {
    const groupKey = item.providerName || item.providerId;
    let group = map.get(groupKey);
    if (!group) {
      group = { providerId: groupKey, providerName: item.providerName, items: [] };
      map.set(groupKey, group);
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
  const menuWidth = Math.max(232, Math.min(264, window.innerWidth - 24));
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
  const spaceAbove = rect.top - 12;
  const spaceBelow = window.innerHeight - rect.bottom - 12;

  if (spaceAbove >= 200 || spaceAbove >= spaceBelow) {
    const maxHeight = Math.max(160, Math.min(288, spaceAbove - 6));
    menuStyle.value = {
      left: `${left}px`,
      bottom: `${window.innerHeight - rect.top + 8}px`,
      width: `${menuWidth}px`,
      maxHeight: `${maxHeight}px`,
    };
  } else {
    const maxHeight = Math.max(160, Math.min(288, spaceBelow - 6));
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
  const subWidth = 144;
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

  const estimatedHeight = 160;
  const top = Math.max(12, Math.min(rowRect.top - 8, window.innerHeight - estimatedHeight - 12));
  submenuStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${subWidth}px`,
  };
}

function stopThumbDrag() {
  dragCleanup?.();
  dragCleanup = null;
  draggingThumb.value = false;
}

function updateScrollbar() {
  const el = bodyRef.value;
  if (!el || el.scrollHeight <= el.clientHeight + 1) {
    thumbVisible.value = false;
    return;
  }
  const inset = 4;
  const trackHeight = Math.max(0, el.clientHeight - inset * 2);
  const thumbHeight = Math.max(24, Math.round((el.clientHeight / el.scrollHeight) * trackHeight));
  const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
  const maxOffset = Math.max(0, trackHeight - thumbHeight);
  const thumbTop = inset + Math.round((el.scrollTop / maxScroll) * maxOffset);
  thumbStyle.value = {
    height: `${thumbHeight}px`,
    transform: `translateY(${thumbTop}px)`,
  };
  thumbVisible.value = true;
}

function onBodyScroll() {
  hoveredModel.value = null;
  updateScrollbar();
}

function onThumbPointerDown(event: PointerEvent) {
  const el = bodyRef.value;
  if (!el) return;
  stopThumbDrag();
  draggingThumb.value = true;
  const startY = event.clientY;
  const startScrollTop = el.scrollTop;
  const inset = 4;
  const trackHeight = Math.max(1, el.clientHeight - inset * 2);
  const thumbHeight = Math.max(24, Math.round((el.clientHeight / el.scrollHeight) * trackHeight));
  const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
  const maxOffset = Math.max(1, trackHeight - thumbHeight);

  const onMove = (moveEvent: PointerEvent) => {
    const dy = moveEvent.clientY - startY;
    el.scrollTop = startScrollTop + (dy / maxOffset) * maxScroll;
  };
  const onUp = () => stopThumbDrag();

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  dragCleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
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
  stopThumbDrag();
  clearSubmenuTimer();
}

async function toggle() {
  if (open.value) {
    close();
    return;
  }
  hoveredModel.value = null;
  open.value = true;
  positionMenu();
  await nextTick();
  positionMenu();
  await nextTick();
  updateScrollbar();
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
    void nextTick(updateScrollbar);
  }
}

watch(
  () => props.models.length,
  () => {
    if (open.value) void nextTick(updateScrollbar);
  },
);

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
  stopThumbDrag();
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
    <span v-if="selectedModel?.providerName" class="trigger-provider">{{ selectedModel.providerName }}</span>
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
        </header>

        <div class="picker-body-wrap">
          <div ref="bodyRef" class="picker-body" @scroll="onBodyScroll">
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
                    <Check v-if="item.modelConfigId === selectedId" :size="13" class="row-check" />
                    <ChevronRight
                      v-if="item.supportedEfforts.length"
                      :size="13"
                      class="row-arrow"
                    />
                  </span>
                </button>
              </section>
            </template>
            <p v-else class="picker-empty">{{ t("common.noOptions") }}</p>
          </div>
          <div v-if="thumbVisible" class="overlay-scrollbar" :class="{ active: draggingThumb }" aria-hidden="true">
            <div class="overlay-thumb" :style="thumbStyle" @pointerdown.stop.prevent="onThumbPointerDown" />
          </div>
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
          <Check v-if="hoveredModel.thinkingEffort === level" :size="13" class="row-check" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.model-trigger {
  height: 30px;
  max-width: 380px;
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
.trigger-provider {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--active);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 500;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  border-radius: 12px;
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
  padding: 7px 10px 4px;
}
.picker-title {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-3);
}

.picker-body-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.picker-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 3px 6px 6px;
  scrollbar-width: none;
}
.picker-body::-webkit-scrollbar {
  display: none;
}

.overlay-scrollbar {
  position: absolute;
  top: 0;
  right: 2px;
  bottom: 0;
  width: 6px;
  pointer-events: none;
  z-index: 2;
}
.overlay-thumb {
  position: absolute;
  top: 0;
  right: 1px;
  width: 4px;
  border-radius: 999px;
  background: var(--border);
  opacity: 0.65;
  pointer-events: auto;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out), width var(--dur-fast) var(--ease-out);
}
.picker-body-wrap:hover .overlay-thumb {
  opacity: 0.9;
}
.overlay-thumb:hover,
.overlay-scrollbar.active .overlay-thumb {
  width: 5px;
  background: var(--border-strong);
  opacity: 0.95;
}

.provider-group + .provider-group {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
}

.provider-heading {
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
}

.model-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 7px;
  border: 0;
  border-radius: 7px;
  background: none;
  color: var(--text);
  font-size: 12.5px;
  line-height: 1.35;
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
  gap: 5px;
}
.row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-effort {
  flex-shrink: 0;
  font-size: 11.5px;
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
  padding: 16px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-3);
}

/* 右侧思考等级二级子菜单，带透明 hover 桥接区避免鼠标横向移入时断触 */
.effort-submenu {
  position: fixed;
  z-index: 135;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 11px;
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
  padding: 4px 7px;
  font-size: 11.5px;
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
  padding: 5px 8px;
  border: 0;
  border-radius: 7px;
  background: none;
  color: var(--text);
  font-size: 12.5px;
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
