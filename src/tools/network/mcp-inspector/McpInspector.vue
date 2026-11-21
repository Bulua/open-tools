<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, ChevronRight, Pencil, Plug, Plus, RefreshCw, Search, Wrench } from "lucide-vue-next";
import { computed, nextTick, onActivated, onDeactivated, ref, shallowReactive } from "vue";
import { useI18n } from "vue-i18n";
import { recordToolUsage } from "@/composables/toolLibrary";
import { errorMessage, showError } from "@/utils/errorToast";
import McpConnectionDialog from "./components/McpConnectionDialog.vue";
import McpSchemaDetails from "./components/McpSchemaDetails.vue";
import McpToolDetail from "./components/McpToolDetail.vue";
import { connectionTarget, type McpConfig, type McpToolList } from "./config";
import { connections, type McpConnection } from "./workspace";

type LoadState = { pending: true } | { result: McpToolList } | { failure: string };
const { t } = useI18n();
const dialog = ref<InstanceType<typeof McpConnectionDialog>>();
const heading = ref<HTMLElement>();
const selectedId = ref("");
const selectedToolName = ref("");
const filter = ref("");
const direction = ref<"forward" | "back">();
const states = shallowReactive(new WeakMap<McpConnection, LoadState>());
const connection = computed(() => connections.value.find((item) => item.id === selectedId.value));
const state = computed(() => connection.value && states.get(connection.value));
const result = computed(() => state.value && "result" in state.value ? state.value.result : undefined);
const failure = computed(() => state.value && "failure" in state.value ? state.value.failure : "");
const loading = computed(() => Boolean(state.value && "pending" in state.value));
const selectedTool = computed(() => result.value?.tools.find((tool) => tool.name === selectedToolName.value));
const toolDescription = computed(() => selectedTool.value?.description?.replace(/`+/g, "").replace(/\s+/g, " ").trim());
const pageKey = computed(() => JSON.stringify([selectedId.value, selectedTool.value?.name]));
const pageTitle = computed(() => {
  const tool = selectedTool.value;
  if (tool) return tool.title || tool.name;
  return connection.value?.name ?? t("network.mcp.connections");
});
const backLabel = computed(() => selectedTool.value
  ? t("network.mcp.backToTools", { name: connection.value?.name })
  : t("network.mcp.connections"));
const visibleTools = computed(() => {
  const query = filter.value.trim().toLowerCase();
  return (result.value?.tools ?? []).filter((tool) =>
    [tool.name, tool.title, tool.description].some((text) => text?.toLowerCase().includes(query)),
  );
});

const transportLabels: Record<McpConfig["type"], string> = {
  stdio: "stdio",
  http: "Streamable HTTP",
};

let active = true;
onActivated(() => { active = true; });
onDeactivated(() => { active = false; });

function focusPage() {
  void nextTick(() => heading.value?.focus({ preventScroll: true }));
}

function openConnection(item: McpConnection) {
  direction.value = "forward";
  selectedId.value = item.id;
  selectedToolName.value = "";
  filter.value = "";
  const cached = states.get(item);
  if (!cached || "failure" in cached) void loadTools(item);
  focusPage();
}

function openTool(name: string) {
  direction.value = "forward";
  selectedToolName.value = name;
  focusPage();
}

function back() {
  direction.value = "back";
  if (selectedTool.value) {
    selectedToolName.value = "";
  } else {
    selectedId.value = "";
    filter.value = "";
  }
  focusPage();
}

function saveConnection(connection: McpConnection) {
  const existing = connections.value.some((item) => item.id === connection.id);
  connections.value = existing
    ? connections.value.map((item) => item.id === connection.id ? connection : item)
    : [...connections.value, connection];
  if (connection.id === selectedId.value) {
    selectedToolName.value = "";
    filter.value = "";
    // 编辑只保存配置，由用户手动重新连接。
  }
}

function removeConnection(id: string) {
  connections.value = connections.value.filter((item) => item.id !== id);
  if (selectedId.value === id) {
    direction.value = "back";
    selectedId.value = "";
    selectedToolName.value = "";
    focusPage();
  }
}

async function loadTools(item: McpConnection) {
  const current = states.get(item);
  if (current && "pending" in current) return;
  states.set(item, { pending: true });
  try {
    const response = await invoke<McpToolList>("mcp_list_tools", { config: item.config });
    states.set(item, { result: response });
    recordToolUsage();
  } catch (error) {
    states.set(item, { failure: errorMessage(error) });
    if (active && connection.value === item) showError(error, t("network.mcp.failed"));
  }
}
</script>

<template>
  <section class="card mcp-workspace">
    <header class="mcp-header" :class="{ 'tool-header': selectedTool }">
      <button v-if="connection" type="button" class="btn subtle small back" :title="backLabel" @click="back">
        <ArrowLeft :size="15" aria-hidden="true" />
        <span>{{ backLabel }}</span>
      </button>
      <div class="header-info">
        <h2 ref="heading" class="page-title" tabindex="-1">
          <span class="title-name" :title="selectedTool?.name ?? pageTitle">{{ pageTitle }}</span>
          <span v-if="result && !selectedTool" class="tool-count" :title="t('network.mcp.count', { count: result.tools.length })">
            ({{ result.tools.length }})
          </span>
        </h2>
        <p v-if="toolDescription" class="tool-description-line" :title="toolDescription">
          {{ toolDescription }}
        </p>
      </div>
      <div v-if="selectedTool" :key="selectedTool.name" class="schema-actions">
        <McpSchemaDetails
          :label="t('network.mcp.inputSchema')"
          :button-label="t('network.mcp.inputSchemaAction')"
          :schema="selectedTool.inputSchema"
        />
        <McpSchemaDetails
          v-if="selectedTool.outputSchema"
          :label="t('network.mcp.outputSchema')"
          :button-label="t('network.mcp.outputSchemaAction')"
          :schema="selectedTool.outputSchema"
        />
      </div>
    </header>

    <div class="mcp-stage">
      <div :key="pageKey" class="mcp-content" :class="[direction && 'mcp-' + direction, { 'detail-content': selectedTool }]">
        <template v-if="!connection">
          <ul class="connection-grid">
            <li v-for="item in connections" :key="item.id" class="connection-card">
              <button type="button" class="connection-open" @click="openConnection(item)">
                <span class="connection-transport">
                  <Plug :size="16" aria-hidden="true" />
                  {{ transportLabels[item.config.type] }}
                </span>
                <strong class="connection-name">{{ item.name }}</strong>
                <span class="connection-endpoint">
                  <small class="target">{{ connectionTarget(item.config) }}</small>
                  <ChevronRight :size="16" aria-hidden="true" />
                </span>
              </button>
              <button
                type="button"
                class="icon-btn edit-card"
                :title="t('network.mcp.editNamed', { name: item.name })"
                :aria-label="t('network.mcp.editNamed', { name: item.name })"
                @click="dialog?.open(item)"
              >
                <Pencil :size="15" aria-hidden="true" />
              </button>
            </li>
            <li>
              <button type="button" class="connection-add" @click="dialog?.open()">
                <Plus :size="28" :stroke-width="1.5" aria-hidden="true" />
                {{ t("network.mcp.add") }}
              </button>
            </li>
          </ul>
        </template>

        <template v-else>
          <McpToolDetail v-if="selectedTool" :tool="selectedTool" :config="connection.config" />

          <template v-else>
            <header class="page-heading">
              <p class="meta">
                <span>{{ transportLabels[connection.config.type] }}</span>
                <span class="target">{{ connectionTarget(connection.config) }}</span>
                <span v-if="result?.serverInfo">{{ result.serverInfo.name }} {{ result.serverInfo.version }}</span>
                <span v-if="result">{{ t("network.mcp.protocol", { version: result.protocolVersion }) }}</span>
              </p>
              <div class="heading-actions">
                <label v-if="result?.tools.length" class="search">
                  <Search :size="15" aria-hidden="true" />
                  <input
                    v-model="filter"
                    class="field line-field"
                    type="search"
                    :placeholder="t('network.mcp.filter')"
                    :aria-label="t('network.mcp.filter')"
                  />
                </label>
                <button type="button" class="btn" @click="dialog?.open(connection)">
                  <Pencil :size="14" aria-hidden="true" />
                  {{ t("network.mcp.edit") }}
                </button>
                <button type="button" class="btn" :disabled="loading" @click="loadTools(connection)">
                  <RefreshCw :size="14" aria-hidden="true" />
                  {{ t(result ? "network.mcp.refresh" : "network.mcp.load") }}
                </button>
              </div>
            </header>
            <p v-if="loading" class="state" role="status">{{ t("network.mcp.loading") }}</p>
            <p v-else-if="failure" class="state error" role="alert">{{ failure }}</p>
            <template v-else-if="result">
              <ul v-if="visibleTools.length" class="card-grid">
                <li v-for="tool in visibleTools" :key="tool.name">
                  <button type="button" class="card-button tool-card" @click="openTool(tool.name)">
                    <span class="card-icon"><Wrench :size="16" aria-hidden="true" /></span>
                    <span class="card-body">
                      <strong>{{ tool.title || tool.name }}</strong>
                      <code v-if="tool.title && tool.title !== tool.name">{{ tool.name }}</code>
                      <small v-if="tool.description" class="tool-description">{{ tool.description }}</small>
                    </span>
                    <ChevronRight class="card-chevron" :size="16" aria-hidden="true" />
                  </button>
                </li>
              </ul>
              <p v-else class="state">{{ t(result.tools.length ? "network.mcp.noMatches" : "network.mcp.empty") }}</p>
            </template>
            <p v-else class="state">{{ t("network.mcp.connectPrompt") }}</p>
          </template>
        </template>
      </div>
    </div>
    <McpConnectionDialog ref="dialog" @save="saveConnection" @remove="removeConnection" />
  </section>
</template>

<style scoped>
.mcp-workspace { flex: 1; min-width: 0; min-height: 0; container-type: inline-size; }
.mcp-header {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr);
  align-items: center;
  min-height: 60px;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
}
.header-info {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
}
.page-title {
  display: flex;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}
.tool-header { grid-template-columns: minmax(110px, auto) minmax(0, 1fr) auto; }
.tool-header .page-title { justify-content: flex-start; font: 600 16px/1.35 var(--font-mono); }
.tool-description-line {
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.schema-actions { grid-area: 1 / 3; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.title-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tool-count { flex: none; color: var(--text-2); }
.page-title:focus { outline: none; }
.back {
  grid-column: 1;
  grid-row: 1;
  justify-self: start;
  min-width: 0;
  max-width: 100%;
  margin-inline-start: -8px;
}
.back svg { flex: none; }
.back span { overflow: hidden; text-overflow: ellipsis; }
.tool-header .back { max-width: min(100%, 220px); }
.mcp-stage { display: flex; flex: 1; min-height: 0; overflow: clip; }
.mcp-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 16px;
  overflow: auto;
  padding: 20px;
  background: var(--surface);
}
.detail-content { padding: 12px 16px 16px; }
@container (max-width: 760px) {
  .tool-header { grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; }
  .tool-header .header-info { grid-area: 2 / 1 / 3 / -1; }
  .schema-actions { grid-area: 1 / 2; justify-content: flex-end; }
}
.page-heading, .heading-actions, .meta, .search {
  display: flex;
  align-items: center;
  gap: 8px 12px;
}
.page-heading { justify-content: space-between; flex-wrap: wrap; }
.heading-actions, .meta { flex-wrap: wrap; }
.heading-actions { min-width: 0; }
.meta { flex: 1 1 220px; min-width: 0; margin: 0; overflow-wrap: anywhere; }
.meta, .state { color: var(--text-2); font-size: 13px; }
.target, code { font-family: var(--font-mono); overflow-wrap: anywhere; }
.state {
  margin: 0;
  padding: 20px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  overflow-wrap: anywhere;
}
.error { color: var(--danger); }
.search { width: 220px; max-width: 100%; gap: 8px; }
.search svg { flex: none; }
.card-grid, .connection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.connection-grid {
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
  gap: 16px;
}
.connection-card {
  position: relative;
  min-width: 0;
}
.connection-open, .connection-add {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 148px;
  padding: 18px 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  text-align: start;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.connection-open:hover { border-color: var(--border-strong); background: var(--bg-sunken); }
.connection-transport, .connection-endpoint { display: flex; align-items: center; gap: 8px; min-width: 0; }
.connection-transport { padding-inline-end: 30px; color: var(--accent); font-size: 12px; }
.connection-transport svg, .connection-endpoint svg { flex: none; }
.connection-name { margin: 12px 0 12px; color: var(--text); font-size: 19px; font-weight: 500; overflow-wrap: anywhere; }
.connection-endpoint { justify-content: space-between; margin-top: auto; color: var(--text-2); font-size: 13px; }
.connection-endpoint small { font-size: 12px; }
.connection-endpoint svg { color: var(--text-3); }
.connection-add { align-items: center; justify-content: center; gap: 10px; border-style: dashed; color: var(--text-2); font-size: 13px; }
.connection-add:hover { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.edit-card { position: absolute; inset-block-start: 12px; inset-inline-end: 12px; }
.connection-open:focus-visible, .connection-add:focus-visible, .edit-card:focus-visible, .back:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.card-button {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  min-width: 0;
  min-height: 86px;
  padding: 12px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  text-align: start;
  color: var(--text);
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.card-button:hover { background: var(--hover); }
.card-button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tool-card { height: 100%; border: 1px solid var(--border); background: var(--surface); }
.tool-card:hover { border-color: var(--border-strong); }
.card-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
}
.card-body { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; overflow-wrap: anywhere; }
.card-body strong { font-size: 14px; line-height: 1.35; }
.card-body small, .card-body code { color: var(--text-2); font-size: 12px; }
.card-chevron { flex: none; align-self: center; color: var(--text-3); }
.tool-description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.45;
}

/* 只滑入新页，避免详情卸载编辑器时短暂露出空白面板。 */
.mcp-forward { --page-offset: 22px; }
.mcp-back { --page-offset: -22px; }
.mcp-forward, .mcp-back {
  animation: mcp-page-slide var(--dur-slow) var(--ease-out);
}
@keyframes mcp-page-slide {
  from { transform: translateX(var(--page-offset)); }
}
@container (max-width: 650px) {
  .mcp-content { padding: 16px; }
  .mcp-header { padding-inline: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .mcp-forward, .mcp-back { animation: none; }
}
</style>
