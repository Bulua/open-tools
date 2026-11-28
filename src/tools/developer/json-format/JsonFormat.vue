<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronsDownUp, ChevronsUpDown, CircleAlert, CircleCheck, Info, Plus } from "lucide-vue-next";
import EmptyState from "@/components/common/EmptyState.vue";
import SplitPane from "@/components/common/SplitPane.vue";
import TextPane from "@/components/common/TextPane.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useToolResult } from "@/composables/useToolUsage";
import DevHistoryList, { type DevHistoryItem } from "../shared/components/DevHistoryList.vue";
import { MAX_HISTORY, createHistoryId, formatHistoryTime, loadHistory, previewLine, saveHistory } from "../shared/history";
import { describeError, editorErrorOf, formatJson, minifyJson, parseJson, sortKeys, type Indent } from "../shared/json";
import JsonTreeView from "./components/JsonTreeView.vue";

interface JsonFormatRecord {
  id: string;
  input: string;
  mode: "format" | "minify";
  view: "code" | "tree";
  indent: Indent;
  sort: boolean;
  updatedAt: number;
}

const STORAGE_KEY = "json-format.records";
const PREVIEW_LIMIT = 120_000;
const EXAMPLE = '{"name":"Open Tools"}';
const { t, locale } = useI18n();

const input = ref("");
const view = useStoredRef<"code" | "tree">("json-format.view", "code");
const mode = useStoredRef<"format" | "minify">("json-format.mode", "format");
const indent = useStoredRef<Indent>("json-format.indent", 2);
const sort = useStoredRef("json-format.sort", false);
const transitionTick = ref(0);

const inputPane = ref<InstanceType<typeof TextPane>>();
const treeView = ref<InstanceType<typeof JsonTreeView>>();

const result = computed(() => (input.value.trim() ? parseJson(input.value) : null));

const output = computed(() => {
  const r = result.value;
  if (!r?.ok) return "";
  return mode.value === "format" ? formatJson(r.value, indent.value, sort.value) : minifyJson(r.value, sort.value);
});

const isTruncated = computed(() => view.value === "code" && output.value.length > PREVIEW_LIMIT);
const displayOutput = computed(() =>
  isTruncated.value ? `${output.value.slice(0, PREVIEW_LIMIT)}\n…` : output.value,
);

const treeValue = computed(() => {
  const r = result.value;
  if (!r?.ok) return null;
  return sort.value ? sortKeys(r.value) : r.value;
});

const indentOptions = computed<{ label: string; value: Indent }[]>(() => [
  { label: t("json.spaces", { n: 2 }), value: 2 },
  { label: t("json.spaces", { n: 4 }), value: 4 },
  { label: "Tab", value: "tab" },
]);

const locate = () => {
  const r = result.value;
  if (r && !r.ok && r.position !== undefined) inputPane.value?.focusAt(r.position);
};

// ---------- 历史记录 ----------

const records = ref<JsonFormatRecord[]>(loadHistory<JsonFormatRecord>(STORAGE_KEY));
const activeId = ref<string | null>(null);
let restoring = false;
let recordTimer: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => clearTimeout(recordTimer));

const persist = () =>
  saveHistory(STORAGE_KEY, records.value, MAX_HISTORY, 120_000, (r) => r.input.length);

watch([input, () => result.value?.ok, mode, view, indent, sort], () => {
  if (restoring) return;
  clearTimeout(recordTimer);
  if (!input.value.trim() || !result.value?.ok) return;
  recordTimer = setTimeout(() => {
    const now = Date.now();
    const idx = activeId.value ? records.value.findIndex((r) => r.id === activeId.value) : -1;
    if (idx >= 0) {
      records.value[idx] = {
        ...records.value[idx],
        input: input.value,
        mode: mode.value,
        view: view.value,
        indent: indent.value,
        sort: sort.value,
        updatedAt: now,
      };
      persist();
      return;
    }
    const created: JsonFormatRecord = {
      id: createHistoryId(),
      input: input.value,
      mode: mode.value,
      view: view.value,
      indent: indent.value,
      sort: sort.value,
      updatedAt: now,
    };
    records.value = [created, ...records.value].slice(0, MAX_HISTORY);
    activeId.value = created.id;
    persist();
  }, 500);
});

