<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  ArrowLeft,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wrench,
  X,
} from "lucide-vue-next";
import { showError } from "@/utils/errorToast";
import { useAiMcp } from "../mcp";
import { makeEntityId } from "../presets";
import { useAiStore } from "../store";
import type { McpConnectionItem, McpServerConfig } from "../types";

const { t } = useI18n();
const { config, persistConfig } = useAiStore();
const {
  connections,
  runtimeStates,
  loadMcpConnections,
  saveMcpConnections,
  connectMcpServer,
  disconnectMcpServer,
} = useAiMcp();

const mode = ref<"list" | "form">("list");
const editingId = ref<string | null>(null);
const refreshingAll = ref(false);
const validationError = ref("");

const form = reactive<{
  name: string;
  type: "stdio" | "http";
  command: string;
  argsText: string;
  cwd: string;
  envText: string;
  url: string;
  headersText: string;
}>({
  name: "",
  type: "stdio",
  command: "",
  argsText: "",
  cwd: "",
  envText: "",
  url: "",
  headersText: "",
});

onMounted(() => {
  void loadMcpConnections();
});

function isEnabled(id: string): boolean {
  return config.value.enabledMcpIds.includes(id);
}

function serverSummary(item: McpConnectionItem): string {
  if (item.config.type === "stdio") {
    const args = item.config.args?.length ? ` ${item.config.args.join(" ")}` : "";
    return `${item.config.command}${args}`;
  }
  return item.config.url;
}

function runtimeOf(id: string) {
  return runtimeStates[id] ?? { status: "idle" as const, tools: [] };
}

async function reloadList() {
  refreshingAll.value = true;
  try {
    await loadMcpConnections();
  } finally {
    refreshingAll.value = false;
  }
}

async function toggleEnable(item: McpConnectionItem) {
  if (isEnabled(item.id)) {
    config.value.enabledMcpIds = config.value.enabledMcpIds.filter((id) => id !== item.id);
    void persistConfig();
    await disconnectMcpServer(item.id);
  } else {
    config.value.enabledMcpIds = [...config.value.enabledMcpIds, item.id];
    void persistConfig();
    try {
      await connectMcpServer(item);
    } catch (error) {
      showError(error);
    }
  }
}

async function testAndRefresh(item: McpConnectionItem) {
  try {
    await connectMcpServer(item);
  } catch (error) {
    showError(error);
  }
}

function openCreate() {
  editingId.value = null;
  form.name = "";
  form.type = "stdio";
  form.command = "";
  form.argsText = "";
  form.cwd = "";
  form.envText = "";
  form.url = "";
  form.headersText = "";
  validationError.value = "";
  mode.value = "form";
}

function openEdit(item: McpConnectionItem) {
  editingId.value = item.id;
  form.name = item.name;
  form.type = item.config.type;
  if (item.config.type === "stdio") {
    form.command = item.config.command;
    form.argsText = (item.config.args ?? []).join("\n");
    form.cwd = item.config.cwd ?? "";
    form.envText = Object.entries(item.config.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    form.url = "";
    form.headersText = "";
  } else {
    form.url = item.config.url;
    form.headersText = Object.entries(item.config.headers ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    form.command = "";
    form.argsText = "";
    form.cwd = "";
    form.envText = "";
  }
  validationError.value = "";
  mode.value = "form";
}

function parseKeyValueLines(raw: string, separator: "=" | ":"): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(separator);
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

async function saveForm() {
  validationError.value = "";
  const name = form.name.trim();
  if (!name) {
    validationError.value = t("ai.settingsModal.mcpNeedName");
    return;
  }

  let serverConfig: McpServerConfig;
  if (form.type === "stdio") {
    const command = form.command.trim();
    if (!command) {
      validationError.value = t("ai.settingsModal.mcpNeedCommand");
      return;
    }
    const args = form.argsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const env = parseKeyValueLines(form.envText, "=");
    serverConfig = {
      type: "stdio",
      command,
      ...(args.length ? { args } : {}),
      ...(form.cwd.trim() ? { cwd: form.cwd.trim() } : {}),
      ...(env ? { env } : {}),
    };
  } else {
    const url = form.url.trim();
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("bad protocol");
      }
    } catch {
      validationError.value = t("ai.settingsModal.mcpInvalidUrl");
      return;
    }
    const headers = parseKeyValueLines(form.headersText, ":");
    serverConfig = {
      type: "http",
      url,
      ...(headers ? { headers } : {}),
    };
  }

  const next = [...connections.value];
  const id = editingId.value ?? makeEntityId("mcp");
  if (editingId.value) {
    const idx = next.findIndex((item) => item.id === editingId.value);
    if (idx >= 0) {
      next[idx] = { id, name, config: serverConfig };
    }
    await disconnectMcpServer(id);
  } else {
    next.push({ id, name, config: serverConfig });
  }

  try {
    await saveMcpConnections(next);
    mode.value = "list";
  } catch (error) {
    showError(error);
  }
}

