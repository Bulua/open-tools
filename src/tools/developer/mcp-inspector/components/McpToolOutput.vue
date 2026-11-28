<script setup lang="ts">
import { ArrowLeft, Check, Copy } from "lucide-vue-next";
import { computed, defineAsyncComponent, onMounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { useClipboard } from "@/composables/useClipboard";
import { showError } from "@/utils/errorToast";

const props = defineProps<{
  response?: { isError?: boolean; [key: string]: unknown };
  failure: string;
  elapsed?: number;
}>();
defineEmits<{ back: [] }>();
const { t, locale } = useI18n();
const { copy, copied } = useClipboard();
const id = useId();
const structuredId = useId();
const backButton = ref<HTMLButtonElement>();
onMounted(() => backButton.value?.focus());
const view = ref<"json" | "raw">("json");
const CodeEditor = defineAsyncComponent(() => import("@/components/common/CodeEditor.vue"));
const raw = computed(() => props.response ? JSON.stringify(props.response) : props.failure);
const formatted = computed(() => props.response ? JSON.stringify(props.response, null, 2) : props.failure);
const structured = computed(() => JSON.stringify(props.response?.structuredContent, null, 2));
const status = computed(() => {
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
      <div class="result-title">
        <button ref="backButton" type="button" class="btn subtle result-back" @click="$emit('back')">
          <ArrowLeft :size="15" aria-hidden="true" />
          {{ t("network.mcp.backToArguments") }}
        </button>
        <h3 :id="id">{{ t("network.mcp.output") }}</h3>
      </div>
      <div class="output-actions">
        <span v-if="status" class="output-status" :class="status" role="status">{{ t(`network.mcp.${status}`) }}</span>
        <span v-if="elapsedText" class="elapsed" :title="t('network.mcp.outputElapsed')">{{ elapsedText }}</span>
        <div v-if="response" class="seg" role="group" :aria-label="t('network.mcp.outputView')">
          <button type="button" :class="{ on: view === 'json' }" :aria-pressed="view === 'json'" @click="view = 'json'">JSON</button>
          <button type="button" :class="{ on: view === 'raw' }" :aria-pressed="view === 'raw'" @click="view = 'raw'">
            {{ t("network.mcp.outputRaw") }}
          </button>
        </div>
        <button v-if="raw" type="button" class="icon-btn copy-output" :title="t('common.copy')" :aria-label="t('common.copy')" @click="copyOutput">
          <Check v-if="copied" :size="15" aria-hidden="true" />
          <Copy v-else :size="15" aria-hidden="true" />
        </button>
      </div>
    </header>
    <CodeEditor v-if="response && view === 'json'" class="result-editor" :model-value="formatted" :labelled-by="id" language="json" readonly />
    <pre v-else-if="raw" class="raw-output" :class="{ 'error-output': failure }" :role="failure ? 'alert' : undefined" tabindex="0">{{ raw }}</pre>
    <p v-else class="output-empty">{{ t("network.mcp.outputEmpty") }}</p>
    <details v-if="structured !== undefined && view === 'json'" class="structured-result" open>
      <summary :id="structuredId">{{ t("network.mcp.structuredOutput") }}</summary>
      <CodeEditor class="result-editor" :model-value="structured" :labelled-by="structuredId" language="json" readonly />
    </details>
  </section>
</template>

<style scoped>
.output-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 10px;
  background: var(--surface);
}
.output-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
  min-height: 46px;
  padding: 6px 0;
}
.result-title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.result-editor, .raw-output { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.result-editor { flex: none; height: clamp(160px, 30vh, 340px); }
.structured-result summary { padding: 6px 0; cursor: pointer; font-size: 13px; font-weight: 600; }
h3 { margin: 0; font-size: 13px; font-weight: 600; }
.output-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
.output-status, .elapsed { font-size: 12px; color: var(--text-2); }
.output-status { padding: 3px 6px; border-radius: 5px; background: var(--active); }
.outputFailed { color: var(--danger); background: var(--danger-soft); }
.outputSucceeded { color: var(--success); background: var(--success-soft); }
.elapsed { font-variant-numeric: tabular-nums; }
.raw-output {
  flex: 1;
  max-height: 55vh;
  overflow: auto;
  margin: 0;
  padding: 12px 14px;
  font: 12px/1.6 var(--font-mono);
  white-space: pre;
}
.error-output { color: var(--danger); }
.output-empty { margin: auto; padding: 14px; color: var(--text-2); font-size: 13px; text-align: center; }
</style>
