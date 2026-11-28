<script setup lang="ts">
import { ChevronDown, FileText, FolderOpen, Pencil, Plug, Plus, Server, Wrench } from "lucide-vue-next";
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mcpApi } from "@/api/mcp";
import { errorMessage, showError } from "@/utils/errorToast";
import { loadCatalog, type CatalogTab, type McpEntry } from "./catalog";
import { connectionTarget } from "./config";
import McpCatalogList from "./components/McpCatalogList.vue";
import McpConnectionDialog from "./components/McpConnectionDialog.vue";
import McpContentDetail from "./components/McpContentDetail.vue";
import McpToolDetail from "./components/McpToolDetail.vue";
import { connections, sessions, type McpConnection } from "./workspace";

type Tab = "servers" | CatalogTab;
const { t } = useI18n();
const dialog = ref<InstanceType<typeof McpConnectionDialog>>();
const loadingConnections = ref(false);
const storageError = ref("");
const tab = ref<Tab>("servers");
const serverId = ref("");
const connected = computed(() => connections.value.filter((item) => sessions.get(item.id)?.status === "connected"));
const current = computed(() => {
  const session = sessions.get(serverId.value);
  return session?.status === "connected" ? session : undefined;
});
function serverInfo(id: string) {
  const session = sessions.get(id);
  if (session?.status !== "connected") return;
  const { info } = session;
  const version = t("network.mcp.protocol", { version: info.protocolVersion });
  return info.serverInfo ? `${info.serverInfo.name} ${info.serverInfo.version} · ${version}` : version;
}
const catalogTab = computed(() => tab.value === "servers" ? undefined : tab.value);
const tabs = [
  { id: "servers", icon: Server }, { id: "tools", icon: Wrench },
  { id: "prompts", icon: FileText }, { id: "resources", icon: FolderOpen },
] as const;
const entries = shallowRef<McpEntry[]>([]);
const selected = shallowRef<McpEntry>();
const loading = ref(false);
const catalogError = ref("");
const refresh = ref(0);

watch(connected, (items) => {
  if (!items.some((item) => item.id === serverId.value)) serverId.value = items[0]?.id ?? "";
  if (!items.length) tab.value = "servers";
}, { flush: "sync" });

watch([() => current.value?.sessionId, catalogTab, refresh], async ([sessionId, section], _, onCleanup) => {
  const previous = selected.value;
  selected.value = undefined;
  entries.value = [];
  catalogError.value = "";
  loading.value = Boolean(sessionId && section);
  if (!sessionId || !section) return;
  let obsolete = false;
  onCleanup(() => { obsolete = true; });
  try {
    const result = await loadCatalog(sessionId, section);
    if (obsolete) return;
    entries.value = result.entries;
    catalogError.value = result.error ?? "";
    selected.value = result.entries.find((entry) => entry.kind === previous?.kind && entry.id === previous.id)
      ?? (section === "tools" ? result.entries[0] : undefined);
  } catch (issue) {
    if (!obsolete) catalogError.value = errorMessage(issue);
  } finally {
    if (!obsolete) loading.value = false;
  }
});

