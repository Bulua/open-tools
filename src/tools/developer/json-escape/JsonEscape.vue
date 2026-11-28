<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowUpDown, Info, Plus } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useToolResult } from "@/composables/useToolUsage";
import { locale } from "@/locales";
import { localizeTool } from "@/locales/tools";
import DevHistoryList, { type DevHistoryItem } from "../shared/components/DevHistoryList.vue";
import { MAX_HISTORY, createHistoryId, formatHistoryTime, loadHistory, previewLine, saveHistory } from "../shared/history";
import { formatJson, parseJson } from "../shared/json";
import { escapeJson, unescapeJson } from "./escape";
import tool from "./index";

type Direction = "unescape" | "escape";

interface JsonEscapeRecord {
  id: string;
  direction: Direction;
  autoFormat: boolean;
  input: string;
  output: string;
  updatedAt: number;
}

const STORAGE_KEY = "json-escape.records";
const PREVIEW_LIMIT = 48_000;
const { t } = useI18n();
const localized = computed(() => localizeTool(tool, locale.value));

const direction = useStoredRef<Direction>("json-escape.direction", "unescape");
const autoFormat = useStoredRef("json-escape.autoFormat", true);
const input = ref("");
const transitionTick = ref(0);

function editorLanguage(text: string): "json" | "text" {
  const value = text.trimStart();
  if (value.startsWith("{") || value.startsWith("[")) return "json";
  return "text";
}

const result = computed(() => {
  if (!input.value.trim()) return { output: "", error: "" };
  try {
    if (direction.value === "unescape") {
      const text = unescapeJson(input.value);
      if (autoFormat.value) {
        const parsed = parseJson(text);
        return { output: parsed.ok ? formatJson(parsed.value) : text, error: "" };
      }
      return { output: text, error: "" };
    }
    return { output: escapeJson(input.value), error: "" };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
});

const isTruncated = computed(() => result.value.output.length > PREVIEW_LIMIT);
const displayOutput = computed(() =>
  isTruncated.value ? `${result.value.output.slice(0, PREVIEW_LIMIT)}\n…` : result.value.output,
);

// ---------- 历史记录 ----------

const records = ref<JsonEscapeRecord[]>(loadHistory<JsonEscapeRecord>(STORAGE_KEY));
const activeId = ref<string | null>(null);
let restoring = false;
let recordTimer: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => clearTimeout(recordTimer));

const persist = () =>
  saveHistory(STORAGE_KEY, records.value, MAX_HISTORY, 120_000, (r) => r.input.length + r.output.length);

watch([input, () => result.value.output, () => result.value.error, autoFormat], () => {
  if (restoring) return;
  clearTimeout(recordTimer);
  if (!input.value.trim() || result.value.error || !result.value.output) return;
  recordTimer = setTimeout(() => {
    const now = Date.now();
    const idx = activeId.value ? records.value.findIndex((r) => r.id === activeId.value) : -1;
    if (idx >= 0 && records.value[idx].direction === direction.value) {
      records.value[idx] = {
        ...records.value[idx],
        autoFormat: autoFormat.value,
        input: input.value,
        output: result.value.output,
        updatedAt: now,
      };
      persist();
      return;
    }
    const created: JsonEscapeRecord = {
      id: createHistoryId(),
      direction: direction.value,
      autoFormat: autoFormat.value,
      input: input.value,
      output: result.value.output,
      updatedAt: now,
    };
    records.value = [created, ...records.value].slice(0, MAX_HISTORY);
    activeId.value = created.id;
    persist();
  }, 450);
});

const historyItems = computed<DevHistoryItem[]>(() =>
  records.value.map((r) => ({
    id: r.id,
    tag: t(r.direction === "unescape" ? "dev.unescape" : "dev.escape"),
    tone: r.direction === "unescape" ? "accent" : "success",
    time: formatHistoryTime(r.updatedAt, locale.value),
    title: previewLine(r.input, 46),
    subtitle: previewLine(r.output, 54),
  })),
);

