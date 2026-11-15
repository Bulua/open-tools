<script setup lang="ts">
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, computed } from "vue";
import { useI18n } from "vue-i18n";
import { isTauri } from "@tauri-apps/api/core";
import { FileText, Plus } from "lucide-vue-next";
import { useUpdater } from "@/composables/useUpdater";
import { showError } from "@/utils/errorToast";
import FileTab from "./components/FileTab.vue";
import FilePanel from "./components/FilePanel.vue";
import { closeTabGroup, confirming, initializeLargeText, openFile } from "./useLargeText";
import { textWorkspace } from "./workspace";

const { t } = useI18n();
const supported = isTauri();
const updater = useUpdater();
const workspace = textWorkspace;
const canOpen = computed(() => supported && !workspace.opening.value && !confirming.value && !["downloading", "installing"].includes(updater.status.value));
const chooseFile = () => { if (canOpen.value) void openFile("auto"); };
let visible = true;
let disposed = false;
let unlisten: (() => void) | undefined;
onMounted(async () => {
  await initializeLargeText();
  if (!supported) return;
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const stop = await getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (visible && event.payload.type === "drop") void openFile("auto", event.payload.paths);
    });
    if (disposed) stop(); else unlisten = stop;
  } catch (e) { showError(e); }
});
onActivated(() => { visible = true; });
onDeactivated(() => { visible = false; });
onBeforeUnmount(() => { disposed = true; unlisten?.(); });
</script>

<template>
  <div class="large-text-workspace">
    <div v-if="workspace.tabs.length" class="editor-shell">
    <div class="file-tabs" role="tablist" :aria-label="t('largeText.fileTabs')">
      <FileTab v-for="(tab, index) in workspace.tabs" :key="tab.key" :tab="tab" :active="workspace.activeKey.value === tab.key" :disabled="confirming || workspace.opening.value" :has-left="index > 0" :has-right="index < workspace.tabs.length - 1" @activate="workspace.activate(tab)" @close="(scope) => closeTabGroup(tab.key, scope)" />
      <button class="icon-btn add-file" :title="t('largeText.open')" :aria-label="t('largeText.open')" :disabled="!canOpen" @click="chooseFile"><Plus :size="16" /></button>
    </div>
    <!-- 切换标签只隐藏面板，保留各文件的滚动位置、选区和本地撤销历史。 -->
    <FilePanel v-for="tab in workspace.tabs" v-show="workspace.activeKey.value === tab.key" :id="`text-panel-${tab.key}`" :key="tab.key" role="tabpanel" :aria-labelledby="`text-tab-${tab.key}`" :controller="tab.controller" :active="workspace.activeKey.value === tab.key" />
    </div>
    <section v-else class="empty" role="button" tabindex="0" :aria-label="t('largeText.open')" :aria-disabled="!canOpen" @click="chooseFile" @keydown.enter.prevent="chooseFile" @keydown.space.prevent="chooseFile">
      <FileText :size="42" :stroke-width="1.3" />
      <h2>{{ t("largeText.emptyTitle") }}</h2>
      <p>{{ t("largeText.emptyDescription") }}</p>
      <small>{{ supported ? t("largeText.drop") : t("largeText.desktopOnly") }}</small>
    </section>
  </div>
</template>

<style scoped>
.large-text-workspace { display: flex; flex: 1; flex-direction: column; gap: 0; padding: 12px 16px 16px; min-height: 0; min-width: 0; }
.add-file { flex-shrink: 0; align-self: center; margin-inline: 6px; }
.editor-shell { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--surface); }
.file-tabs { display: flex; gap: 0; overflow-x: auto; flex-shrink: 0; border-bottom: 1px solid var(--border); background: var(--bg-sunken); }
.empty { cursor: pointer; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; padding: 32px; border: 1px dashed var(--border-strong); border-radius: 12px; background: var(--surface); }
.empty > svg { color: var(--accent); margin-bottom: 6px; }
.empty h2 { margin: 0; font-size: 19px; font-weight: 500; }
.empty p { margin: 0; color: var(--text-2); max-width: 420px; line-height: 1.7; font-size: 13px; }
.empty small { color: var(--text-3); font-size: 12px; }
 .empty[aria-disabled="true"] { cursor: default; }
.empty:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
@media (max-width: 700px) { .large-text-workspace { padding: 10px 12px 12px; } }
</style>