let statusTimer: ReturnType<typeof setInterval> | undefined;
let checking = false;
let visible = false;
async function checkSessions() {
  if (checking || !connected.value.length) return;
  const snapshot = connected.value.map(({ id, name }) => ({ id, name, session: sessions.get(id) }));
  checking = true;
  try {
    const active = new Set(await mcpApi.activeSessions());
    for (const { id, name, session } of snapshot) {
      if (session?.status === "connected" && sessions.get(id) === session && !active.has(session.sessionId)) {
        sessions.set(id, { status: "failed" });
        if (visible) showError(t("network.mcp.connectionLost"), name);
      }
    }
  } catch {
    // IPC 暂时不可用时保留连接状态，下一轮重试。
  } finally {
    checking = false;
  }
}
function startStatus() {
  visible = true;
  if (statusTimer !== undefined) return;
  void checkSessions();
  statusTimer = setInterval(() => void checkSessions(), 3000);
}
function stopStatus() {
  visible = false;
  clearInterval(statusTimer);
  statusTimer = undefined;
}
async function restoreConnections() {
  if (loadingConnections.value) return;
  loadingConnections.value = true;
  storageError.value = "";
  try {
    connections.value = await mcpApi.readConnections();
  } catch (issue) {
    storageError.value = errorMessage(issue);
  } finally {
    loadingConnections.value = false;
  }
}
let unlistenMcpChanged: (() => void) | undefined;
onMounted(() => {
  startStatus();
  void restoreConnections();
  void mcpApi.onConnectionsChanged(() => void restoreConnections())
    .then((unlisten) => { unlistenMcpChanged = unlisten; })
    .catch(() => undefined);
});
onActivated(() => {
  startStatus();
  void restoreConnections();
});
onDeactivated(stopStatus);
onBeforeUnmount(() => {
  stopStatus();
  unlistenMcpChanged?.();
  unlistenMcpChanged = undefined;
});

async function connectServer(item: McpConnection) {
  const sessionId = crypto.randomUUID();
  sessions.set(item.id, { status: "connecting", sessionId });
  try {
    const info = await mcpApi.connect(sessionId, item.config);
    sessions.set(item.id, { status: "connected", sessionId, info });
    if (visible && tab.value === "servers") browse(item);
  } catch (issue) {
    sessions.set(item.id, { status: "failed" });
    if (visible) showError(issue, t("network.mcp.failed"));
  }
}

async function disconnectServer(id: string): Promise<boolean> {
  const previous = sessions.get(id);
  if (previous?.status !== "connected") return !previous || previous.status === "failed";
  sessions.set(id, { status: "disconnecting", sessionId: previous.sessionId });
  try {
    await mcpApi.disconnect(previous.sessionId);
    sessions.delete(id);
    return true;
  } catch (issue) {
    sessions.set(id, previous);
    if (visible) showError(issue);
    return false;
  }
}

function busy(id: string) {
  const state = sessions.get(id)?.status;
  return state === "connecting" || state === "disconnecting";
}

function browse(item: McpConnection) {
  serverId.value = item.id;
  tab.value = "tools";
}

function toggleConnection(item: McpConnection) {
  if (busy(item.id)) return;
  if (sessions.get(item.id)?.status === "connected") void disconnectServer(item.id);
  else void connectServer(item);
}

async function saveConnection(item: McpConnection) {
  const existing = Boolean(item.id) && connections.value.some(({ id }) => id === item.id);
  if (existing && !await disconnectServer(item.id)) throw new Error(t("network.mcp.disconnectFailed"));
  const next = existing
    ? connections.value.map((previous) => previous.id === item.id ? item : previous)
    : [...connections.value, item];
  await persistConnections(next);
  if (item.id) sessions.delete(item.id);
}

async function removeConnection(id: string) {
  if (!await disconnectServer(id)) throw new Error(t("network.mcp.disconnectFailed"));
  await persistConnections(connections.value.filter((item) => item.id !== id));
  sessions.delete(id);
}

async function persistConnections(next: McpConnection[]) {
  try {
    connections.value = await mcpApi.saveConnections(next);
  } catch (issue) {
    throw new Error(t("network.mcp.saveConnectionsFailed", { error: errorMessage(issue) }));
  }
}

const description = computed(() => {
  const entry = selected.value;
  const text = entry?.value.description?.replace(/\x60+/g, "").trim();
  if (!text || entry?.kind !== "tool") return text;
  return text.replace(/\r\n?/g, "\n").split(/\n(?:[^\S\n]*\n)+/)
    .map((paragraph) => paragraph.replace(/[^\S\n]*\n[^\S\n]*/g, " ")).join("\n\n");
});
const descriptionId = useId();
const descriptionExpanded = ref(true);
const descriptionAction = computed(() => t(descriptionExpanded.value ? "network.mcp.collapseDescription" : "network.mcp.expandDescription"));
watch(selected, () => { descriptionExpanded.value = true; });
</script>

