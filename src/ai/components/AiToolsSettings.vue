<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Search, X } from "lucide-vue-next";
import type { AiBuiltinToolInfo, ToolApprovalPolicy } from "@/types/ai";
import { useAiStore } from "../store";

type ToolGroupKey = "workspace" | "shell" | "notebook" | "image" | "mcp" | "utility" | "other";

const GROUP_ORDER: ToolGroupKey[] = [
  "workspace",
  "shell",
  "notebook",
  "image",
  "mcp",
  "utility",
  "other",
];

const WORKSPACE_TOOLS = new Set(["list_dir", "read_file", "write_file", "edit_file"]);
const SHELL_TOOLS = new Set(["run_command"]);
const UTILITY_TOOLS = new Set([
  "parse_id_card",
  "clock_list",
  "clock_set_alarm",
  "clock_start_timer",
  "clock_manage",
  "calculate",
]);

const { t, te } = useI18n();
const {
  config,
  builtinTools,
  enabledBuiltinToolsCount,
  setBuiltinToolEnabled,
  setAllBuiltinToolsEnabled,
} = useAiStore();

const query = ref("");

const disabledSet = computed(() => new Set(config.value.disabledBuiltinTools));

function isToolEnabled(name: string): boolean {
  return !disabledSet.value.has(name);
}

function groupOf(name: string): ToolGroupKey {
  if (WORKSPACE_TOOLS.has(name)) return "workspace";
  if (SHELL_TOOLS.has(name)) return "shell";
  if (name.startsWith("notebook_")) return "notebook";
  if (name.startsWith("image_")) return "image";
  if (name.startsWith("mcp_")) return "mcp";
  if (UTILITY_TOOLS.has(name)) return "utility";
  return "other";
}

function toolTitle(tool: AiBuiltinToolInfo): string {
  const key = `ai.settingsModal.builtinTools.${tool.name}.name`;
  return te(key) ? t(key) : tool.name;
}

function toolDesc(tool: AiBuiltinToolInfo): string {
  const key = `ai.settingsModal.builtinTools.${tool.name}.desc`;
  return te(key) ? t(key) : tool.description;
}

function approvalLabel(policy: ToolApprovalPolicy): string {
  switch (policy) {
    case "auto":
      return t("ai.settingsModal.toolApprovalAuto");
    case "externalWrite":
      return t("ai.settingsModal.toolApprovalExternalWrite");
    case "command":
      return t("ai.settingsModal.toolApprovalCommand");
  }
}

const groupedTools = computed(() => {
  const needle = query.value.trim().toLowerCase();
  const buckets = new Map<ToolGroupKey, AiBuiltinToolInfo[]>();
  for (const key of GROUP_ORDER) {
    buckets.set(key, []);
  }

  for (const tool of builtinTools.value) {
    const title = toolTitle(tool);
    const desc = toolDesc(tool);
    if (needle) {
      const hay = `${tool.name} ${title} ${desc} ${tool.description}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    buckets.get(groupOf(tool.name))!.push(tool);
  }

  return GROUP_ORDER.map((key) => {
    const items = buckets.get(key)!;
    const enabledCount = items.filter((item) => isToolEnabled(item.name)).length;
    return {
      key,
      label: t(`ai.settingsModal.toolGroups.${key}`),
      items,
      enabledCount,
    };
  }).filter((group) => group.items.length > 0);
});

const allEnabled = computed(
  () => builtinTools.value.length > 0 && enabledBuiltinToolsCount.value === builtinTools.value.length,
);
const noneEnabled = computed(() => enabledBuiltinToolsCount.value === 0);
</script>

<template>
  <div class="panel-wrap">
    <div class="panel-header">
      <div>
        <h3>{{ t("ai.settingsModal.tabTools") }}</h3>
        <p class="tip">{{ t("ai.settingsModal.toolsDesc") }}</p>
      </div>
      <div v-if="builtinTools.length" class="head-actions">
        <button
          type="button"
          class="btn small"
          :disabled="allEnabled"
          @click="setAllBuiltinToolsEnabled(true)"
        >
          {{ t("ai.settingsModal.toolsEnableAll") }}
        </button>
        <button
          type="button"
          class="btn small"
          :disabled="noneEnabled"
          @click="setAllBuiltinToolsEnabled(false)"
        >
          {{ t("ai.settingsModal.toolsDisableAll") }}
        </button>
      </div>
    </div>

    <div v-if="builtinTools.length" class="tools-toolbar">
      <div class="search-wrap">
        <Search :size="14" class="search-icon" />
        <input
          v-model="query"
          type="text"
          class="field search-field"
          :placeholder="t('ai.settingsModal.toolsSearchPlaceholder')"
        />
        <button
          v-if="query"
          type="button"
          class="field-clear"
          :title="t('ai.settingsModal.close')"
          :aria-label="t('ai.settingsModal.close')"
          @click="query = ''"
        >
          <X :size="13" />
        </button>
      </div>
      <span class="tools-summary">
        {{
          t("ai.settingsModal.toolsEnabledCount", {
            enabled: enabledBuiltinToolsCount,
            total: builtinTools.length,
          })
        }}
      </span>
    </div>

    <div v-if="groupedTools.length" class="group-list">
      <section v-for="group in groupedTools" :key="group.key" class="tool-group">
        <div class="group-head">
          <span class="group-title">{{ group.label }}</span>
          <span class="group-count">{{ group.enabledCount }} / {{ group.items.length }}</span>
        </div>

        <div class="item-list">
          <article
            v-for="tool in group.items"
            :key="tool.name"
            class="tool-card"
            :class="{ disabled: !isToolEnabled(tool.name) }"
          >
            <div class="tool-main">
              <div class="tool-title-row">
                <strong class="tool-title">{{ toolTitle(tool) }}</strong>
                <span class="badge mono">{{ tool.name }}</span>
                <span class="badge" :class="tool.approval === 'auto' ? 'ok' : 'warn'">
                  {{ approvalLabel(tool.approval) }}
                </span>
              </div>
              <p class="tool-desc">{{ toolDesc(tool) }}</p>
            </div>

            <button
              type="button"
              role="switch"
              class="control-switch"
              :aria-checked="isToolEnabled(tool.name)"
              :aria-label="toolTitle(tool)"
              @click="setBuiltinToolEnabled(tool.name, !isToolEnabled(tool.name))"
            >
              <span />
            </button>
          </article>
        </div>
      </section>
    </div>

    <div v-else class="empty-box">
      <p>{{ builtinTools.length ? t("ai.settingsModal.toolsNoMatch") : t("ai.settingsModal.toolsEmpty") }}</p>
    </div>
  </div>
</template>

<style scoped>
.panel-wrap {
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
.tip {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-3);
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.tools-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.search-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  max-width: 340px;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-3);
  pointer-events: none;
}
.search-field {
  padding-left: 30px;
  padding-right: 30px;
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
.tools-summary {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.tool-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}
.group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}
.group-count {
  font-size: 11.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tool-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 11px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  transition: opacity var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.tool-card.disabled {
  opacity: 0.65;
}
.tool-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tool-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.tool-title {
  font-size: 13.5px;
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
.badge.mono {
  font-family: var(--font-mono);
}
.badge.ok {
  background: var(--success-soft);
  color: var(--success);
}
.badge.warn {
  background: var(--warning-soft);
  color: var(--warning);
}
.tool-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

.empty-box {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  background: var(--bg);
}
.empty-box p {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
}
</style>