const historyItems = computed<DevHistoryItem[]>(() =>
  records.value.map((r) => ({
    id: r.id,
    tag: `${t(`json.${r.mode}`)} · ${t(`json.${r.view}`)}`,
    tone: r.mode === "format" ? "accent" : "muted",
    time: formatHistoryTime(r.updatedAt, locale.value),
    title: previewLine(r.input, 48),
    subtitle: t("dev.chars", { n: r.input.length.toLocaleString() }),
  })),
);

const startNew = () => {
  clearTimeout(recordTimer);
  activeId.value = null;
  input.value = "";
  transitionTick.value++;
};

const selectRecord = async (id: string) => {
  const row = records.value.find((r) => r.id === id);
  if (!row || activeId.value === id) return;
  clearTimeout(recordTimer);
  restoring = true;
  activeId.value = row.id;
  mode.value = row.mode;
  view.value = row.view;
  indent.value = row.indent;
  sort.value = row.sort;
  input.value = row.input;
  transitionTick.value++;
  await nextTick();
  restoring = false;
};

const removeRecord = (id: string) => {
  records.value = records.value.filter((r) => r.id !== id);
  if (activeId.value === id) activeId.value = null;
  persist();
};

const clearRecords = () => {
  records.value = [];
  activeId.value = null;
  persist();
};

useToolResult(() => (output.value ? `${mode.value}:${input.value.length}` : ""));
</script>

<template>
  <div class="workbench">
    <aside class="card sidebar">
      <section class="section">
        <h3>{{ t("dev.mode") }}</h3>
        <div class="seg fill">
          <button type="button" :class="{ on: mode === 'format' }" @click="mode = 'format'">{{ t("json.format") }}</button>
          <button type="button" :class="{ on: mode === 'minify' }" @click="mode = 'minify'">{{ t("json.minify") }}</button>
        </div>

        <h3>{{ t("dev.view") }}</h3>
        <div class="seg fill">
          <button type="button" :class="{ on: view === 'code' }" @click="view = 'code'">{{ t("json.code") }}</button>
          <button type="button" :class="{ on: view === 'tree' }" @click="view = 'tree'">{{ t("json.tree") }}</button>
        </div>
      </section>

      <section class="section">
        <Transition name="panel-swap" mode="out-in">
          <div :key="`${view}:${mode}`" class="option-group">
            <template v-if="view === 'code' && mode === 'format'">
              <h3>{{ t("dev.indent") }}</h3>
              <div class="seg fill">
                <button v-for="o in indentOptions" :key="o.value" type="button" :class="{ on: indent === o.value }" @click="indent = o.value">
                  {{ o.label }}
                </button>
              </div>
            </template>

            <div class="switch-row">
              <span>{{ t("json.sortKeys") }}</span>
              <button
                type="button"
                class="control-switch"
                role="switch"
                :aria-checked="sort"
                :aria-label="t('json.sortKeys')"
                @click="sort = !sort"
              >
                <span />
              </button>
            </div>

            <div v-if="view === 'tree'" class="action-grid">
              <button type="button" class="btn small" :disabled="treeValue === null" @click="treeView?.expandAll()">
                <ChevronsUpDown :size="13" />{{ t("json.expandAll") }}
              </button>
              <button type="button" class="btn small" :disabled="treeValue === null" @click="treeView?.collapseAll()">
                <ChevronsDownUp :size="13" />{{ t("json.collapseAll") }}
              </button>
            </div>

            <button type="button" class="btn small full" :disabled="!input && !activeId" @click="startNew">
              <Plus :size="13" />{{ t("dev.newEntry") }}
            </button>
          </div>
        </Transition>
      </section>

      <DevHistoryList :items="historyItems" :active-id="activeId" @select="selectRecord" @remove="removeRecord" @clear="clearRecords" />
    </aside>

    <main class="stage">
      <Transition name="stage-swap" mode="out-in">
        <div :key="transitionTick" class="stage-inner">
          <SplitPane storage-key="json-format" :default-ratio="0.42" :min="220">
            <template #left>
              <TextPane
                ref="inputPane"
                v-model="input"
                copyable
                :label="t('json.input')"
                language="json"
                :code-error="editorErrorOf(result)"
                :placeholder="t('json.inputPlaceholder', { example: EXAMPLE })"
              >
                <template #actions>
                  <span v-if="result?.ok" class="status ok"><CircleCheck :size="13" />{{ t("json.valid") }}</span>
                  <button v-else-if="result" class="status bad" :title="t('json.jumpToError')" @click="locate">
                    <CircleAlert :size="13" />{{ result.line ? t("json.errorLine", { line: result.line }) : t("json.invalid") }}
                  </button>
                </template>
              </TextPane>
            </template>

            <template #right>
              <div class="output-side">
                <TextPane
                  :model-value="displayOutput"
                  :copy-text="output"
                  class="output"
                  :label="t('json.result')"
                  readonly
                  language="json"
                  :placeholder="t('json.resultPlaceholder')"
                >
                  <template #actions>
                    <span v-if="output" class="count-pill">{{ t("dev.chars", { n: output.length.toLocaleString() }) }}</span>
                  </template>

                  <template v-if="result && !result.ok" #body>
                    <div class="error-wrap">
                      <div class="error-card" role="alert">
                        <div class="error-text">
                          <CircleAlert :size="16" class="error-icon" />
                          <p>{{ describeError(result) }}</p>
                        </div>
                        <button v-if="result.position !== undefined" type="button" class="btn small" @click="locate">
                          {{ t("json.locateError") }}
                        </button>
                      </div>
                    </div>
                  </template>
                  <template v-else-if="view === 'tree'" #body>
                    <JsonTreeView v-if="treeValue !== null" ref="treeView" :value="treeValue" />
                    <EmptyState v-else :title="t('json.treeEmptyTitle')" :description="t('json.treeEmptyDesc')" />
                  </template>
                </TextPane>
                <p v-if="isTruncated" class="truncate-notice">
                  <Info :size="13" />
                  <span>{{ t("dev.previewTruncated", { n: PREVIEW_LIMIT.toLocaleString() }) }}</span>
                </p>
              </div>
            </template>
          </SplitPane>
        </div>
      </Transition>
    </main>
  </div>