<template>
  <section class="card mcp-workspace">
    <header class="workspace-head">
      <h2>{{ t("network.mcp.connections") }}</h2>
      <div v-if="connected.length" class="seg workspace-tabs" role="group" :aria-label="t('network.mcp.sections')">
        <button v-for="item in tabs" :key="item.id" type="button" :class="{ on: tab === item.id }"
          :aria-pressed="tab === item.id" @click="tab = item.id">
          <component :is="item.icon" :size="14" aria-hidden="true" />
          {{ t(`network.mcp.${item.id}`) }}
        </button>
      </div>
    </header>

    <div v-if="tab === 'servers'" class="servers-pane">
      <p v-if="loadingConnections" class="storage-status" role="status">{{ t("network.mcp.loadingCatalog") }}</p>
      <div v-else-if="storageError" class="storage-status" role="alert">
        <p class="error">{{ t("network.mcp.readConnectionsFailed", { error: storageError }) }}</p>
        <button type="button" class="btn small" @click="restoreConnections">{{ t("network.mcp.retryConnections") }}</button>
      </div>
      <ul v-else class="connection-grid">
        <li v-for="item in connections" :key="item.id" class="connection-card">
          <div class="card-top">
            <span class="transport"><Plug :size="15" aria-hidden="true" />{{ t(item.config.type === "stdio" ? "network.mcp.stdio" : "network.mcp.streamableHttp") }}</span>
            <button type="button" class="control-switch" role="switch" :aria-checked="sessions.get(item.id)?.status === 'connected'"
              :aria-label="t('network.mcp.toggleServer', { name: item.name })" :disabled="busy(item.id)" @click="toggleConnection(item)">
              <span aria-hidden="true" />
            </button>
          </div>
          <strong class="connection-name" :title="serverInfo(item.id)">{{ item.name }}</strong>
          <code class="address">{{ connectionTarget(item.config) }}</code>
          <div class="card-bottom">
            <span class="connection-status" :class="{ online: sessions.get(item.id)?.status === 'connected' }">
              {{ t(`network.mcp.connection.${sessions.get(item.id)?.status ?? 'disconnected'}`) }}
            </span>
            <button v-if="sessions.get(item.id)?.status === 'connected'" type="button" class="btn subtle small" @click="browse(item)">
              {{ t("network.mcp.browseServer") }}
            </button>
            <button type="button" class="icon-btn" :title="t('network.mcp.editNamed', { name: item.name })"
              :aria-label="t('network.mcp.editNamed', { name: item.name })" :disabled="busy(item.id)" @click="dialog?.open(item)">
              <Pencil :size="15" aria-hidden="true" />
            </button>
          </div>
        </li>
        <li>
          <button type="button" class="connection-add" @click="dialog?.open()">
            <Plus :size="22" aria-hidden="true" />
            {{ t("network.mcp.add") }}
          </button>
        </li>
      </ul>
    </div>

    <div v-else-if="catalogTab && current" class="catalog">
      <McpCatalogList :key="catalogTab" :tab="catalogTab" :entries="entries" :selected="selected" :loading="loading" :error="catalogError"
        @select="selected = $event" @refresh="refresh++" />
      <section class="catalog-details" :aria-label="t(`network.mcp.${catalogTab}`)">
        <template v-if="selected">
          <header class="entry-head">
            <h3>{{ selected.title }}</h3>
            <button v-if="selected.kind === 'tool' && description" type="button" class="icon-btn description-toggle"
              :title="descriptionAction" :aria-label="descriptionAction" :aria-controls="descriptionId"
              :aria-expanded="descriptionExpanded" @click="descriptionExpanded = !descriptionExpanded">
              <ChevronDown :size="16" aria-hidden="true" />
            </button>
            <p v-if="description" v-show="selected.kind !== 'tool' || descriptionExpanded" :id="descriptionId">{{ description }}</p>
          </header>
          <McpToolDetail v-if="selected.kind === 'tool'" :key="current.sessionId + ':' + selected.id" :session-id="current.sessionId" :tool="selected.value" />
          <McpContentDetail v-else :key="current.sessionId + ':' + selected.kind + ':' + selected.id" :session-id="current.sessionId" :entry="selected" />
        </template>
        <p v-else class="empty-state">{{ t(loading ? "network.mcp.loadingCatalog" : `network.mcp.select.${catalogTab}`) }}</p>
      </section>
    </div>

    <McpConnectionDialog ref="dialog" :save-connection="saveConnection" :remove-connection="removeConnection" />
  </section>
