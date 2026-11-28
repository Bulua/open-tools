<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowLeftRight, Check, CircleAlert, CircleCheck, Copy, GitCompareArrows, Plus } from "lucide-vue-next";
import SplitPane from "@/components/common/SplitPane.vue";
import TextPane from "@/components/common/TextPane.vue";
import { useClipboard } from "@/composables/useClipboard";
import { useToolResult } from "@/composables/useToolUsage";
import DevHistoryList, { type DevHistoryItem } from "../shared/components/DevHistoryList.vue";
import { MAX_HISTORY, createHistoryId, formatHistoryTime, loadHistory, previewLine, saveHistory } from "../shared/history";
import { describeError, editorErrorOf, parseJson, type ParseResult } from "../shared/json";
import { diffJson, preview, type DiffKind } from "./diff";

type FilterKind = "all" | DiffKind;

interface JsonDiffRecord {
  id: string;
  left: string;
  right: string;
  diffCount: number;
  updatedAt: number;
}

const STORAGE_KEY = "json-diff.records";
const { t, locale } = useI18n();

const left = ref("");
const right = ref("");
const filter = ref<FilterKind>("all");
const transitionTick = ref(0);
const leftPane = ref<InstanceType<typeof TextPane>>();
const rightPane = ref<InstanceType<typeof TextPane>>();

const parse = (text: string) => (text.trim() ? parseJson(text) : null);
const leftResult = computed(() => parse(left.value));
const rightResult = computed(() => parse(right.value));

const locate = (pane: InstanceType<typeof TextPane> | undefined, r: ParseResult | null) => {
  if (r && !r.ok && r.position !== undefined) pane?.focusAt(r.position);
};

const errorOf = (r: ParseResult | null, side: "leftSide" | "rightSide") => (r && !r.ok ? t(`json.${side}`, { error: describeError(r) }) : "");

const error = computed(() =>
  [errorOf(leftResult.value, "leftSide"), errorOf(rightResult.value, "rightSide")].filter(Boolean).join("\n"),
);

const diffs = computed(() => {
  const a = leftResult.value;
  const b = rightResult.value;
  return a?.ok && b?.ok ? diffJson(a.value, b.value) : null;
});

const count = (kind: DiffKind) => diffs.value?.filter((d) => d.kind === kind).length ?? 0;

const filteredDiffs = computed(() => {
  if (!diffs.value) return null;
  return filter.value === "all" ? diffs.value : diffs.value.filter((d) => d.kind === filter.value);
});

const FILTER_OPTIONS: { id: FilterKind; labelKey: string }[] = [
  { id: "all", labelKey: "dev.all" },
  { id: "added", labelKey: "json.added" },
  { id: "removed", labelKey: "json.removed" },
  { id: "changed", labelKey: "json.changed" },
];

const filterCount = (id: FilterKind) => {
  if (!diffs.value) return null;
  return id === "all" ? diffs.value.length : count(id);
};

const { copy } = useClipboard();
const copiedKey = ref<string | null>(null);
const onCopyPath = async (key: string, path: string) => {
  await copy(path);
  copiedKey.value = key;
  setTimeout(() => {
    if (copiedKey.value === key) copiedKey.value = null;
  }, 1200);
};

// ---------- 历史记录 ----------

const records = ref<JsonDiffRecord[]>(loadHistory<JsonDiffRecord>(STORAGE_KEY));
const activeId = ref<string | null>(null);
let restoring = false;
let recordTimer: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => clearTimeout(recordTimer));

const persist = () =>
  saveHistory(STORAGE_KEY, records.value, MAX_HISTORY, 120_000, (r) => r.left.length + r.right.length);

watch([left, right, diffs], () => {
  if (restoring) return;
  clearTimeout(recordTimer);
  if (!diffs.value) return;
  const total = diffs.value.length;
  recordTimer = setTimeout(() => {
    const now = Date.now();
    const idx = activeId.value ? records.value.findIndex((r) => r.id === activeId.value) : -1;
    if (idx >= 0) {
      records.value[idx] = { ...records.value[idx], left: left.value, right: right.value, diffCount: total, updatedAt: now };
      persist();
      return;
    }
    const created: JsonDiffRecord = {
      id: createHistoryId(),
      left: left.value,
      right: right.value,
      diffCount: total,
      updatedAt: now,
    };
    records.value = [created, ...records.value].slice(0, MAX_HISTORY);
    activeId.value = created.id;
    persist();
  }, 550);
});

const historyItems = computed<DevHistoryItem[]>(() =>
  records.value.map((r) => ({
    id: r.id,
    tag: r.diffCount === 0 ? t("dev.noDiff") : t("dev.diffCount", { n: r.diffCount }),
    tone: r.diffCount === 0 ? "success" : "warning",
    time: formatHistoryTime(r.updatedAt, locale.value),
    title: previewLine(r.left, 46),
    subtitle: previewLine(r.right, 52),
  })),
);

