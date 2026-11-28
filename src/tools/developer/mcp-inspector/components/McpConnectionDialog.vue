<script setup lang="ts">
import { computed, onDeactivated, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Globe, Terminal } from "lucide-vue-next";
import { closePanelDialog, vPanelDismiss } from "@/utils/panelDialog";
import { parseMcpServer, type McpConfig } from "../config";
import type { McpConnection } from "../workspace";
import McpConfigRows from "./McpConfigRows.vue";

const props = defineProps<{
  saveConnection: (connection: McpConnection) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
}>();

const { t } = useI18n();
const dialog = ref<HTMLDialogElement>();
const formBody = ref<HTMLElement>();
const editing = ref<McpConnection>();
const confirming = ref(false);
const saving = ref(false);
const name = ref("");
const error = ref("");
const mode = ref<McpConfig["type"]>("stdio");
const modes = [
  { id: "stdio", label: "stdio", icon: Terminal },
  { id: "http", label: "streamableHttp", icon: Globe },
] as const;
const command = ref("");
const cwd = ref("");
const args = ref<string[][]>([]);
const environment = ref<string[][]>([]);
const forward = ref<string[][]>([]);
const url = ref("");
const bearer = ref("");
const headers = ref<string[][]>([]);
const headerVariables = ref<string[][]>([]);
const title = computed(() => t(editing.value ? "network.mcp.edit" : "network.mcp.add"));
const canSave = computed(() => Boolean(
  name.value.trim() && (mode.value === "stdio" ? command.value : url.value).trim(),
));

function withBlankRow(rows?: string[][]): string[][] {
  return rows?.length ? rows : [[]];
}

function open(connection?: McpConnection) {
  editing.value = connection;
  name.value = connection?.name ?? "";
  const config = connection?.config;
  const local = config?.type === "stdio" ? config : undefined;
  const remote = config && config.type !== "stdio" ? config : undefined;
  mode.value = remote ? "http" : "stdio";
  command.value = local?.command ?? "";
  cwd.value = local?.cwd ?? "";
  args.value = withBlankRow(local?.args?.map((arg) => [arg]));
  environment.value = withBlankRow(Object.entries(local?.env ?? {}));
  forward.value = withBlankRow(local?.env_vars?.map((variable) => [variable]));
  url.value = remote?.url ?? "";
  bearer.value = remote?.bearer_token_env_var ?? "";
  headers.value = withBlankRow(Object.entries(remote?.headers ?? {}));
  headerVariables.value = withBlankRow(Object.entries(remote?.env_http_headers ?? {}));
  error.value = "";
  confirming.value = false;
  dialog.value?.showModal();
}

function close() {
  if (saving.value) return;
  closePanelDialog(dialog.value);
}

function selectMode(next: typeof mode.value) {
  if (mode.value === next) return;
  mode.value = next;
  error.value = "";
  if (formBody.value) formBody.value.scrollTop = 0;
}

function clear() {
  editing.value = undefined;
  name.value = "";
  environment.value = [];
  forward.value = [];
  args.value = [];
  command.value = "";
  cwd.value = "";
  url.value = "";
  bearer.value = "";
  headers.value = [];
  headerVariables.value = [];
}