async function deleteServer(item: McpConnectionItem) {
  await disconnectMcpServer(item.id);
  config.value.enabledMcpIds = config.value.enabledMcpIds.filter((id) => id !== item.id);
  void persistConfig();
  try {
    await saveMcpConnections(connections.value.filter((c) => c.id !== item.id));
  } catch (error) {
    showError(error);
  }
}
</script>

<template>
  <div class="panel-wrap">
    <template v-if="mode === 'list'">
      <div class="panel-header">
        <div>
          <h3>{{ t("ai.settingsModal.tabMcp") }}</h3>
          <p class="tip">{{ t("ai.settingsModal.mcpSharedHint") }}</p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn small" :disabled="refreshingAll" @click="reloadList">
            <RefreshCw :size="13" :class="{ spin: refreshingAll }" />
            <span>{{ t("ai.settingsModal.mcpSync") }}</span>
          </button>
          <button type="button" class="btn small primary" @click="openCreate">
            <Plus :size="14" />
            <span>{{ t("ai.settingsModal.addMcp") }}</span>
          </button>
        </div>
      </div>

      <div v-if="connections.length" class="item-list">
        <article v-for="item in connections" :key="item.id" class="mcp-card">
          <div class="mcp-top">
            <div class="item-main">
              <div class="item-title-row">
                <strong class="item-title">{{ item.name }}</strong>
                <span class="badge">{{ item.config.type.toUpperCase() }}</span>
                <span
                  v-if="runtimeOf(item.id).status === 'connected'"
                  class="badge ok"
                >
                  {{ t("ai.settingsModal.mcpToolsCount", { n: runtimeOf(item.id).tools.length }) }}
                </span>
                <span v-else-if="runtimeOf(item.id).status === 'connecting'" class="badge">
                  {{ t("ai.settingsModal.mcpConnecting") }}
                </span>
                <span v-else-if="runtimeOf(item.id).status === 'error'" class="badge bad">
                  {{ t("ai.settingsModal.mcpFailed") }}
                </span>
              </div>
              <div class="item-meta mono-text" :title="serverSummary(item)">{{ serverSummary(item) }}</div>
            </div>

            <div class="item-actions">
              <button
                type="button"
                class="icon-btn"
                :title="t('ai.settingsModal.mcpRefreshTools')"
                :aria-label="t('ai.settingsModal.mcpRefreshTools')"
                :disabled="runtimeOf(item.id).status === 'connecting'"
                @click="testAndRefresh(item)"
              >
                <LoaderCircle v-if="runtimeOf(item.id).status === 'connecting'" :size="14" class="spin" />
                <RefreshCw v-else :size="14" />
              </button>
              <button
                type="button"
                class="icon-btn"
                :title="t('ai.settingsModal.edit')"
                :aria-label="t('ai.settingsModal.edit')"
                @click="openEdit(item)"
              >
                <Pencil :size="14" />
              </button>
              <button
                type="button"
                class="icon-btn"
                :title="t('ai.settingsModal.delete')"
                :aria-label="t('ai.settingsModal.delete')"
                @click="deleteServer(item)"
              >
                <Trash2 :size="14" />
              </button>
              <button
                type="button"
                role="switch"
                class="control-switch"
                :aria-checked="isEnabled(item.id)"
                :aria-label="item.name"
                @click="toggleEnable(item)"
              >
                <span />
              </button>
            </div>
          </div>

          <div v-if="runtimeOf(item.id).tools.length" class="tool-chips">
            <span v-for="tool in runtimeOf(item.id).tools.slice(0, 12)" :key="tool.name" class="tool-chip">
              <Wrench :size="11" />
              <span>{{ tool.name }}</span>
            </span>
            <span v-if="runtimeOf(item.id).tools.length > 12" class="tool-more">
              +{{ runtimeOf(item.id).tools.length - 12 }}
            </span>
          </div>
        </article>
      </div>

      <div v-else class="empty-box">
        <p>{{ t("ai.settingsModal.noMcpServers") }}</p>
        <button type="button" class="btn primary" @click="openCreate">
          <Plus :size="14" />
          <span>{{ t("ai.settingsModal.addMcp") }}</span>
        </button>
      </div>
    </template>

    <form v-else class="editor-form" @submit.prevent="saveForm">
      <div class="panel-header">
        <div class="back-title">
          <button type="button" class="icon-btn" :title="t('ai.settingsModal.back')" @click="mode = 'list'">
            <ArrowLeft :size="16" />
          </button>
          <h3>{{ editingId ? t("ai.settingsModal.editMcp") : t("ai.settingsModal.addMcp") }}</h3>
        </div>
      </div>

      <div class="form-row">
        <label class="form-label" for="ai-mcp-name">{{ t("ai.settingsModal.mcpName") }}</label>
        <div class="form-control">
          <div class="input-wrap">
            <input id="ai-mcp-name" v-model="form.name" type="text" class="field small-text" />
            <button v-if="form.name" type="button" class="field-clear" :aria-label="t('common.clear')" @click="form.name = ''">
              <X :size="13" />
            </button>
          </div>
        </div>
      </div>

      <div class="form-row">
        <span class="form-label">{{ t("ai.settingsModal.mcpType") }}</span>
        <div class="form-control">
          <div class="seg">
            <button type="button" :class="{ on: form.type === 'stdio' }" @click="form.type = 'stdio'">Stdio</button>
            <button type="button" :class="{ on: form.type === 'http' }" @click="form.type = 'http'">HTTP</button>
          </div>
        </div>
      </div>

      <template v-if="form.type === 'stdio'">
        <div class="form-row">
          <label class="form-label" for="ai-mcp-cmd">{{ t("ai.settingsModal.mcpCommand") }}</label>
          <div class="form-control">
            <div class="input-wrap">
              <input id="ai-mcp-cmd" v-model="form.command" type="text" class="field mono" placeholder="npx / uvx / node" spellcheck="false" />
              <button v-if="form.command" type="button" class="field-clear" :aria-label="t('common.clear')" @click="form.command = ''">
                <X :size="13" />
              </button>
            </div>
          </div>
        </div>

        <div class="form-row">
          <label class="form-label" for="ai-mcp-args">{{ t("ai.settingsModal.mcpArgs") }}</label>
          <div class="form-control">
            <textarea id="ai-mcp-args" v-model="form.argsText" class="area-field mono" rows="3" :placeholder="t('ai.settingsModal.mcpArgsPlaceholder')" spellcheck="false" />
          </div>
        </div>

        <div class="form-row">
          <label class="form-label" for="ai-mcp-cwd">{{ t("ai.settingsModal.mcpCwd") }}</label>
          <div class="form-control">
            <div class="input-wrap">
              <input id="ai-mcp-cwd" v-model="form.cwd" type="text" class="field mono" spellcheck="false" />
              <button v-if="form.cwd" type="button" class="field-clear" :aria-label="t('common.clear')" @click="form.cwd = ''">
                <X :size="13" />
              </button>
            </div>
          </div>
        </div>

        <div class="form-row">
          <label class="form-label" for="ai-mcp-env">{{ t("ai.settingsModal.mcpEnv") }}</label>
          <div class="form-control">
            <textarea id="ai-mcp-env" v-model="form.envText" class="area-field mono" rows="3" placeholder="KEY=VALUE" spellcheck="false" />
          </div>
        </div>
      </template>

      <template v-else>
        <div class="form-row">
          <label class="form-label" for="ai-mcp-url">{{ t("ai.settingsModal.mcpUrl") }}</label>
          <div class="form-control">
            <div class="input-wrap">
              <input id="ai-mcp-url" v-model="form.url" type="text" class="field mono" placeholder="https://example.com/mcp" spellcheck="false" />
              <button v-if="form.url" type="button" class="field-clear" :aria-label="t('common.clear')" @click="form.url = ''">
                <X :size="13" />
              </button>
            </div>
          </div>
        </div>

        <div class="form-row">
          <label class="form-label" for="ai-mcp-headers">{{ t("ai.settingsModal.mcpHeaders") }}</label>
          <div class="form-control">
            <textarea id="ai-mcp-headers" v-model="form.headersText" class="area-field mono" rows="3" placeholder="Authorization: Bearer ..." spellcheck="false" />
          </div>
        </div>
      </template>

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
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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
.mcp-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
}
.mcp-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
.badge.ok {
  background: var(--success-soft);
  color: var(--success);
}
.badge.bad {
  background: var(--danger-soft);
  color: var(--danger);
}
.item-meta {
  font-size: 12px;
  color: var(--text-3);
}
.mono-text {
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.tool-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.tool-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 11.5px;
  font-family: var(--font-mono);
  color: var(--text-2);
}
.tool-more {
  font-size: 11.5px;
  color: var(--text-3);
  align-self: center;
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
  font-size: 13px;
  line-height: 1.55;
  resize: vertical;
  outline: none;
}
.area-field.mono {
  font-family: var(--font-mono);
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