const switchDirection = (next: Direction) => {
  if (direction.value === next) return;
  clearTimeout(recordTimer);
  direction.value = next;
  transitionTick.value++;
  const active = records.value.find((r) => r.id === activeId.value);
  if (active && active.direction !== next) activeId.value = null;
};

const swap = () => {
  if (!result.value.output) return;
  clearTimeout(recordTimer);
  activeId.value = null;
  const nextInput = result.value.output;
  direction.value = direction.value === "unescape" ? "escape" : "unescape";
  input.value = nextInput;
  transitionTick.value++;
};

const startNew = () => {
  clearTimeout(recordTimer);
  activeId.value = null;
  input.value = "";
  transitionTick.value++;
};

const selectRecord = async (id: string) => {
  const target = records.value.find((r) => r.id === id);
  if (!target || (activeId.value === id && direction.value === target.direction)) return;
  clearTimeout(recordTimer);
  restoring = true;
  activeId.value = target.id;
  direction.value = target.direction;
  autoFormat.value = target.autoFormat;
  input.value = target.input;
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

useToolResult(() => (!result.value.error && result.value.output ? `${direction.value}:${input.value.length}` : ""));
</script>

<template>
  <div class="workbench">
    <aside class="card sidebar">
      <section class="section">
        <h3>{{ t("dev.direction") }}</h3>
        <div class="seg fill">
          <button type="button" :class="{ on: direction === 'unescape' }" @click="switchDirection('unescape')">{{ t("dev.unescape") }}</button>
          <button type="button" :class="{ on: direction === 'escape' }" @click="switchDirection('escape')">{{ t("dev.escape") }}</button>
        </div>
      </section>

      <section class="section">
        <h3>{{ t("dev.options") }}</h3>
        <div v-if="direction === 'unescape'" class="switch-row">
          <span>{{ t("dev.autoFormat") }}</span>
          <button
            type="button"
            class="control-switch"
            role="switch"
            :aria-checked="autoFormat"
            :aria-label="t('dev.autoFormat')"
            @click="autoFormat = !autoFormat"
          >
            <span />
          </button>
        </div>

        <div class="action-grid">
          <button type="button" class="btn small" :disabled="!result.output" @click="swap">
            <ArrowUpDown :size="13" />{{ t("dev.swap") }}
          </button>
          <button type="button" class="btn small" :disabled="!input && !activeId" @click="startNew">
            <Plus :size="13" />{{ t("dev.newEntry") }}
          </button>
        </div>
      </section>

      <DevHistoryList :items="historyItems" :active-id="activeId" @select="selectRecord" @remove="removeRecord" @clear="clearRecords" />
    </aside>

    <main class="stage">
      <Transition name="stage-swap" mode="out-in">
        <div :key="`${direction}:${transitionTick}`" class="stage-stack">
          <TextPane
            v-model="input"
            class="stage-pane"
            copyable
            :label="t('tool.input')"
            :language="editorLanguage(input)"
            :placeholder="localized.inputPlaceholder"
          >
            <template #actions>
              <span v-if="input" class="count-pill">{{ t("dev.chars", { n: input.length.toLocaleString() }) }}</span>
            </template>
          </TextPane>

          <div class="output-wrap">
            <TextPane
              :model-value="displayOutput"
              :copy-text="result.output"
              class="stage-pane"
              readonly
              :label="t('tool.output')"
              :language="editorLanguage(displayOutput)"
              :placeholder="t('tool.outputPlaceholder')"
              :error="result.error"
            >
              <template #actions>
                <span v-if="result.output" class="count-pill">{{ t("dev.chars", { n: result.output.length.toLocaleString() }) }}</span>
              </template>
            </TextPane>
            <p v-if="isTruncated" class="truncate-notice">
              <Info :size="13" />
              <span>{{ t("dev.previewTruncated", { n: PREVIEW_LIMIT.toLocaleString() }) }}</span>
            </p>
          </div>
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
.stage-stack {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.output-wrap {
  flex: 1;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stage-pane {
  flex: 1;
  min-height: 180px;
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
.truncate-notice {
  margin: 0;
  padding: 0 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-3);
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
</style>
