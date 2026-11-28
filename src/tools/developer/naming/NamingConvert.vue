<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, FileText, Plus } from "lucide-vue-next";
import CopyList from "@/components/common/CopyList.vue";
import TextPane from "@/components/common/TextPane.vue";
import { useClipboard } from "@/composables/useClipboard";
import { useToolResult } from "@/composables/useToolUsage";
import { locale, translationIn } from "@/locales";
import DevHistoryList, { type DevHistoryItem } from "../shared/components/DevHistoryList.vue";
import { MAX_HISTORY, createHistoryId, formatHistoryTime, loadHistory, previewLine, saveHistory } from "../shared/history";
import { NAMING_NAMES } from "./names";
import { NAMING_STYLES, convertLines } from "./transforms";

interface NamingRecord {
  id: string;
  input: string;
  updatedAt: number;
}

const STORAGE_KEY = "naming.records";
const SAMPLE_INPUT = "user_profile_id\nOrderItemCount\nhttp-request-timeout";
const { t } = useI18n();
const { copied, copy } = useClipboard();

const input = ref("");
const transitionTick = ref(0);

const labelWidth = computed(() => (locale.value === "zh-CN" ? "76px" : locale.value === "ja" ? "152px" : "120px"));

const items = computed(() =>
  NAMING_STYLES.map((s) => ({
    label: translationIn(NAMING_NAMES, locale.value, s.example) ?? s.label,
    value: input.value.trim() ? convertLines(input.value, s.convert) : "",
    placeholder: s.example,
  })),
);

// ---------- 历史记录 ----------

const records = ref<NamingRecord[]>(loadHistory<NamingRecord>(STORAGE_KEY));
const activeId = ref<string | null>(null);
let restoring = false;
let recordTimer: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => clearTimeout(recordTimer));

const persist = () =>
  saveHistory(STORAGE_KEY, records.value, MAX_HISTORY, 60_000, (r) => r.input.length);

watch(input, () => {
  if (restoring) return;
  clearTimeout(recordTimer);
  if (!input.value.trim()) return;
  recordTimer = setTimeout(() => {
    const now = Date.now();
    const idx = activeId.value ? records.value.findIndex((r) => r.id === activeId.value) : -1;
    if (idx >= 0) {
      records.value[idx] = { ...records.value[idx], input: input.value, updatedAt: now };
      persist();
      return;
    }
    const created: NamingRecord = {
      id: createHistoryId(),
      input: input.value,
      updatedAt: now,
    };
    records.value = [created, ...records.value].slice(0, MAX_HISTORY);
    activeId.value = created.id;
    persist();
  }, 450);
});

const historyItems = computed<DevHistoryItem[]>(() =>
  records.value.map((r) => {
    const first = previewLine(r.input, 46);
    const camel = convertLines(first, NAMING_STYLES[0].convert);
    const snake = convertLines(first, NAMING_STYLES[2].convert);
    return {
      id: r.id,
      time: formatHistoryTime(r.updatedAt, locale.value),
      title: first,
      subtitle: `${camel} · ${snake}`,
    };
  }),
);

const fillSample = () => {
  clearTimeout(recordTimer);
  activeId.value = null;
  input.value = SAMPLE_INPUT;
  transitionTick.value++;
};

const copyAll = () => {
  if (!input.value.trim()) return;
  const lines = items.value.filter((i) => i.value).map((i) => `${i.label}: ${i.value}`);
  if (lines.length) void copy(lines.join("\n"));
};

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

useToolResult(() => input.value.trim());
</script>

<template>
  <div class="workbench">
    <aside class="card sidebar">
      <section class="section">
        <h3>{{ t("dev.actions") }}</h3>
        <div class="action-grid">
          <button type="button" class="btn small" :disabled="!input.trim()" @click="copyAll">
            <Check v-if="copied" :size="13" />
            <Copy v-else :size="13" />
            {{ t("dev.copyAll") }}
          </button>
          <button type="button" class="btn small" :disabled="!input && !activeId" @click="startNew">
            <Plus :size="13" />{{ t("dev.newEntry") }}
          </button>
        </div>
        <button type="button" class="btn small full" @click="fillSample">
          <FileText :size="13" />{{ t("dev.sample") }}
        </button>
      </section>

      <DevHistoryList :items="historyItems" :active-id="activeId" @select="selectRecord" @remove="removeRecord" @clear="clearRecords" />
    </aside>

    <main class="stage">
      <Transition name="stage-swap" mode="out-in">
        <div :key="transitionTick" class="naming-stage">
          <TextPane
            v-model="input"
            class="input"
            copyable
            :label="t('convert.original')"
            :placeholder="t('convert.namingPlaceholder')"
          >
            <template #actions>
              <span v-if="input" class="count-pill">{{ t("dev.chars", { n: input.length.toLocaleString() }) }}</span>
            </template>
          </TextPane>

          <section class="card result">
            <header class="card-title">{{ t("convert.result") }}</header>
            <div class="result-body">
              <CopyList :items="items" :label-width="labelWidth" />
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
.naming-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.input {
  flex: 0 0 156px;
  min-height: 120px;
}
.result {
  flex: 1;
  min-width: 0;
  min-height: 0;
  box-shadow: var(--shadow-sm);
}
.result-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
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
