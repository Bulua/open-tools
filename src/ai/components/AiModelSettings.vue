<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  ArrowLeft,
  ChevronRight,
  Eye,
  EyeOff,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-vue-next";
import AppSelect, { type SelectOption } from "@/components/common/AppSelect.vue";
import { locale } from "@/locales";
import { showError } from "@/utils/errorToast";
import { fetchEndpointModels, type RemoteModelInfo } from "../client";
import {
  PROVIDER_PRESETS,
  findProviderPreset,
  isModelReady,
  makeEntityId,
  providerDisplayName,
  providerRequiresKey,
} from "../presets";
import { useAiStore } from "../store";
import type { ApiProtocol, ConfiguredModel, ThinkingSupportMode } from "../types";

const { t } = useI18n();
const { config, persistConfig } = useAiStore();

const mode = ref<"list" | "form">("list");
const editingId = ref<string | null>(null);
const showApiKey = ref(false);
const showAdvanced = ref(false);
const fetchingModels = ref(false);
const remoteModels = ref<RemoteModelInfo[]>([]);
const remoteQuery = ref("");
const selectedRemoteIds = ref<string[]>([]);
const validationError = ref("");

const form = reactive<{
  providerId: string;
  apiKey: string;
  modelId: string;
  name: string;
  protocol: ApiProtocol;
  baseUrl: string;
  thinkingSupport: ThinkingSupportMode;
}>({
  providerId: "openai",
  apiKey: "",
  modelId: "",
  name: "",
  protocol: "openai",
  baseUrl: "https://api.openai.com/v1",
  thinkingSupport: "auto",
});

const providerOptions = computed<SelectOption<string>[]>(() =>
  PROVIDER_PRESETS.map((preset) => ({
    value: preset.id,
    label: providerDisplayName(preset.id, locale.value),
  })),
);

const protocolOptions = computed<SelectOption<ApiProtocol>[]>(() => [
  { value: "openai", label: t("ai.settingsModal.protocolOpenai") },
  { value: "anthropic", label: t("ai.settingsModal.protocolAnthropic") },
  { value: "gemini", label: t("ai.settingsModal.protocolGemini") },
]);

const thinkingSupportOptions = computed<SelectOption<ThinkingSupportMode>[]>(() => [
  { value: "auto", label: t("ai.settingsModal.thinkingAuto") },
  { value: "enabled", label: t("ai.settingsModal.thinkingEnabled") },
  { value: "disabled", label: t("ai.settingsModal.thinkingDisabled") },
]);

const currentPreset = computed(() => findProviderPreset(form.providerId));
const isCustomProvider = computed(() => form.providerId === "custom");

const filteredRemoteModels = computed(() => {
  const q = remoteQuery.value.trim().toLowerCase();
  if (!q) return remoteModels.value;
  return remoteModels.value.filter(
    (item) => item.id.toLowerCase().includes(q) || (item.name ?? "").toLowerCase().includes(q),
  );
});

const pendingSaveCount = computed(() => {
  if (editingId.value) return form.modelId.trim() ? 1 : 0;
  const set = new Set<string>(selectedRemoteIds.value);
  if (form.modelId.trim()) set.add(form.modelId.trim());
  return set.size;
});

function maskKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

function openCreate() {
  editingId.value = null;
  const firstPreset = PROVIDER_PRESETS[0];
  form.providerId = firstPreset.id;
  form.protocol = firstPreset.protocol;
  form.baseUrl = firstPreset.baseUrl;
  // 若已有同提供商配置，自动带出已保存的 API Key 减少重复粘贴
  const existing = config.value.models.find((m) => m.providerId === firstPreset.id && m.apiKey.trim());
  form.apiKey = existing?.apiKey ?? "";
  form.modelId = "";
  form.name = "";
  form.thinkingSupport = "auto";
  showApiKey.value = false;
  showAdvanced.value = false;
  remoteModels.value = [];
  remoteQuery.value = "";
  selectedRemoteIds.value = [];
  validationError.value = "";
  mode.value = "form";
}

