<script setup lang="ts">
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { isTauri } from "@tauri-apps/api/core";
import { FileText, FolderOpen } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import { useUpdater } from "@/composables/useUpdater";
import { showError } from "@/utils/errorToast";
import FileTab from "./components/FileTab.vue";
import FilePanel from "./components/FilePanel.vue";
import { closeTabGroup, confirming, initializeLargeText, openFile } from "./useLargeText";
import { MAX_TEXT_TABS, textWorkspace } from "./workspace";

const { t } = useI18n();
const supported = isTauri();
const updater = useUpdater();
const workspace = textWorkspace;
const defaultEncoding = ref("auto");
let visible = true;
let disposed = false;
let unlisten: (() => void) | undefined;
onMounted(async () => {
  await initializeLargeText();
  if (!supported) return;
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const stop = await getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (visible && event.payload.type === "drop") void openFile(defaultEncoding.value, event.payload.paths);
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
    <div class="workspace-toolbar">
      <div class="workspace-heading"><div class="tool-symbol"><FileText :size="20" :stroke-width="1.5" /></div><div><h2>{{ t("largeText.title") }}</h2><p>{{ t("largeText.subtitle") }}</p></div></div>
      <div class="workspace-actions">
        <span v-if="workspace.tabs.length" class="file-count" :title="t('largeText.tabHint', { n: MAX_TEXT_TABS })">{{ t("largeText.fileCount", { n: workspace.tabs.length }) }}</span>
        <div v-else class="default-encoding"><AppSelect v-model="defaultEncoding" size="sm" :options="[
          { value: 'auto', label: t('largeText.auto') }, { value: 'Utf8', label: 'UTF-8' },
          { value: 'Utf16Le', label: 'UTF-16 LE' }, { value: 'Utf16Be', label: 'UTF-16 BE' }, { value: 'Gbk', label: 'GBK' },
        ]" :aria-label="t('largeText.encoding')" /></div>
        <button class="btn primary" :disabled="!supported || workspace.opening.value || confirming || ['downloading', 'installing'].includes(updater.status.value)" @click="openFile(defaultEncoding)"><FolderOpen :size="15" />{{ t("largeText.open") }}</button>
      </div>
    </div>
    <div v-if="workspace.tabs.length" class="editor-shell">
    <div class="file-tabs" role="tablist" :aria-label="t('largeText.fileTabs')">
      <FileTab v-for="(tab, index) in workspace.tabs" :key="tab.key" :tab="tab" :active="workspace.activeKey.value === tab.key" :disabled="confirming || workspace.opening.value" :has-left="index > 0" :has-right="index < workspace.tabs.length - 1" @activate="workspace.activate(tab)" @close="(scope) => closeTabGroup(tab.key, scope)" />
    </div>
    <!-- 切换标签只隐藏面板，保留各文件的滚动位置、选区和本地撤销历史。 -->
    <FilePanel v-for="tab in workspace.tabs" v-show="workspace.activeKey.value === tab.key" :id="`text-panel-${tab.key}`" :key="tab.key" role="tabpanel" :aria-labelledby="`text-tab-${tab.key}`" :controller="tab.controller" :active="workspace.activeKey.value === tab.key" />
    </div>
    <section v-else class="empty">
      <FileText :size="42" :stroke-width="1.3" />
      <h2>{{ t("largeText.emptyTitle") }}</h2>
      <p>{{ t("largeText.emptyDescription") }}</p>
      <small>{{ supported ? t("largeText.drop") : t("largeText.desktopOnly") }}</small>
    </section>
  </div>
</template>

<style scoped>
.large-text-workspace { display: flex; flex: 1; flex-direction: column; gap: 16px; padding: 20px; min-height: 0; min-width: 0; }
.workspace-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-shrink: 0; }
.workspace-heading, .workspace-actions { display: flex; align-items: center; gap: 12px; }
.workspace-heading { min-width: 0; }
.tool-symbol { display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px; color: var(--accent); background: var(--accent-soft); }
.workspace-heading h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.5; }
.workspace-heading p { margin: 1px 0 0; color: var(--text-3); font-size: 12px; }
.workspace-actions { flex-shrink: 0; }
.file-count { font-size: 12px; color: var(--text-3); white-space: nowrap; }
.default-encoding { width: 132px; }
.editor-shell { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--surface); }
.file-tabs { display: flex; gap: 0; overflow-x: auto; flex-shrink: 0; border-bottom: 1px solid var(--border); background: var(--bg-sunken); }
.empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; padding: 32px; border: 1px dashed var(--border-strong); border-radius: 12px; background: var(--surface); }
.empty > svg { color: var(--accent); margin-bottom: 6px; }
.empty h2 { margin: 0; font-size: 19px; font-weight: 500; }
.empty p { margin: 0; color: var(--text-2); max-width: 420px; line-height: 1.7; font-size: 13px; }
.empty small { color: var(--text-3); font-size: 12px; }
@media (max-width: 700px) { .large-text-workspace { padding: 12px; gap: 12px; } .workspace-heading p, .file-count { display: none; } .workspace-toolbar { gap: 8px; } .workspace-actions { gap: 6px; } }
@media (max-width: 480px) { .workspace-heading h2 { font-size: 14px; } .tool-symbol { display: none; } .default-encoding { width: 112px; } }
</style>