</template>

<style scoped>
.mcp-workspace { flex: 1; min-width: 0; min-height: 0; container: mcp-workspace / inline-size; background: var(--surface); }
.workspace-head {
  display: grid; flex: none; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center; gap: 8px 14px;
  min-height: 56px; padding: 8px 16px; border-bottom: 1px solid var(--border);
}
.workspace-head h2 { grid-area: 1 / 1; margin: 0; font-size: 16px; font-weight: 600; }
.workspace-tabs { grid-area: 1 / 2; justify-self: center; max-width: 100%; }
.workspace-tabs button { display: flex; align-items: center; gap: 5px; }
.servers-pane, .catalog { min-height: 0; min-width: 0; flex: 1; padding: 14px; }
.servers-pane { overflow: auto; }
.storage-status { margin: 0; display: grid; justify-items: start; gap: 8px; color: var(--text-2); font-size: 13px; }
.connection-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: 12px; margin: 0; padding: 0; list-style: none;
}
.connection-card, .connection-add {
  display: flex; flex-direction: column; min-width: 0; min-height: 144px;
  padding: 12px; gap: 7px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface);
}
.card-top, .card-bottom, .transport { display: flex; align-items: center; gap: 6px; }
.card-top { justify-content: space-between; }
.card-bottom { margin-top: auto; }
.transport, .connection-status { color: var(--text-2); font-size: 12px; }
.connection-status { margin-inline-end: auto; }
.connection-status.online { color: var(--success); }
.connection-name { font-size: 15px; overflow-wrap: anywhere; }
.address { font: 12px var(--font-sans); color: var(--text-2); overflow-wrap: anywhere; }
.error { margin: 0; color: var(--danger); font-size: 12px; overflow-wrap: anywhere; }
.connection-add { width: 100%; height: 100%; align-items: center; justify-content: center; border-style: dashed; color: var(--text-2); }
.connection-add:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.catalog {
  display: grid; grid-template-columns: clamp(190px, 27%, 290px) minmax(0, 1fr); gap: 12px; background: var(--surface);
}
.catalog-details {
  --mcp-details-padding: 14px;
  display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; padding: var(--mcp-details-padding);
  overflow: auto; container: mcp-details / inline-size;
  border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface);
}
.entry-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 5px 8px; }
.entry-head h3 { margin: 0; font: 600 15px/1.4 var(--font-sans); overflow-wrap: anywhere; }
.entry-head p { grid-column: 1 / -1; min-width: 0; margin: 0; color: var(--text-2); font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
.entry-head:has(+ .editing-arguments) p { max-height: min(24vh, 160px); overflow: auto; scrollbar-width: thin; }
.description-toggle { grid-column: 2; }
.description-toggle svg { transition: transform var(--dur-fast) var(--ease-out); }
.description-toggle[aria-expanded="false"] svg { transform: rotate(-90deg); }
.empty-state { margin: auto; padding: 16px; color: var(--text-2); font-size: 13px; text-align: center; }
@container mcp-workspace (max-width: 650px) {
  .workspace-head { grid-template-columns: minmax(0, 1fr); }
  .workspace-tabs { grid-area: 2 / 1 / 3 / -1; flex-wrap: wrap; justify-content: center; }
  .workspace-tabs button svg { display: none; }
  .catalog { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(120px, 32%) minmax(280px, 1fr); overflow: auto; }
}
</style>