function openEdit(model: ConfiguredModel) {
  editingId.value = model.id;
  form.providerId = model.providerId;
  form.protocol = model.protocol;
  form.baseUrl = model.baseUrl;
  form.apiKey = model.apiKey;
  form.modelId = model.modelId;
  form.name = model.name;
  form.thinkingSupport = model.thinkingSupport ?? "auto";
  showApiKey.value = false;
  const preset = findProviderPreset(model.providerId);
  showAdvanced.value = model.providerId === "custom" || Boolean(preset && preset.baseUrl !== model.baseUrl);
  remoteModels.value = [];
  remoteQuery.value = "";
  selectedRemoteIds.value = [];
  validationError.value = "";
  mode.value = "form";
}

function onProviderChange(providerId: string) {
  const preset = findProviderPreset(providerId);
  remoteModels.value = [];
  remoteQuery.value = "";
  selectedRemoteIds.value = [];
  validationError.value = "";
  if (preset) {
    form.protocol = preset.protocol;
    form.baseUrl = preset.baseUrl;
    if (!editingId.value) {
      const existing = config.value.models.find((m) => m.providerId === preset.id && m.apiKey.trim());
      if (existing) {
        form.apiKey = existing.apiKey;
        form.baseUrl = existing.baseUrl;
      }
    }
  }
  showAdvanced.value = providerId === "custom";
}

function resetBaseUrl() {
  if (currentPreset.value?.baseUrl) {
    form.baseUrl = currentPreset.value.baseUrl;
  }
}

async function fetchModels() {
  if (fetchingModels.value) return;
  validationError.value = "";
  fetchingModels.value = true;
  try {
    const list = await fetchEndpointModels({
      protocol: form.protocol,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      requiresKey: providerRequiresKey(form.providerId),
    });
    remoteModels.value = list;
    remoteQuery.value = "";
    if (!list.length) {
      validationError.value = t("ai.settingsModal.noRemoteModels");
    }
  } catch (error) {
    showError(error);
  } finally {
    fetchingModels.value = false;
  }
}

function toggleRemoteSelection(modelId: string) {
  if (editingId.value) {
    form.modelId = modelId;
    return;
  }
  if (selectedRemoteIds.value.includes(modelId)) {
    selectedRemoteIds.value = selectedRemoteIds.value.filter((id) => id !== modelId);
  } else {
    selectedRemoteIds.value = [...selectedRemoteIds.value, modelId];
  }
}

function pickSampleModel(modelId: string) {
  if (editingId.value) {
    form.modelId = modelId;
    return;
  }
  if (!form.modelId.trim()) {
    form.modelId = modelId;
  } else if (form.modelId.trim() !== modelId && !selectedRemoteIds.value.includes(modelId)) {
    selectedRemoteIds.value = [...selectedRemoteIds.value, modelId];
  }
}

