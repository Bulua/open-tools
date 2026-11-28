<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowUpDown, Plus } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useToolResult } from "@/composables/useToolUsage";
import DevHistoryList, { type DevHistoryItem } from "../shared/components/DevHistoryList.vue";
import { MAX_HISTORY, createHistoryId, formatHistoryTime, loadHistory, previewLine, saveHistory } from "../shared/history";
import * as tf from "./transforms";

type Kind = "url" | "unicode" | "html";
type Direction = "encode" | "decode";

interface TextEscapeRecord {
  id: string;
  kind: Kind;
  direction: Direction;
  input: string;
  output: string;
  updatedAt: number;
}

const STORAGE_KEY = "text-escape.records";
const { t, locale } = useI18n();

const KINDS: Record<Kind, { label: string; right: string; encode: (s: string) => string; decode: (s: string) => string; example: string }> = {
  url: { label: "URL", right: "urlEncoded", encode: tf.urlEncode, decode: tf.urlDecode, example: "a%3D1%26b%3D%E5%B7%A5%E5%85%B7" },
  unicode: { label: "Unicode", right: "unicodeEncoded", encode: tf.unicodeEscape, decode: tf.unicodeUnescape, example: "\\u5de5\\u5177" },
  html: { label: "htmlEntity", right: "htmlEntity", encode: tf.htmlEscape, decode: tf.htmlUnescape, example: "&lt;div&gt;" },
};
const labelOf = (s: string) => (/^[A-Z]/.test(s) ? s : t(`encode.${s}`));

const kind = useStoredRef<Kind>("text-escape.kind", "url");
const direction = useStoredRef<Direction>("text-escape.direction", "encode");
const input = ref("");
const transitionTick = ref(0);

const current = computed(() => KINDS[kind.value] ?? KINDS.url);

const result = computed(() => {
  if (!input.value) return { output: "", error: "" };
  try {
    const output =
      direction.value === "encode"
        ? current.value.encode(input.value)
        : input.value.trim()
          ? current.value.decode(input.value)
          : "";
    return { output, error: "" };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
});

// ---------- 历史记录 ----------

const records = ref<TextEscapeRecord[]>(loadHistory<TextEscapeRecord>(STORAGE_KEY));
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
    if (idx >= 0 && records.value[idx].kind === kind.value && records.value[idx].direction === direction.value) {
      records.value[idx] = { ...records.value[idx], input: input.value, output: result.value.output, updatedAt: now };
      persist();
      return;
    }
    const created: TextEscapeRecord = {
      id: createHistoryId(),
      kind: kind.value,
      direction: direction.value,
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
  records.value.map((r) => {
    const k = KINDS[r.kind] ?? KINDS.url;
    const dirLabel = t(r.direction === "encode" ? "dev.encodeAction" : "dev.decodeAction");
    return {
      id: r.id,
      tag: `${labelOf(k.label)} · ${dirLabel}`,
      tone: r.direction === "encode" ? "accent" : "success",
      time: formatHistoryTime(r.updatedAt, locale.value),
      title: previewLine(r.input, 46),
      subtitle: previewLine(r.output, 54),
    };
  }),
);

// ---------- 交互 ----------

const switchKind = (next: Kind) => {
  if (kind.value === next) return;
  clearTimeout(recordTimer);
  kind.value = next;
  transitionTick.value++;
  const active = records.value.find((r) => r.id === activeId.value);
  if (active && active.kind !== next) activeId.value = null;
};

const switchDirection = (next: Direction) => {
  if (direction.value === next) return;
  clearTimeout(recordTimer);
  direction.value = next;
  transitionTick.value++;
  const active = records.value.find((r) => r.id === activeId.value);
  if (active && (active.kind !== kind.value || active.direction !== next)) activeId.value = null;
};

const swap = () => {
  if (!result.value.output) return;
  clearTimeout(recordTimer);
  activeId.value = null;
  const nextInput = result.value.output;
  direction.value = direction.value === "encode" ? "decode" : "encode";
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
  if (!target || (activeId.value === id && kind.value === target.kind && direction.value === target.direction)) return;
  clearTimeout(recordTimer);
  restoring = true;
  activeId.value = target.id;
  kind.value = target.kind;
  direction.value = target.direction;
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

useToolResult(() => (!result.value.error ? result.value.output : ""));
</script>

<template>
  <div class="workbench">
    <aside class="card sidebar">
      <section class="section">
        <h3>{{ t("dev.mode") }}</h3>
        <div class="seg fill">
          <button v-for="(k, key) in KINDS" :key="key" type="button" :class="{ on: kind === key }" @click="switchKind(key)">
            {{ labelOf(k.label) }}
          </button>
        </div>

        <h3>{{ t("dev.direction") }}</h3>
        <div class="seg fill">
          <button type="button" :class="{ on: direction === 'encode' }" @click="switchDirection('encode')">{{ t("dev.encodeAction") }}</button>
          <button type="button" :class="{ on: direction === 'decode' }" @click="switchDirection('decode')">{{ t("dev.decodeAction") }}</button>
        </div>
      </section>

      <section class="section">
        <h3>{{ t("dev.actions") }}</h3>
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
        <div :key="`${kind}:${direction}:${transitionTick}`" class="stage-stack">
          <TextPane
            v-model="input"
            class="stage-pane"
            copyable
            :label="direction === 'encode' ? t('encode.original') : labelOf(current.right)"
            :placeholder="direction === 'encode' ? t('encode.originalPlaceholder') : t('encode.encodedPlaceholder', { example: current.example })"
          >
            <template #actions>
              <span v-if="input" class="count-pill">{{ t("dev.chars", { n: input.length.toLocaleString() }) }}</span>
            </template>
          </TextPane>

          <TextPane
            :model-value="result.output"
            class="stage-pane"
            readonly
            :label="direction === 'encode' ? labelOf(current.right) : t('encode.original')"
            :placeholder="t('tool.outputPlaceholder')"
            :error="result.error"
          >
            <template #actions>
              <span v-if="result.output" class="count-pill">{{ t("dev.chars", { n: result.output.length.toLocaleString() }) }}</span>
            </template>
          </TextPane>
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
.stage-stack {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