function readPairs(rows: string[][], caseInsensitive = false) {
  const entries: [string, string][] = [];
  const keys = new Set<string>();
  for (const [rawKey = "", value = ""] of rows) {
    const key = rawKey.trim();
    if (!key && !value) continue;
    if (!key) throw new Error(t("network.mcp.missingKey"));
    const normalized = caseInsensitive ? key.toLowerCase() : key;
    if (keys.has(normalized)) throw new Error(t("network.mcp.duplicateKey", { key }));
    keys.add(normalized);
    entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

function formConfig(): McpConfig {
  if (mode.value === "stdio") {
    return {
      type: "stdio", command: command.value, cwd: cwd.value.trim() || undefined,
      args: args.value.flat(), env: readPairs(environment.value),
      env_vars: forward.value.flat().map((variable) => variable.trim()).filter(Boolean),
    };
  }
  return {
    type: "http", url: url.value,
    bearer_token_env_var: bearer.value.trim() || undefined,
    headers: readPairs(headers.value, true),
    env_http_headers: Object.fromEntries(
      Object.entries(readPairs(headerVariables.value, true)).map(([key, value]) => [key, value.trim()]),
    ),
  };
}

async function save() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  try {
    const item = parseMcpServer(formConfig());
    if ("error" in item) throw new Error(t("network.mcp." + item.error));
    await props.saveConnection({
      id: editing.value?.id ?? "",
      name: name.value.trim(),
      config: item.config,
    });
    closePanelDialog(dialog.value);
  } catch (issue) {
    error.value = issue instanceof Error ? issue.message : String(issue);
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!editing.value || saving.value) return;
  saving.value = true;
  try {
    await props.removeConnection(editing.value.id);
    closePanelDialog(dialog.value);
  } catch (issue) {
    error.value = issue instanceof Error ? issue.message : String(issue);
  } finally {
    saving.value = false;
  }
}

onDeactivated(() => closePanelDialog(dialog.value, true));
defineExpose({ open });
</script>

<template>
  <dialog v-panel-dismiss ref="dialog" class="connection-dialog panel-dialog" :aria-label="title" @cancel.prevent="close" @close="clear">
    <header class="dialog-header">
      <h2>{{ title }}</h2>
      <div class="seg fill modes" role="group" :aria-label="t('network.mcp.configurationMode')">
        <button
          v-for="item in modes"
          :key="item.id"
          type="button"
          :class="{ on: mode === item.id }"
          :disabled="saving"
          :aria-pressed="mode === item.id"
          @click="selectMode(item.id)"
        >
          <component :is="item.icon" :size="15" aria-hidden="true" />
          {{ t('network.mcp.' + item.label) }}
        </button>
      </div>
    </header>
    <div ref="formBody" class="form-body" :inert="saving" @input="error = ''">
      <label class="form-field">
        {{ t("network.mcp.connectionName") }}
        <input v-model="name" class="field line-field" type="text" placeholder="my-mcp-server" autocomplete="off" required />
      </label>
      <div v-if="mode === 'stdio'" class="transport-fields">
        <label class="form-field">
          {{ t("network.mcp.command") }}
          <input v-model="command" class="field line-field small-text" placeholder="node" spellcheck="false" autocomplete="off" />
        </label>
        <McpConfigRows
          v-model="args"
          :label="t('network.mcp.commandArgs')"
          :add-label="t('network.mcp.addArg')"
          value-example="./server.mjs"
          keep-row
        />
        <McpConfigRows
          v-model="environment"
          :label="t('network.mcp.environment')"
          :add-label="t('network.mcp.addEnv')"
          :key-label="t('network.mcp.envName')"
          :value-label="t('network.mcp.fieldValue')"
          key-example="LOG_LEVEL"
          value-example="info"
          keep-row
        />
        <div class="forward-env">
          <McpConfigRows
            v-model="forward"
            :label="t('network.mcp.forwardEnv')"
            :add-label="t('network.mcp.addEnv')"
            :value-label="t('network.mcp.envName')"
            value-example="MCP_API_KEY"
            keep-row
          />
          <p class="hint">{{ t("network.mcp.forwardHint") }}</p>
        </div>
        <label class="form-field">
          {{ t("network.mcp.cwd") }}
          <input v-model="cwd" class="field line-field small-text" placeholder="./mcp-server" spellcheck="false" autocomplete="off" />
        </label>
      </div>
      <div v-else class="transport-fields">
        <label class="form-field">
          {{ t("network.mcp.url") }}
          <input
            v-model="url"
            class="field line-field small-text"
            type="url"
            placeholder="https://mcp.example.com/mcp"
            spellcheck="false"
            autocomplete="off"
          />
        </label>
        <label class="form-field">
          {{ t("network.mcp.bearerEnv") }}
          <input v-model="bearer" class="field line-field small-text" placeholder="MCP_BEARER_TOKEN" spellcheck="false" autocomplete="off" />
        </label>
        <McpConfigRows
          v-model="headers"
          :label="t('network.mcp.headers')"
          :add-label="t('network.mcp.addHeader')"
          :key-label="t('network.mcp.headerName')"
          :value-label="t('network.mcp.fieldValue')"
          key-example="Authorization"
          value-example="Bearer YOUR_TOKEN"
          keep-row
        />
        <McpConfigRows
          v-model="headerVariables"
          :label="t('network.mcp.headersFromEnv')"
          :add-label="t('network.mcp.addHeader')"
          :key-label="t('network.mcp.headerName')"
          :value-label="t('network.mcp.envName')"
          key-example="X-API-Key"
          value-example="MCP_API_KEY"
          keep-row
        />
      </div>
      <p v-if="confirming && editing" class="hint" role="status">{{ t("network.mcp.confirmRemove", { name: editing.name }) }}</p>
    </div>
    <p v-if="error" class="hint error dialog-error" role="alert">{{ error }}</p>
    <footer class="dialog-footer">
      <p v-if="!editing" class="hint session-note">{{ t("network.mcp.savedLocally") }}</p>
      <button v-else type="button" class="btn subtle remove" :disabled="saving" @click="confirming ? remove() : confirming = true">
        {{ t(confirming ? "network.mcp.confirmRemoveAction" : "network.mcp.remove") }}
      </button>
      <button type="button" class="btn" :disabled="saving" @click="close">{{ t("network.mcp.cancel") }}</button>
      <button type="button" class="btn primary" :disabled="saving || !canSave" @click="save">{{ t("network.mcp.save") }}</button>
    </footer>
  </dialog>
</template>

<style scoped>
.connection-dialog {
  width: min(620px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lg);
}
.connection-dialog[open] { display: flex; flex-direction: column; }
.connection-dialog::backdrop { background: var(--modal-scrim); }
.dialog-header, .dialog-footer {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
}
.dialog-header {
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  border-bottom: 1px solid var(--border);
}
.dialog-footer { justify-content: flex-end; border-top: 1px solid var(--border); }
h2 { margin: 0; font-family: var(--font-sans); font-size: 21px; font-weight: 400; }
.modes button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; }
.modes button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.form-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding: 18px 22px;
}
.transport-fields { display: grid; gap: 16px; }
.form-field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.forward-env { display: grid; gap: 7px; min-width: 0; }
.form-field, .hint { font-size: 13px; }
.form-field { color: var(--text); font-weight: 500; }
.form-field .line-field { font-weight: 400; }
.hint { margin: 0; color: var(--text-2); overflow-wrap: anywhere; }
.error, .remove { color: var(--danger); }
.dialog-error { padding: 0 20px 10px; }
.remove, .session-note { margin-inline-end: auto; }
@media (max-width: 480px) {
  .modes button { padding: 0 5px; }
  .modes button svg { display: none; }
}
</style>