function saveForm() {
  validationError.value = "";
  const baseUrl = form.baseUrl.trim();
  if (!baseUrl) {
    validationError.value = t("ai.errors.missingBaseUrl");
    showAdvanced.value = true;
    return;
  }
  if (providerRequiresKey(form.providerId) && !form.apiKey.trim()) {
    validationError.value = t("ai.errors.missingApiKey");
    return;
  }

  if (editingId.value) {
    const modelId = form.modelId.trim();
    if (!modelId) {
      validationError.value = t("ai.settingsModal.needModelId");
      return;
    }
    const target = config.value.models.find((m) => m.id === editingId.value);
    if (target) {
      target.providerId = form.providerId;
      target.protocol = form.protocol;
      target.baseUrl = baseUrl;
      target.apiKey = form.apiKey.trim();
      target.modelId = modelId;
      target.name = form.name.trim();
      target.thinkingSupport = form.thinkingSupport === "auto" ? undefined : form.thinkingSupport;
    }
  } else {
    const ids = new Set<string>(selectedRemoteIds.value);
    if (form.modelId.trim()) ids.add(form.modelId.trim());
    if (ids.size === 0) {
      validationError.value = t("ai.settingsModal.needModelId");
      return;
    }
    const remoteNameMap = new Map(remoteModels.value.map((m) => [m.id, m.name ?? ""]));
    let firstCreatedId = "";
    for (const modelId of ids) {
      const id = makeEntityId("mdl");
      if (!firstCreatedId) firstCreatedId = id;
      config.value.models.push({
        id,
        providerId: form.providerId,
        protocol: form.protocol,
        baseUrl,
        apiKey: form.apiKey.trim(),
        modelId,
        name: ids.size === 1 ? (form.name.trim() || remoteNameMap.get(modelId) || "") : (remoteNameMap.get(modelId) || ""),
        enabled: true,
        thinkingSupport: form.thinkingSupport === "auto" ? undefined : form.thinkingSupport,
      });
    }
    if (!config.value.settings.defaultModelConfigId && firstCreatedId) {
      config.value.settings.defaultModelConfigId = firstCreatedId;
    }
  }

  void persistConfig();
  mode.value = "list";
}

function toggleEnabled(model: ConfiguredModel) {
  model.enabled = !model.enabled;
  void persistConfig();
}

function setDefault(model: ConfiguredModel) {
  config.value.settings.defaultModelConfigId =
    config.value.settings.defaultModelConfigId === model.id ? "" : model.id;
  void persistConfig();
}

function deleteModel(model: ConfiguredModel) {
  config.value.models = config.value.models.filter((m) => m.id !== model.id);
  if (config.value.settings.defaultModelConfigId === model.id) {
    config.value.settings.defaultModelConfigId = config.value.models.find(isModelReady)?.id ?? "";
  }
  void persistConfig();
}
</script>

