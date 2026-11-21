<script setup lang="ts">
import { Check, Copy } from "lucide-vue-next";
import { computed, defineAsyncComponent, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { useClipboard } from "@/composables/useClipboard";
import { showError } from "@/utils/errorToast";
import McpSchemaDetails from "./McpSchemaDetails.vue";

const props = defineProps<{
  response?: { isError?: boolean; [key: string]: unknown };
  failure: string;
  running: boolean;
  pending: boolean;
  elapsed?: number;
  schema?: Record<string, unknown>;
}>();
const { t, locale } = useI18n();
const { copy, copied } = useClipboard();
const id = useId();
const view = ref<"json" | "raw">("json");
const CodeEditor = defineAsyncComponent(() => import("@/components/common/CodeEditor.vue"));
const raw = computed(() => props.response ? JSON.stringify(props.response) : props.failure);
const formatted = computed(() => props.response ? JSON.stringify(props.response, null, 2) : props.failure);
const status = computed(() => {
  if (props.running) return "testing";
  if (props.pending) return "testPending";
  if (props.failure || props.response?.isError) return "outputFailed";
  if (props.response) return "outputSucceeded";
});
const elapsedText = computed(() => props.elapsed === undefined ? "" : new Intl.NumberFormat(locale.value, {
  style: "unit",
  unit: props.elapsed < 1000 ? "millisecond" : "second",
  maximumFractionDigits: props.elapsed < 1000 ? 0 : 2,
}).format(props.elapsed < 1000 ? props.elapsed : props.elapsed / 1000));

async function copyOutput() {
  try {
    await copy(view.value === "json" ? formatted.value : raw.value);
  } catch (error) {
    showError(error);
  }
}
</script>

<template>
  <section class="output-panel" :aria-labelledby="id">
    <header class="output-head">
      <h3 :id="id">{{ t("network.mcp.output") }}</h3>
      <div class="output-actions">
        <McpSchemaDetails v-if="schema" :label="t('network.mcp.outputSchema')" :button-label="t('network.mcp.outputSchemaAction')" :schema="schema" />
        <span v-if="status" class="output-status" :class="status" role="status">{{ t(`network.mcp.${status}`) }}</span>
        <span v-if="elapsedText" class="elapsed" :title="t('network.mcp.outputElapsed')">{{ elapsedText }}</span>
        <div v-if="response" class="seg" role="group" :aria-label="t('network.mcp.outputView')">
          <button type="button" :class="{ on: view === 'json' }" :aria-pressed="view === 'json'" @click="view = 'json'">JSON</button>
          <button type="button" :class="{ on: view === 'raw' }" :aria-pressed="view === 'raw'" @click="view = 'raw'">
            {{ t("network.mcp.outputRaw") }}
          </button>
        </div>
        <button v-if="raw" type="button" class="icon-btn" :title="t('common.copy')" :aria-label="t('common.copy')" @click="copyOutput">
          <Check v-if="copied" :size="15" aria-hidden="true" />
          <Copy v-else :size="15" aria-hidden="true" />
        </button>
      </div>
    </header>
    <CodeEditor v-if="response && view === 'json'" :model-value="formatted" :labelled-by="id" language="json" readonly wrap />
    <pre v-else-if="raw" class="raw-output" :class="{ 'error-output': failure }" :role="failure ? 'alert' : undefined" tabindex="0">{{ raw }}</pre>
    <p v-else class="output-empty">{{ t(running ? "network.mcp.testing" : "network.mcp.outputEmpty") }}</p>
  </section>
</template>

<style scoped>
.output-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.output-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
  min-height: 46px;
  padding: 6px 10px 6px 14px;
  border-bottom: 1px solid var(--border);
}
h3 { margin: 0; font-size: 13px; font-weight: 600; }
.output-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
.output-status, .elapsed { font-size: 12px; color: var(--text-2); }
.output-status { padding: 3px 6px; border-radius: 5px; background: var(--active); }
.outputFailed { color: var(--danger); background: var(--danger-soft); }
.outputSucceeded { color: var(--success); background: var(--success-soft); }
.elapsed { font-variant-numeric: tabular-nums; }
.raw-output {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 12px 14px;
  font: 12px/1.6 var(--font-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.error-output { color: var(--danger); }
.output-empty { margin: auto; padding: 14px; color: var(--text-2); font-size: 13px; text-align: center; }
</style>
