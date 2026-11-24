<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Bot, FileText, Plug, SlidersHorizontal, X } from "lucide-vue-next";
import { useAiStore } from "../store";
import AiMcpSettings from "./AiMcpSettings.vue";
import AiModelSettings from "./AiModelSettings.vue";
import AiPromptSettings from "./AiPromptSettings.vue";

export type SettingsTab = "models" | "mcp" | "prompts" | "general";

const props = withDefaults(defineProps<{ initialTab?: SettingsTab }>(), {
  initialTab: "models",
});
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const { config, availableModels, persistConfig } = useAiStore();

const activeTab = ref<SettingsTab>(props.initialTab);

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void persistConfig();
  }, 240);
}

function flushSave() {
  clearTimeout(saveTimer);
  void persistConfig();
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}

onMounted(() => window.addEventListener("keydown", onGlobalKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
  flushSave();
});

function close() {
  flushSave();
  emit("close");
}

const maxTokensText = computed<string>({
  get: () => (config.value.settings.maxTokens === null ? "" : String(config.value.settings.maxTokens)),
  set(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      config.value.settings.maxTokens = null;
    } else {
      const num = Number(trimmed);
      if (Number.isFinite(num) && num > 0) config.value.settings.maxTokens = Math.round(num);
    }
    scheduleSave();
  },
});

const contextMessagesText = computed<string>({
  get: () => String(config.value.settings.contextMessages),
  set(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      config.value.settings.contextMessages = 0;
    } else {
      const num = Number(trimmed);
      if (Number.isFinite(num) && num >= 0) {
        config.value.settings.contextMessages = Math.min(100, Math.round(num));
      }
    }
    scheduleSave();
  },
});

const navItems = computed(() => [
  { id: "models" as const, icon: Bot, label: t("ai.settingsModal.tabModels"), count: availableModels.value.length },
  { id: "mcp" as const, icon: Plug, label: t("ai.settingsModal.tabMcp"), count: config.value.enabledMcpIds.length },
  { id: "prompts" as const, icon: FileText, label: t("ai.settingsModal.tabPrompts"), count: config.value.prompts.length },
  { id: "general" as const, icon: SlidersHorizontal, label: t("ai.settingsModal.general"), count: 0 },
]);
</script>

<template>
  <div class="overlay" @mousedown.self="close">
    <div class="settings-dialog" role="dialog" aria-modal="true" :aria-label="t('ai.settingsModal.title')">
      <header class="dialog-head">
        <h2>{{ t("ai.settingsModal.title") }}</h2>
        <button type="button" class="icon-btn" :title="t('ai.settingsModal.close')" :aria-label="t('ai.settingsModal.close')" @click="close">
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
          <AiMcpSettings v-else-if="activeTab === 'mcp'" />
          <AiPromptSettings v-else-if="activeTab === 'prompts'" />

          <div v-else class="general-wrap">
            <div class="panel-header">
              <h3>{{ t("ai.settingsModal.general") }}</h3>
            </div>

            <div class="form-row">
              <label class="form-label">{{ t("ai.settingsModal.temperature") }}</label>
              <div class="form-control">
                <div class="slider">
                  <input
                    v-model.number="config.settings.temperature"
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    @input="scheduleSave"
                  />
                  <em>{{ config.settings.temperature.toFixed(1) }}</em>
                </div>
                <p class="tip">{{ t("ai.settingsModal.temperatureHint") }}</p>
              </div>
            </div>

            <div class="form-row">
              <label class="form-label" for="ai-context-count">{{ t("ai.settingsModal.contextMessages") }}</label>
              <div class="form-control">
                <input
                  id="ai-context-count"
                  v-model="contextMessagesText"
                  type="number"
                  min="0"
                  max="100"
                  class="field short-number"
                />
                <p class="tip">{{ t("ai.settingsModal.contextMessagesHint") }}</p>
              </div>
            </div>

            <div class="form-row">
              <label class="form-label" for="ai-max-tokens">{{ t("ai.settingsModal.maxTokens") }}</label>
              <div class="form-control">
                <input
                  id="ai-max-tokens"
                  v-model="maxTokensText"
                  type="number"
                  min="1"
                  class="field medium-number"
                  :placeholder="t('ai.settingsModal.maxTokensPlaceholder')"
                />
              </div>
            </div>

            <div class="form-row">
              <span class="form-label">{{ t("ai.settingsModal.stream") }}</span>
              <div class="form-control">
                <div class="switch-line">
                  <button
                    type="button"
                    role="switch"
                    class="control-switch"
                    :aria-checked="config.settings.stream"
                    :aria-label="t('ai.settingsModal.stream')"
                    @click="config.settings.stream = !config.settings.stream; scheduleSave()"
                  >
                    <span />
                  </button>
                  <span class="tip">{{ t("ai.settingsModal.streamHint") }}</span>
                </div>
              </div>
            </div>

            <div class="form-row">
              <span class="form-label">{{ t("ai.settingsModal.sendKey") }}</span>
              <div class="form-control">
                <div class="seg">
                  <button
                    type="button"
                    :class="{ on: config.settings.sendKey === 'enter' }"
                    @click="config.settings.sendKey = 'enter'; scheduleSave()"
                  >
                    {{ t("ai.settingsModal.sendKeyEnter") }}
                  </button>
                  <button
                    type="button"
                    :class="{ on: config.settings.sendKey === 'ctrlEnter' }"
                    @click="config.settings.sendKey = 'ctrlEnter'; scheduleSave()"
                  >
                    {{ t("ai.settingsModal.sendKeyCtrlEnter") }}
                  </button>
                </div>
              </div>
            </div>

            <p class="storage-notice">{{ t("ai.settingsModal.storageNotice") }}</p>
          </div>
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

.general-wrap {
  max-width: 600px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel-header {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.form-row {
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}
.form-label {
  padding-top: 8px;
  font-size: 13px;
  color: var(--text-2);
  text-align: right;
}
.form-control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.short-number {
  width: 100px;
}
.medium-number {
  width: 200px;
}
.switch-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
}
.storage-notice {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-sunken);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}

@media (max-width: 720px) {
  .dialog-nav {
    width: 164px;
  }
  .form-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .form-label {
    padding-top: 0;
    text-align: left;
  }
}
</style>
