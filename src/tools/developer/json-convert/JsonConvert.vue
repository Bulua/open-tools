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
import { jsonToTypeScript, jsonToYaml, yamlToJson } from "./convert";
import tool from "./index";

type ConvertTarget = "jsonToYaml" | "yamlToJson" | "jsonToTs";

interface JsonConvertRecord {
  id: string;
  target: ConvertTarget;
  input: string;
  output: string;
  updatedAt: number;
}

const STORAGE_KEY = "json-convert.records";
const PREVIEW_LIMIT = 48_000;
const { t } = useI18n();
const localized = computed(() => localizeTool(tool, locale.value));

const target = useStoredRef<ConvertTarget>("json-convert.target", "jsonToYaml");
const input = ref("");
const transitionTick = ref(0);

const TARGETS: { id: ConvertTarget; tone: "accent" | "success" | "warning" }[] = [
  { id: "jsonToYaml", tone: "accent" },
  { id: "yamlToJson", tone: "success" },
  { id: "jsonToTs", tone: "warning" },
];

function editorLanguage(text: string): "json" | "text" {
  const value = text.trimStart();
  if (value.startsWith("{") || value.startsWith("[")) return "json";
  return "text";
}

const result = computed(() => {
  if (!input.value.trim()) return { output: "", error: "" };
  try {
    if (target.value === "jsonToYaml") return { output: jsonToYaml(input.value), error: "" };
    if (target.value === "yamlToJson") return { output: yamlToJson(input.value), error: "" };
    return { output: jsonToTypeScript(JSON.parse(input.value)), error: "" };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
});

const isTruncated = computed(() => result.value.output.length > PREVIEW_LIMIT);
const displayOutput = computed(() =>
  isTruncated.value ? `${result.value.output.slice(0, PREVIEW_LIMIT)}\n…` : result.value.output,
);

// ---------- 历史记录 ----------

const records = ref<JsonConvertRecord[]>(loadHistory<JsonConvertRecord>(STORAGE_KEY));
const activeId = ref<string | null>(null);
let restoring = false;
let recordTimer: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => clearTimeout(recordTimer));

const persist = () =>
  saveHistory(STORAGE_KEY, records.value, MAX_HISTORY, 120_000, (r) => r.input.length + r.output.length);

watch([input, () => result.value.output, () => result.value.error], () => {
  if (restoring) return;
  clearTimeout(recordTimer);
  if (!input.value.trim() || result.value.error || !result.value.output) return;
  recordTimer = setTimeout(() => {
    const now = Date.now();
    const idx = activeId.value ? records.value.findIndex((r) => r.id === activeId.value) : -1;
    if (idx >= 0 && records.value[idx].target === target.value) {
      records.value[idx] = { ...records.value[idx], input: input.value, output: result.value.output, updatedAt: now };
      persist();
      return;
    }
    const created: JsonConvertRecord = {
      id: createHistoryId(),
      target: target.value,
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
    tag: t(`dev.${r.target}`),
    tone: TARGETS.find((x) => x.id === r.target)?.tone ?? "accent",
    time: formatHistoryTime(r.updatedAt, locale.value),
    title: previewLine(r.input, 46),
    subtitle: previewLine(r.output, 54),
  })),
);

const switchTarget = (next: ConvertTarget) => {
  if (target.value === next) return;
  clearTimeout(recordTimer);
  target.value = next;
  transitionTick.value++;
  const active = records.value.find((r) => r.id === activeId.value);
  if (active && active.target !== next) activeId.value = null;
};

const swap = () => {
  if (!result.value.output || target.value === "jsonToTs") return;
  clearTimeout(recordTimer);
  activeId.value = null;
  const nextInput = result.value.output;
  target.value = target.value === "jsonToYaml" ? "yamlToJson" : "jsonToYaml";
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
  const row = records.value.find((r) => r.id === id);
  if (!row || (activeId.value === id && target.value === row.target)) return;
  clearTimeout(recordTimer);
  restoring = true;
  activeId.value = row.id;
  target.value = row.target;
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

useToolResult(() => (!result.value.error && result.value.output ? `${target.value}:${input.value.length}` : ""));
</script>

<template>
  <div class="workbench">
    <aside class="card sidebar">
      <section class="section">
        <h3>{{ t("dev.mode") }}</h3>
        <div class="option-stack">
          <button
            v-for="item in TARGETS"
            :key="item.id"
            type="button"
            class="mode-pill"
            :class="{ on: target === item.id }"
            @click="switchTarget(item.id)"
          >
            {{ t(`dev.${item.id}`) }}
          </button>
        </div>
      </section>

      <section class="section">
        <h3>{{ t("dev.actions") }}</h3>
        <div class="action-grid">
          <button type="button" class="btn small" :disabled="!result.output || target === 'jsonToTs'" @click="swap">
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
        <div :key="`${target}:${transitionTick}`" class="stage-stack">
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
.option-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mode-pill {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-sunken);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 500;
  text-align: left;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.mode-pill:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.mode-pill.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
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