const swapSides = () => {
  if (!left.value && !right.value) return;
  clearTimeout(recordTimer);
  activeId.value = null;
  [left.value, right.value] = [right.value, left.value];
  transitionTick.value++;
};

const startNew = () => {
  clearTimeout(recordTimer);
  activeId.value = null;
  left.value = "";
  right.value = "";
  filter.value = "all";
  transitionTick.value++;
};

const selectRecord = async (id: string) => {
  const row = records.value.find((r) => r.id === id);
  if (!row || activeId.value === id) return;
  clearTimeout(recordTimer);
  restoring = true;
  activeId.value = row.id;
  left.value = row.left;
  right.value = row.right;
  filter.value = "all";
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

useToolResult(() => (diffs.value ? `${diffs.value.length}:${left.value.length}:${right.value.length}` : ""));
</script>

<template>
  <div class="workbench">
    <aside class="card sidebar">
      <section class="section">
        <h3>{{ t("dev.filter") }}</h3>
        <div class="filter-grid">
          <button
            v-for="opt in FILTER_OPTIONS"
            :key="opt.id"
            type="button"
            class="filter-pill"
            :class="[opt.id, { on: filter === opt.id }]"
            @click="filter = opt.id"
          >
            <span>{{ t(opt.labelKey) }}</span>
            <em v-if="filterCount(opt.id) !== null">{{ filterCount(opt.id) }}</em>
          </button>
        </div>
      </section>

      <section class="section">
        <h3>{{ t("dev.actions") }}</h3>
        <div class="action-grid">
          <button type="button" class="btn small" :disabled="!left && !right" @click="swapSides">
            <ArrowLeftRight :size="13" />{{ t("dev.swap") }}
          </button>
          <button type="button" class="btn small" :disabled="!left && !right && !activeId" @click="startNew">
            <Plus :size="13" />{{ t("dev.newEntry") }}
          </button>
        </div>
      </section>

      <DevHistoryList :items="historyItems" :active-id="activeId" @select="selectRecord" @remove="removeRecord" @clear="clearRecords" />
    </aside>

    <main class="stage">
      <Transition name="stage-swap" mode="out-in">
        <div :key="transitionTick" class="diff-stage">
          <div class="panes">
            <SplitPane storage-key="json-diff" :default-ratio="0.5" :min="220">
              <template #left>
                <TextPane
                  ref="leftPane"
                  v-model="left"
                  copyable
                  :label="t('json.diffLeft')"
                  language="json"
                  :code-error="editorErrorOf(leftResult)"
                  :placeholder="t('json.diffLeftPlaceholder')"
                >
                  <template #actions>
                    <span v-if="leftResult?.ok" class="status ok"><CircleCheck :size="13" />{{ t("json.valid") }}</span>
                    <button v-else-if="leftResult" class="status bad" :title="t('json.jumpToError')" @click="locate(leftPane, leftResult)">
                      <CircleAlert :size="13" />{{ leftResult.line ? t("json.errorLine", { line: leftResult.line }) : t("json.invalid") }}
                    </button>
                  </template>
                </TextPane>
              </template>

              <template #right>
                <TextPane
                  ref="rightPane"
                  v-model="right"
                  copyable
                  :label="t('json.diffRight')"
                  language="json"
                  :code-error="editorErrorOf(rightResult)"
                  :placeholder="t('json.diffRightPlaceholder')"
                >
                  <template #actions>
                    <span v-if="rightResult?.ok" class="status ok"><CircleCheck :size="13" />{{ t("json.valid") }}</span>
                    <button v-else-if="rightResult" class="status bad" :title="t('json.jumpToError')" @click="locate(rightPane, rightResult)">
                      <CircleAlert :size="13" />{{ rightResult.line ? t("json.errorLine", { line: rightResult.line }) : t("json.invalid") }}
                    </button>
                  </template>
                </TextPane>
              </template>
            </SplitPane>
          </div>

          <section class="card result">
            <header class="card-title">
              <span class="title">{{ t("json.diffResult") }}</span>
              <template v-if="diffs">
                <span class="chip added" :class="{ zero: !count('added') }">{{ t("json.added") }} {{ count("added") }}</span>
                <span class="chip removed" :class="{ zero: !count('removed') }">{{ t("json.removed") }} {{ count("removed") }}</span>
                <span class="chip changed" :class="{ zero: !count('changed') }">{{ t("json.changed") }} {{ count("changed") }}</span>
              </template>
            </header>

            <div v-if="error" class="state-box error" role="alert">
              <span class="state-icon"><CircleAlert :size="18" /></span>
              <p>{{ error }}</p>
            </div>
            <div v-else-if="!diffs" class="state-box">
              <span class="state-icon"><GitCompareArrows :size="18" /></span>
              <p>{{ t("json.diffHint") }}</p>
            </div>
            <div v-else-if="!diffs.length" class="state-box same">
              <span class="state-icon"><CircleCheck :size="18" /></span>
              <p>{{ t("json.diffSame") }}</p>
            </div>
            <ul v-else-if="filteredDiffs?.length" class="list">
              <li v-for="d in filteredDiffs" :key="d.path + d.kind" class="item">
                <span class="kind" :class="d.kind">{{ t(`json.${d.kind}`) }}</span>
                <code class="path" :title="d.path">{{ d.path }}</code>
                <span class="values">
                  <code v-if="d.kind !== 'added'" class="before" :title="preview(d.before)">{{ preview(d.before) }}</code>
                  <span v-if="d.kind === 'changed'" class="arrow">→</span>
                  <code v-if="d.kind !== 'removed'" class="after" :title="preview(d.after)">{{ preview(d.after) }}</code>
                </span>
                <button
                  type="button"
                  class="icon-btn copy-path"
                  :class="{ ok: copiedKey === d.path + d.kind }"
                  :title="t('common.copy')"
                  @click="onCopyPath(d.path + d.kind, d.path)"
                >
                  <Check v-if="copiedKey === d.path + d.kind" :size="13" />
                  <Copy v-else :size="13" />
                </button>
              </li>
            </ul>
            <div v-else class="state-box">
              <span class="state-icon"><GitCompareArrows :size="18" /></span>
              <p>{{ t("dev.diffCount", { n: 0 }) }}</p>
            </div>
          </section>
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
.filter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.filter-pill {
  height: 30px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-sunken);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.filter-pill em {
  font-style: normal;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.78;
}
.filter-pill:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.filter-pill.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.filter-pill.added.on {
  border-color: color-mix(in srgb, var(--success) 38%, transparent);
  background: var(--success-soft);
  color: var(--success);
}
.filter-pill.removed.on {
  border-color: color-mix(in srgb, var(--danger) 38%, transparent);
  background: var(--danger-soft);
  color: var(--danger);
}
.filter-pill.changed.on {
  border-color: color-mix(in srgb, var(--warning) 38%, transparent);
  background: var(--warning-soft);
  color: var(--warning);
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
.diff-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panes {
  flex: 3;
  display: flex;
  min-height: 180px;
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
.result {
  flex: 2;
  min-height: 168px;
  box-shadow: var(--shadow-sm);
}
.title {
  margin-right: 4px;
}
.chip {
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  padding: 2px 9px;
  border: 1px solid transparent;
  border-radius: 999px;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.chip.zero {
  opacity: 0.45;
}
.chip.added,
.kind.added {
  color: var(--success);
  background: var(--success-soft);
  border-color: color-mix(in srgb, var(--success) 22%, transparent);
}
.chip.removed,
.kind.removed {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: color-mix(in srgb, var(--danger) 24%, transparent);
}
.chip.changed,
.kind.changed {
  color: var(--warning);
  background: var(--warning-soft);
  border-color: color-mix(in srgb, var(--warning) 24%, transparent);
}
.state-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  text-align: center;
  color: var(--text-3);
}
.state-box p {
  margin: 0;
  max-width: 460px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.state-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  color: var(--text-3);
}
.state-box.error p {
  color: var(--danger);
}
.state-box.error .state-icon {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: color-mix(in srgb, var(--danger) 24%, transparent);
}
.state-box.same p {
  color: var(--success);
}
.state-box.same .state-icon {
  color: var(--success);
  background: var(--success-soft);
  border-color: color-mix(in srgb, var(--success) 24%, transparent);
}
.list {
  list-style: none;
  margin: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.item:hover {
  background: var(--hover);
  border-color: var(--border);
}
.kind {
  flex-shrink: 0;
  min-width: 46px;
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  line-height: 18px;
}
.path {
  flex-shrink: 0;
  max-width: 38%;
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--syntax-key);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}
.values {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}
.values code {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 7px;
  border-radius: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}
.before {
  color: var(--danger);
  background: var(--danger-soft);
  text-decoration: line-through;
  opacity: 0.85;
}
.after {
  color: var(--text);
  background: var(--success-soft);
}
.arrow {
  flex-shrink: 0;
  color: var(--text-3);
}
.copy-path {
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.item:hover .copy-path,
.item:focus-within .copy-path,
.copy-path.ok {
  opacity: 1;
}
.stage-swap-enter-active {
  transition: opacity var(--dur) var(--ease-out), translate var(--dur) var(--ease-out);
}
.stage-swap-leave-active {
  transition: opacity var(--dur-fast) ease-in, translate var(--dur-fast) ease-in;
}
.stage-swap-enter-from {
  opacity: 0;
  translate: 0 6px;
}
.stage-swap-leave-to {
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
@media (max-width: 720px) {
  .panes {
    flex: none;
    width: 100%;
  }
  .result {
    flex: none;
    min-height: 220px;
  }
  .card-title {
    flex-wrap: wrap;
  }
  .item {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 5px 8px;
    padding: 7px 8px;
  }
  .path {
    max-width: calc(100% - 92px);
  }
  .values {
    flex-basis: 100%;
    padding-left: 0;
  }
  .copy-path {
    opacity: 1;
    margin-left: auto;
  }
}
</style>
