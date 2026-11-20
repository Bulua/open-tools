<script setup lang="ts">
import { computed, onDeactivated, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Braces, Globe, Terminal } from "lucide-vue-next";
import { defaultConnectionName, parseMcpConfig, parseMcpServer } from "../config";
import type { McpConnection } from "../workspace";
import McpConfigRows from "./McpConfigRows.vue";

const emit = defineEmits<{
  save: [connections: McpConnection[]];
  remove: [id: string];
}>();

const { t } = useI18n();
const dialog = ref<HTMLDialogElement>();
const formBody = ref<HTMLElement>();
const editing = ref<McpConnection>();
const confirming = ref(false);
const name = ref("");
const text = ref("");
const error = ref("");
const mode = ref<"stdio" | "http" | "json">("stdio");
const importing = computed(() => mode.value === "json");
const modes = [
  { id: "stdio", label: "stdio", icon: Terminal },
  { id: "http", label: "streamableHttp", icon: Globe },
  { id: "json", label: "importJson", icon: Braces },
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
const legacySse = ref(false);
const example = JSON.stringify({ type: "http", url: "https://mcp.example.com/mcp" }, null, 2);
const title = computed(() => t(editing.value ? "network.mcp.edit" : "network.mcp.add"));
const canSave = computed(() => Boolean(
  (importing.value ? text.value : mode.value === "stdio" ? command.value : url.value).trim(),
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
  legacySse.value = remote?.type === "sse";
  text.value = "";
  error.value = "";
  confirming.value = false;
  dialog.value?.showModal();
}

function close() {
  dialog.value?.close();
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
  text.value = "";
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

function formConfig() {
  if (mode.value === "stdio") {
    return {
      type: "stdio", command: command.value, cwd: cwd.value.trim() || undefined,
      args: args.value.flat(), env: readPairs(environment.value),
      env_vars: forward.value.flat().map((variable) => variable.trim()).filter(Boolean),
    };
  }
  return {
    type: legacySse.value ? "sse" : "http", url: url.value,
    bearer_token_env_var: bearer.value.trim() || undefined,
    headers: readPairs(headers.value, true),
    env_http_headers: Object.fromEntries(
      Object.entries(readPairs(headerVariables.value, true)).map(([key, value]) => [key, value.trim()]),
    ),
  };
}

function configEntries() {
  if (!importing.value) return new Map<string, unknown>([["", formConfig()]]);
  const parsed = parseMcpConfig(text.value);
  if ("error" in parsed) throw new Error(t("network.mcp." + parsed.error));
  return parsed.servers;
}

function save() {
  try {
    const servers = configEntries();
    const entries = Array.from(servers, ([key, raw]): McpConnection => {
      const item = parseMcpServer(raw);
      if ("error" in item) {
        const message = t("network.mcp." + item.error);
        throw new Error(key ? t("network.mcp.entryError", { name: key, message }) : message);
      }
      const customName = servers.size === 1 ? name.value.trim() : "";
      return {
        id: editing.value?.id ?? crypto.randomUUID(),
        name: customName || key.trim() || defaultConnectionName(item.config),
        config: item.config,
      };
    });
    emit("save", entries);
    close();
  } catch (issue) {
    error.value = issue instanceof Error ? issue.message : String(issue);
  }
}

function remove() {
  if (!editing.value) return;
  emit("remove", editing.value.id);
  close();
}

onDeactivated(close);
defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" class="connection-dialog" :aria-label="title" @close="clear">
    <header class="dialog-header">
      <h2>{{ title }}</h2>
      <div class="seg fill modes" role="group" :aria-label="t('network.mcp.configurationMode')">
        <template v-for="item in modes" :key="item.id">
          <button
            v-if="item.id !== 'json' || !editing"
            type="button"
            :class="{ on: mode === item.id }"
            :aria-pressed="mode === item.id"
            @click="selectMode(item.id)"
          >
            <component :is="item.icon" :size="15" aria-hidden="true" />
            {{ t('network.mcp.' + item.label) }}
          </button>
        </template>
      </div>
    </header>
    <div ref="formBody" class="form-body" @input="error = ''">
      <label class="form-field">
        {{ t("network.mcp.connectionName") }}
        <input v-model="name" class="field line-field" type="text" placeholder="my-mcp-server" autocomplete="off" />
      </label>
      <template v-if="importing">
        <label class="form-field json-field">
          {{ t("network.mcp.config") }}
          <textarea
            v-model="text"
            class="field mono line-field"
            rows="6"
            :placeholder="example"
            spellcheck="false"
            autocomplete="off"
          />
        </label>
        <p class="hint">{{ t("network.mcp.hint") }}</p>
      </template>
      <template v-else>
        <div v-if="mode === 'stdio'" class="transport-fields">
          <label class="form-field">
            {{ t("network.mcp.command") }}
            <input v-model="command" class="field line-field mono" placeholder="node" spellcheck="false" autocomplete="off" />
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
            <input v-model="cwd" class="field line-field mono" placeholder="./mcp-server" spellcheck="false" autocomplete="off" />
          </label>
        </div>
        <div v-else class="transport-fields">
          <label class="form-field">
            {{ t("network.mcp.url") }}
            <input
              v-model="url"
              class="field line-field mono"
              type="url"
              :placeholder="legacySse ? 'http://localhost:3000/sse' : 'https://mcp.example.com/mcp'"
              spellcheck="false"
              autocomplete="off"
            />
          </label>
          <label class="check">
            <input v-model="legacySse" type="checkbox" />
            {{ t("network.mcp.legacySse") }}
          </label>
          <label class="form-field">
            {{ t("network.mcp.bearerEnv") }}
            <input v-model="bearer" class="field line-field mono" placeholder="MCP_BEARER_TOKEN" spellcheck="false" autocomplete="off" />
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
      </template>
      <p v-if="error" class="hint error" role="alert">{{ error }}</p>
      <p v-if="confirming && editing" class="hint" role="status">{{ t("network.mcp.confirmRemove", { name: editing.name }) }}</p>
    </div>
    <footer class="dialog-footer">
      <p v-if="!editing" class="hint session-note">{{ t("network.mcp.sessionOnly") }}</p>
      <button v-else type="button" class="btn subtle remove" @click="confirming ? remove() : confirming = true">
        {{ t(confirming ? "network.mcp.confirmRemoveAction" : "network.mcp.remove") }}
      </button>
      <button type="button" class="btn" @click="close">{{ t("network.mcp.cancel") }}</button>
      <button type="button" class="btn primary" :disabled="!canSave" @click="save">{{ t("network.mcp.save") }}</button>
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
h2 { margin: 0; font-family: var(--font-serif); font-size: 21px; font-weight: 400; }
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
.form-body :deep(.line-field) {
  padding: 0 0 3px;
  border: 0;
  border-radius: 0;
  background:
    linear-gradient(var(--accent), var(--accent)) center bottom / 0 2px no-repeat,
    linear-gradient(var(--border-strong), var(--border-strong)) center bottom / 100% 1px no-repeat;
  transition: background-size var(--dur) var(--ease-out);
}
.form-body :deep(input.line-field) { height: 32px; }
.json-field textarea.line-field {
  height: auto;
  min-height: 110px;
  padding: 6px 0 10px;
  line-height: 1.55;
  resize: vertical;
}
.form-body :deep(.line-field:focus-within) {
  background-size: 100% 2px, 100% 1px;
  box-shadow: none;
}
.forward-env { display: grid; gap: 7px; min-width: 0; }
.json-field { flex-shrink: 0; }
.form-field, .hint { font-size: 13px; }
.form-field, .transport-fields .check { color: var(--text); font-weight: 500; }
.form-field .line-field { font-weight: 400; }
.hint { margin: 0; color: var(--text-2); overflow-wrap: anywhere; }
.error, .remove { color: var(--danger); }
.remove, .session-note { margin-inline-end: auto; }
@media (max-width: 480px) {
  .modes button { padding: 0 5px; }
  .modes button svg { display: none; }
}
@media (forced-colors: active) {
  .form-body :deep(.line-field) { border-bottom: 1px solid currentColor; }
  .form-body :deep(.line-field:focus-within) { outline: 2px solid currentColor; outline-offset: 2px; }
}
</style>
