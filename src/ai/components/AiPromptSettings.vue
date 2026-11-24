<script setup lang="ts">
import { reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowLeft, Pencil, Plus, Star, Trash2, X } from "lucide-vue-next";
import { makeEntityId } from "../presets";
import { useAiStore } from "../store";
import type { AiPromptPreset } from "../types";

const { t } = useI18n();
const { config, persistConfig } = useAiStore();

const mode = ref<"list" | "form">("list");
const editingId = ref<string | null>(null);
const validationError = ref("");

const form = reactive({
  name: "",
  content: "",
});

function openCreate() {
  editingId.value = null;
  form.name = "";
  form.content = "";
  validationError.value = "";
  mode.value = "form";
}

function openEdit(preset: AiPromptPreset) {
  editingId.value = preset.id;
  form.name = preset.name;
  form.content = preset.content;
  validationError.value = "";
  mode.value = "form";
}

function saveForm() {
  validationError.value = "";
  const name = form.name.trim();
  const content = form.content.trim();
  if (!name) {
    validationError.value = t("ai.settingsModal.promptNeedName");
    return;
  }
  if (!content) {
    validationError.value = t("ai.settingsModal.promptNeedContent");
    return;
  }

  const now = Date.now();
  if (editingId.value) {
    const target = config.value.prompts.find((p) => p.id === editingId.value);
    if (target) {
      target.name = name;
      target.content = content;
      target.updatedAt = now;
    }
  } else {
    config.value.prompts.push({
      id: makeEntityId("prm"),
      name,
      content,
      updatedAt: now,
    });
  }

  void persistConfig();
  mode.value = "list";
}

function toggleDefault(preset: AiPromptPreset) {
  config.value.settings.defaultPromptId =
    config.value.settings.defaultPromptId === preset.id ? "" : preset.id;
  void persistConfig();
}

function deletePreset(preset: AiPromptPreset) {
  config.value.prompts = config.value.prompts.filter((p) => p.id !== preset.id);
  if (config.value.settings.defaultPromptId === preset.id) {
    config.value.settings.defaultPromptId = "";
  }
  void persistConfig();
}
</script>

<template>
  <div class="panel-wrap">
    <template v-if="mode === 'list'">
      <div class="panel-header">
        <div>
          <h3>{{ t("ai.settingsModal.tabPrompts") }}</h3>
          <p class="tip">{{ t("ai.settingsModal.promptsDesc") }}</p>
        </div>
        <button type="button" class="btn small primary" @click="openCreate">
          <Plus :size="14" />
          <span>{{ t("ai.settingsModal.addPrompt") }}</span>
        </button>
      </div>

      <div v-if="config.prompts.length" class="item-list">
        <article v-for="preset in config.prompts" :key="preset.id" class="prompt-card">
          <div class="prompt-main">
            <div class="item-title-row">
              <strong class="item-title">{{ preset.name }}</strong>
              <span v-if="config.settings.defaultPromptId === preset.id" class="badge accent">
                {{ t("ai.settingsModal.defaultBadge") }}
              </span>
            </div>
            <p class="prompt-preview">{{ preset.content }}</p>
          </div>
          <div class="item-actions">
            <button
              type="button"
              class="icon-btn"
              :class="{ starred: config.settings.defaultPromptId === preset.id }"
              :title="t('ai.settingsModal.setAsDefault')"
              :aria-label="t('ai.settingsModal.setAsDefault')"
              @click="toggleDefault(preset)"
            >
              <Star :size="14" />
            </button>
            <button
              type="button"
              class="icon-btn"
              :title="t('ai.settingsModal.edit')"
              :aria-label="t('ai.settingsModal.edit')"
              @click="openEdit(preset)"
            >
              <Pencil :size="14" />
            </button>
            <button
              type="button"
              class="icon-btn"
              :title="t('ai.settingsModal.delete')"
              :aria-label="t('ai.settingsModal.delete')"
              @click="deletePreset(preset)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </article>
      </div>

      <div v-else class="empty-box">
        <p>{{ t("ai.settingsModal.noPrompts") }}</p>
        <button type="button" class="btn primary" @click="openCreate">
          <Plus :size="14" />
          <span>{{ t("ai.settingsModal.addPrompt") }}</span>
        </button>
      </div>
    </template>

    <form v-else class="editor-form" @submit.prevent="saveForm">
      <div class="panel-header">
        <div class="back-title">
          <button type="button" class="icon-btn" :title="t('ai.settingsModal.back')" @click="mode = 'list'">
            <ArrowLeft :size="16" />
          </button>
          <h3>{{ editingId ? t("ai.settingsModal.editPrompt") : t("ai.settingsModal.addPrompt") }}</h3>
        </div>
      </div>

      <div class="form-row">
        <label class="form-label" for="ai-prompt-name">{{ t("ai.settingsModal.promptName") }}</label>
        <div class="form-control">
          <div class="input-wrap">
            <input
              id="ai-prompt-name"
              v-model="form.name"
              type="text"
              class="field small-text"
              :placeholder="t('ai.settingsModal.promptNamePlaceholder')"
            />
            <button v-if="form.name" type="button" class="field-clear" :aria-label="t('common.clear')" @click="form.name = ''">
              <X :size="13" />
            </button>
          </div>
        </div>
      </div>

      <div class="form-row">
        <label class="form-label" for="ai-prompt-content">{{ t("ai.settingsModal.promptContent") }}</label>
        <div class="form-control">
          <textarea
            id="ai-prompt-content"
            v-model="form.content"
            class="area-field"
            rows="8"
            :placeholder="t('ai.settingsModal.systemPromptPlaceholder')"
          />
        </div>
      </div>

      <p v-if="validationError" class="error form-error">{{ validationError }}</p>

      <div class="form-footer">
        <button type="button" class="btn subtle" @click="mode = 'list'">{{ t("ai.cancel") }}</button>
        <button type="submit" class="btn primary">{{ t("ai.settingsModal.save") }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.panel-wrap {
  max-width: 620px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.panel-header h3 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.back-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.back-title h3 {
  margin: 0;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.prompt-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
}
.prompt-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.item-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.badge.accent {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--accent-soft);
  color: var(--accent);
}
.prompt-preview {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
}
.item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.item-actions .icon-btn.starred {
  color: var(--accent);
}

.empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
  padding: 44px 20px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  background: var(--bg);
}
.empty-box p {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form-row {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
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
.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.input-wrap .field {
  padding-right: 32px;
}
.field-clear {
  position: absolute;
  right: 6px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text-3);
  cursor: pointer;
}
.field-clear:hover {
  background: var(--hover);
  color: var(--text);
}
.area-field {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}
.area-field:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.form-error {
  padding-left: 124px;
}
.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

@media (max-width: 720px) {
  .form-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .form-label {
    padding-top: 0;
    text-align: left;
  }
  .form-error {
    padding-left: 0;
  }
}
</style>
