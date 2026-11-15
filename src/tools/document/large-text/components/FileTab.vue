<script setup lang="ts">
import { nextTick, onDeactivated, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronDown, FileText, X } from "lucide-vue-next";
import { usePopover } from "@/composables/usePopover";
import type { TabCloseScope, TextTab } from "../workspace";

const props = defineProps<{ tab: TextTab; active: boolean; disabled: boolean; hasLeft: boolean; hasRight: boolean }>();
const emit = defineEmits<{ activate: []; close: [scope: TabCloseScope] }>();
const { t } = useI18n();
const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLDivElement>();
const menu = usePopover(trigger, panel, { minWidth: 172, maxHeight: 136 });
const filename = (path: string) => path.split(/[\\/]/).pop() || path;
const showMenu = async () => {
  if (props.disabled) return;
  await menu.show(); await nextTick();
  panel.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
};
const toggleMenu = () => menu.open.value ? menu.close() : void showMenu();
const choose = (scope: TabCloseScope) => { menu.close(); trigger.value?.focus(); emit("close", scope); };
const menuKey = (event: KeyboardEvent) => {
  if (event.key === "Escape") { event.preventDefault(); menu.close(); trigger.value?.focus(); return; }
  if (event.key === "Tab") { menu.close(); return; }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const buttons = Array.from(panel.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
  if (!buttons.length) return;
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
};
onDeactivated(menu.close);
</script>

<template>
  <div class="file-tab" :class="{ active }" @contextmenu.prevent="showMenu">
    <button :id="`text-tab-${tab.key}`" class="tab-title" role="tab" :aria-selected="active" :aria-controls="`text-panel-${tab.key}`" :title="tab.controller.state.info?.path" :disabled="disabled" @click="emit('activate')">
      <FileText :size="14" /><span>{{ filename(tab.controller.state.info?.path ?? '') }}</span>
      <span v-if="tab.controller.dirty.value" class="dirty-dot" :aria-label="t('largeText.unsaved')">●</span>
    </button>
    <button ref="trigger" class="icon-btn tab-menu" :title="t('largeText.tabMenu')" :aria-label="t('largeText.tabMenuFor', { name: filename(tab.controller.state.info?.path ?? '') })" aria-haspopup="menu" :aria-expanded="menu.open.value" :disabled="disabled" @click="toggleMenu" @keydown.down.prevent="showMenu"><ChevronDown :size="12" /></button>
    <button class="tab-close icon-btn" :title="t('largeText.close')" :aria-label="t('largeText.closeTab', { name: filename(tab.controller.state.info?.path ?? '') })" :disabled="disabled || tab.controller.state.busy" @click="emit('close', 'current')"><X :size="12" /></button>
  </div>
  <Teleport to="body">
    <div v-if="menu.open.value" ref="panel" class="tab-popup" :style="menu.style.value" role="menu" :aria-label="t('largeText.tabMenu')" @keydown="menuKey">
      <button role="menuitem" :disabled="disabled || tab.controller.state.busy" @click="choose('current')">{{ t('largeText.closeCurrent') }}</button>
      <button role="menuitem" :disabled="disabled || !hasLeft" @click="choose('left')">{{ t('largeText.closeLeft') }}</button>
      <button role="menuitem" :disabled="disabled || !hasRight" @click="choose('right')">{{ t('largeText.closeRight') }}</button>
    </div>
  </Teleport>
</template>

<style scoped>
.file-tab { display: flex; align-items: center; border: 0; border-right: 1px solid var(--border); border-bottom: 2px solid transparent; background: transparent; min-width: 140px; max-width: 240px; flex-shrink: 0; padding: 2px 4px; }
.file-tab.active { background: var(--surface); border-bottom-color: var(--accent); }
.tab-title { display: flex; align-items: center; gap: 6px; min-width: 0; border: 0; background: transparent; color: var(--text-2); cursor: pointer; padding: 8px 6px 6px 10px; flex: 1; font: inherit; font-size: 12px; }
.tab-title > span:first-of-type { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab-title > svg { flex-shrink: 0; }
.active .tab-title, .dirty-dot { color: var(--accent); }
.tab-close { margin-right: 4px; flex-shrink: 0; }
.tab-menu { flex-shrink: 0; color: var(--text-3); }
.file-tab :deep(.icon-btn) { width: 22px; height: 24px; }
.tab-popup { position: fixed; z-index: 100; display: flex; flex-direction: column; padding: 4px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); box-shadow: var(--shadow-lg); }
.tab-popup button { border: 0; background: transparent; color: var(--text); text-align: left; padding: 8px 12px; border-radius: 5px; cursor: pointer; font: inherit; font-size: 12px; }
.tab-popup button:hover:not(:disabled), .tab-popup button:focus-visible { background: var(--accent-soft); outline: none; }
.tab-popup button:disabled { color: var(--text-3); opacity: .55; cursor: default; }
</style>