</template>

<style scoped>
.workbench {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.sidebar {
  flex: 0 0 296px;
  min-height: 0;
  box-shadow: var(--shadow-sm);
}
.sidebar h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.option-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 0;
  font-size: 13px;
  color: var(--text);
}
.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.action-grid .btn {
  justify-content: center;
}
.stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.stage-inner {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
}
.output-side {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.output {
  flex: 1;
  border: none;
  border-radius: 0;
  box-shadow: none;
}
.count-pill {
  margin-right: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--active);
  color: var(--text-2);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-right: 4px;
  padding: 2px 9px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.status.ok {
  color: var(--success);
  background: var(--success-soft);
  border-color: color-mix(in srgb, var(--success) 24%, transparent);
}
.status.bad {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: color-mix(in srgb, var(--danger) 28%, transparent);
}
.status.bad:hover {
  background: color-mix(in srgb, var(--danger) 16%, transparent);
  border-color: color-mix(in srgb, var(--danger) 42%, transparent);
}
.error-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.error-card {
  width: 100%;
  max-width: 440px;
  padding: 18px 20px;
  border: 1px solid color-mix(in srgb, var(--danger) 26%, transparent);
  border-radius: var(--radius);
  background: var(--danger-soft);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.error-text {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.error-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--danger);
}
.error-card p {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
  line-height: 1.6;
}
.truncate-notice {
  flex-shrink: 0;
  margin: 0;
  padding: 6px 12px;
  border-top: 1px solid var(--border);
  background: var(--bg-sunken);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-3);
}
.stage-swap-enter-active,
.panel-swap-enter-active {
  transition: opacity var(--dur) var(--ease-out), translate var(--dur) var(--ease-out);
}
.stage-swap-leave-active,
.panel-swap-leave-active {
  transition: opacity var(--dur-fast) ease-in, translate var(--dur-fast) ease-in;
}
.stage-swap-enter-from,
.panel-swap-enter-from {
  opacity: 0;
  translate: 0 5px;
}
.stage-swap-leave-to,
.panel-swap-leave-to {
  opacity: 0;
  translate: 0 -4px;
}
@media (max-width: 860px) {
  .workbench {
    flex: none;
    width: 100%;
    flex-direction: column;
  }
  .sidebar {
    flex: none;
  }
}
</style>