<template>
  <div class="panel-wrap">
    <!-- 列表视图 -->
    <template v-if="mode === 'list'">
      <div class="panel-header">
        <div>
          <h3>{{ t("ai.settingsModal.tabModels") }}</h3>
          <p class="tip">{{ t("ai.settingsModal.modelsDesc") }}</p>
        </div>
        <button type="button" class="btn small primary" @click="openCreate">
          <Plus :size="14" />
          <span>{{ t("ai.settingsModal.addModelConfig") }}</span>
        </button>
      </div>

      <div v-if="config.models.length" class="item-list">
        <article v-for="model in config.models" :key="model.id" class="item-card" :class="{ disabled: !model.enabled }">
          <div class="item-main">
            <div class="item-title-row">
              <strong class="item-title">{{ model.name || model.modelId }}</strong>
              <span class="badge">{{ providerDisplayName(model.providerId, locale) }}</span>
              <span v-if="config.settings.defaultModelConfigId === model.id" class="badge accent">
                {{ t("ai.settingsModal.defaultBadge") }}
              </span>
            </div>
            <div class="item-meta">
              <span class="mono-text">{{ model.modelId }}</span>
              <span v-if="model.apiKey" class="meta-sep">·</span>
              <span v-if="model.apiKey" class="mono-text">{{ maskKey(model.apiKey) }}</span>
            </div>
          </div>

          <div class="item-actions">
            <button
              type="button"
              class="icon-btn"
              :class="{ starred: config.settings.defaultModelConfigId === model.id }"
              :title="t('ai.settingsModal.setAsDefault')"
              :aria-label="t('ai.settingsModal.setAsDefault')"
              @click="setDefault(model)"
            >
              <Star :size="14" />
            </button>
            <button
              type="button"
              class="icon-btn"
              :title="t('ai.settingsModal.edit')"
              :aria-label="t('ai.settingsModal.edit')"
              @click="openEdit(model)"
            >
              <Pencil :size="14" />
            </button>
            <button
              type="button"
              class="icon-btn"
              :title="t('ai.settingsModal.delete')"
              :aria-label="t('ai.settingsModal.delete')"
              @click="deleteModel(model)"
            >
              <Trash2 :size="14" />
            </button>
            <button
              type="button"
              role="switch"
              class="control-switch"
              :aria-checked="model.enabled"
              :aria-label="model.name || model.modelId"
              @click="toggleEnabled(model)"
            >
              <span />
            </button>
          </div>
        </article>
      </div>

      <div v-else class="empty-box">
        <p>{{ t("ai.settingsModal.noConfiguredModels") }}</p>
        <button type="button" class="btn primary" @click="openCreate">
          <Plus :size="14" />
          <span>{{ t("ai.settingsModal.addModelConfig") }}</span>
        </button>
      </div>
    </template>

    <!-- 新增 / 编辑表单 -->
    <form v-else class="editor-form" @submit.prevent="saveForm">
      <div class="panel-header">
        <div class="back-title">
          <button type="button" class="icon-btn" :title="t('ai.settingsModal.back')" @click="mode = 'list'">
            <ArrowLeft :size="16" />
          </button>
          <h3>{{ editingId ? t("ai.settingsModal.editModelConfig") : t("ai.settingsModal.addModelConfig") }}</h3>
        </div>
      </div>

      <div class="form-row">
        <label class="form-label">{{ t("ai.settingsModal.provider") }}</label>
        <div class="form-control">
          <AppSelect
            v-model="form.providerId"
            :options="providerOptions"
            @update:model-value="onProviderChange"
          />
        </div>
      </div>

      <div class="form-row">
        <label class="form-label" for="ai-model-apikey">{{ t("ai.settingsModal.apiKey") }}</label>
        <div class="form-control">
          <div class="input-wrap">
            <input
              id="ai-model-apikey"
              v-model="form.apiKey"
              :type="showApiKey ? 'text' : 'password'"
              class="field mono key-input"
              :placeholder="providerRequiresKey(form.providerId) ? t('ai.settingsModal.apiKeyPlaceholder') : t('ai.settingsModal.apiKeyOptionalPlaceholder')"
              autocomplete="off"
              spellcheck="false"
            />
            <div class="inline-actions">
              <button
                v-if="form.apiKey"
                type="button"
                class="field-action"
                :aria-label="t('common.clear')"
                @click="form.apiKey = ''"
              >
                <X :size="13" />
              </button>
              <button
                type="button"
                class="field-action"
                :title="showApiKey ? t('ai.settingsModal.hideKey') : t('ai.settingsModal.showKey')"
                :aria-label="showApiKey ? t('ai.settingsModal.hideKey') : t('ai.settingsModal.showKey')"
                @click="showApiKey = !showApiKey"
              >
                <EyeOff v-if="showApiKey" :size="14" />
                <Eye v-else :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="form-row">
        <label class="form-label" for="ai-model-id">{{ t("ai.settingsModal.modelId") }}</label>
        <div class="form-control">
          <div class="inline-row">
            <div class="input-wrap flex-1">
              <input
                id="ai-model-id"
                v-model="form.modelId"
                type="text"
                class="field mono"
                :placeholder="t('ai.settingsModal.addModelPlaceholder')"
                spellcheck="false"
              />
              <button
                v-if="form.modelId"
                type="button"
                class="field-clear"
                :aria-label="t('common.clear')"
                @click="form.modelId = ''"
              >
                <X :size="13" />
              </button>
            </div>
            <button type="button" class="btn small" :disabled="fetchingModels" @click="fetchModels">
              <LoaderCircle v-if="fetchingModels" :size="13" class="spin" />
              <RefreshCw v-else :size="13" />
              <span>{{ fetchingModels ? t("ai.settingsModal.fetching") : t("ai.settingsModal.fetchModels") }}</span>
            </button>
          </div>

          <!-- 常用参考模型快捷点选 -->
          <div v-if="currentPreset?.sampleModels.length && !remoteModels.length" class="sample-chips">
            <button
              v-for="sample in currentPreset.sampleModels"
              :key="sample"
              type="button"
              class="chip"
              :class="{ active: form.modelId === sample || selectedRemoteIds.includes(sample) }"
              @click="pickSampleModel(sample)"
            >
              {{ sample }}
            </button>
          </div>

          <!-- 拉取到的远程模型列表（新增时支持多选勾选，编辑时点击填入） -->
          <div v-if="remoteModels.length" class="remote-box">
            <div class="remote-head">
              <label class="remote-search">
                <Search :size="13" />
                <input
                  v-model="remoteQuery"
                  type="text"
                  :placeholder="t('ai.settingsModal.filterRemoteModels', { n: remoteModels.length })"
                  spellcheck="false"
                />
                <button
                  v-if="remoteQuery"
                  type="button"
                  class="field-action"
                  :aria-label="t('common.clear')"
                  @click="remoteQuery = ''"
                >
                  <X :size="12" />
                </button>
              </label>
              <span v-if="!editingId && selectedRemoteIds.length" class="selected-count">
                {{ t("ai.settingsModal.selectedModelsCount", { n: selectedRemoteIds.length }) }}
              </span>
            </div>

            <div class="remote-list">
              <label
                v-for="item in filteredRemoteModels"
                :key="item.id"
                class="remote-option"
                :class="{ checked: editingId ? form.modelId === item.id : selectedRemoteIds.includes(item.id) }"
              >
                <input
                  v-if="!editingId"
                  type="checkbox"
                  :checked="selectedRemoteIds.includes(item.id)"
                  @change="toggleRemoteSelection(item.id)"
                />
                <input
                  v-else
                  type="radio"
                  name="remote-model-pick"
                  :checked="form.modelId === item.id"
                  @change="toggleRemoteSelection(item.id)"
                />
                <span class="remote-id">{{ item.id }}</span>
                <span v-if="item.name && item.name !== item.id" class="remote-name">{{ item.name }}</span>
              </label>
              <p v-if="!filteredRemoteModels.length" class="tip remote-empty">{{ t("common.noOptions") }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="editingId || selectedRemoteIds.length <= 1" class="form-row">
        <label class="form-label" for="ai-model-alias">{{ t("ai.settingsModal.modelAlias") }}</label>
        <div class="form-control">
          <div class="input-wrap">
            <input
              id="ai-model-alias"
              v-model="form.name"
              type="text"
              class="field small-text"
              :placeholder="t('ai.settingsModal.modelAliasPlaceholder')"
            />
            <button
              v-if="form.name"
              type="button"
              class="field-clear"
              :aria-label="t('common.clear')"
              @click="form.name = ''"
            >
              <X :size="13" />
            </button>
          </div>
        </div>
      </div>

      <!-- 高级选项：默认收起，选自定义接口或需要填代理地址时展开 -->
      <div class="advanced-section">
        <button
          type="button"
          class="advanced-toggle"
          :aria-expanded="showAdvanced || isCustomProvider"
          @click="showAdvanced = !showAdvanced"
        >
          <ChevronRight :size="14" class="chevron" :class="{ open: showAdvanced || isCustomProvider }" />
          <span>{{ t("ai.settingsModal.advancedEndpoint") }}</span>
          <span v-if="!showAdvanced && !isCustomProvider && form.baseUrl" class="advanced-preview">{{ form.baseUrl }}</span>
        </button>

        <div v-if="showAdvanced || isCustomProvider" class="advanced-body">
          <div class="form-row">
            <label class="form-label" for="ai-model-baseurl">{{ t("ai.settingsModal.baseUrl") }}</label>
            <div class="form-control">
              <div class="inline-row">
                <div class="input-wrap flex-1">
                  <input
                    id="ai-model-baseurl"
                    v-model="form.baseUrl"
                    type="text"
                    class="field mono"
                    :placeholder="t('ai.settingsModal.baseUrlPlaceholder')"
                    spellcheck="false"
                  />
                  <button
                    v-if="form.baseUrl"
                    type="button"
                    class="field-clear"
                    :aria-label="t('common.clear')"
                    @click="form.baseUrl = ''"
                  >
                    <X :size="13" />
                  </button>
                </div>
                <button
                  v-if="currentPreset?.baseUrl && form.baseUrl !== currentPreset.baseUrl"
                  type="button"
                  class="btn small subtle"
                  @click="resetBaseUrl"
                >
                  <RotateCcw :size="13" />
                  <span>{{ t("ai.settingsModal.resetBaseUrl") }}</span>
                </button>
              </div>
            </div>
          </div>

          <div class="form-row">
            <label class="form-label">{{ t("ai.settingsModal.protocol") }}</label>
            <div class="form-control">
              <AppSelect v-model="form.protocol" :options="protocolOptions" />
            </div>
          </div>

          <div class="form-row">
            <label class="form-label">{{ t("ai.settingsModal.thinkingSupport") }}</label>
            <div class="form-control">
              <AppSelect v-model="form.thinkingSupport" :options="thinkingSupportOptions" />
              <p class="tip">{{ t("ai.settingsModal.thinkingSupportHint") }}</p>
            </div>
          </div>
        </div>
      </div>

      <p v-if="validationError" class="error form-error">{{ validationError }}</p>

      <div class="form-footer">
        <button type="button" class="btn subtle" @click="mode = 'list'">{{ t("ai.cancel") }}</button>
        <button type="submit" class="btn primary">
          {{
            editingId
              ? t("ai.settingsModal.save")
              : pendingSaveCount > 1
                ? t("ai.settingsModal.saveMultipleModels", { n: pendingSaveCount })
                : t("ai.settingsModal.save")
          }}
        </button>
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
.item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  transition: border-color var(--dur-fast) var(--ease-out);
}
.item-card:hover {
  border-color: var(--border-strong);
}
.item-card.disabled {
  opacity: 0.65;
}
.item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.item-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.badge {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--active);
  color: var(--text-2);
}
.badge.accent {
  background: var(--accent-soft);
  color: var(--accent);
}
.item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
}
.mono-text {
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-sep {
  flex-shrink: 0;
}
.item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
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
  gap: 16px;
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
  gap: 8px;
  min-width: 0;
}
.inline-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.flex-1 {
  flex: 1;
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
.input-wrap .key-input {
  padding-right: 60px;
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
.field-clear:hover,
.field-action:hover {
  background: var(--hover);
  color: var(--text);
}
.inline-actions {
  position: absolute;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 2px;
}
.field-action {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text-3);
  cursor: pointer;
}

.sample-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  color: var(--text-2);
  font-size: 11.5px;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.chip:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.chip.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.remote-box {
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg);
  overflow: hidden;
}
.remote-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
}
.remote-search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
}
.remote-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: none;
  color: var(--text);
  font-size: 12.5px;
}
.selected-count {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 500;
}
.remote-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scrollbar-width: thin;
}
.remote-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.remote-option:hover {
  background: var(--hover);
}
.remote-option.checked {
  background: var(--accent-soft);
}
.remote-option input {
  accent-color: var(--accent);
  margin: 0;
  flex-shrink: 0;
}
.remote-id {
  font-size: 12.5px;
  font-family: var(--font-mono);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.remote-name {
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.remote-empty {
  padding: 12px;
  text-align: center;
}

.advanced-section {
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--text-2);
  font-size: 12.5px;
  cursor: pointer;
}
.advanced-toggle:hover {
  color: var(--text);
}
.advanced-toggle .chevron {
  transition: transform var(--dur-fast) var(--ease-out);
}
.advanced-toggle .chevron.open {
  transform: rotate(90deg);
}
.advanced-preview {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11.5px;
}
.advanced-body {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
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
