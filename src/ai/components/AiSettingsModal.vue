<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Bot, Plug, Wrench, X } from "lucide-vue-next";
import { useAiStore } from "../store";
import AiMcpSettings from "./AiMcpSettings.vue";
import AiModelSettings from "./AiModelSettings.vue";
import AiToolsSettings from "./AiToolsSettings.vue";

export type SettingsTab = "models" | "tools" | "mcp";

const props = withDefaults(defineProps<{ initialTab?: SettingsTab }>(), {
  initialTab: "models",
});
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const { config, availableModels, enabledBuiltinToolsCount } = useAiStore();

const activeTab = ref<SettingsTab>(props.initialTab);

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
  }
}

onMounted(() => window.addEventListener("keydown", onGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onGlobalKeydown));

const navItems = computed(() => [
  { id: "models" as const, icon: Bot, label: t("ai.settingsModal.tabModels"), count: availableModels.value.length },
  { id: "tools" as const, icon: Wrench, label: t("ai.settingsModal.tabTools"), count: enabledBuiltinToolsCount.value },
  { id: "mcp" as const, icon: Plug, label: t("ai.settingsModal.tabMcp"), count: config.value.enabledMcpIds.length },
]);
</script>

<template>
  <div class="overlay" @mousedown.self="emit('close')">
    <div class="settings-dialog" role="dialog" aria-modal="true" :aria-label="t('ai.settingsModal.title')">
      <header class="dialog-head">
        <h2>{{ t("ai.settingsModal.title") }}</h2>
        <button type="button" class="icon-btn" :title="t('ai.settingsModal.close')" :aria-label="t('ai.settingsModal.close')" @click="emit('close')">
          <X :size="16" />
        </button>
      </header>

      <div class="dialog-body">
        <nav class="dialog-nav">
          <button
            v-for="item in navItems"
            :key="item.id"
            type="button"
            class="nav-item"
            :class="{ active: activeTab === item.id }"
            @click="activeTab = item.id"
          >
            <component :is="item.icon" :size="15" />
            <span class="nav-name">{{ item.label }}</span>
            <span v-if="item.count > 0" class="nav-count">{{ item.count }}</span>
          </button>
        </nav>

        <div class="dialog-content">
          <AiModelSettings v-if="activeTab === 'models'" />
          <AiToolsSettings v-else-if="activeTab === 'tools'" />
          <AiMcpSettings v-else />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: var(--modal-scrim);
}

.settings-dialog {
  width: min(920px, calc(100% - 48px));
  height: min(680px, calc(100vh - 64px));
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dialog-head {
  flex-shrink: 0;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
}
.dialog-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.dialog-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.dialog-nav {
  width: 204px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 10px;
  border-right: 1px solid var(--border);
  background: var(--bg-sunken);
}

.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: var(--text-2);
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.nav-item:hover {
  background: var(--hover);
  color: var(--text);
}
.nav-item.active {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-sm);
}
.nav-name {
  flex: 1;
  min-width: 0;
}
.nav-count {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--active);
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.dialog-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px 28px;
  scrollbar-width: thin;
}

@media (max-width: 720px) {
  .dialog-nav {
    width: 164px;
  }
}
</style>
