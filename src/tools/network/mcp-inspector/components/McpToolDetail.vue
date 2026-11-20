<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { Braces, ChevronRight, Play } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import SplitPane from "@/components/common/SplitPane.vue";
import TextPane from "@/components/common/TextPane.vue";
import { recordToolUsage } from "@/composables/toolLibrary";
import { errorMessage, showError } from "@/utils/errorToast";
import { parseToolArguments, type McpConfig, type McpTool } from "../config";
import { testing } from "../workspace";

const props = defineProps<{ config: McpConfig; tool: McpTool }>();
const { t } = useI18n();
const input = ref("{}");
const response = shallowRef<{ isError?: boolean; [key: string]: unknown }>();
const failure = ref("");
const running = ref(false);
const args = computed(() => parseToolArguments(input.value));
const output = computed(() => response.value ? JSON.stringify(response.value, null, 2) : "");
let active = true;
onBeforeUnmount(() => { active = false; });

async function testTool() {
  if (testing.value || !args.value) return;
  testing.value = true;
  running.value = true;
  response.value = undefined;
  failure.value = "";
  try {
    const result = await invoke<NonNullable<typeof response.value>>("mcp_call_tool", {
      config: props.config,
      name: props.tool.name,
      arguments: args.value,
    });
    recordToolUsage();
    if (active) response.value = result;
  } catch (error) {
    if (!active) return;
    failure.value = errorMessage(error);
    showError(error, t("network.mcp.callFailed"));
  } finally {
    running.value = false;
    testing.value = false;
  }
}
</script>

<template>
  <div class="detail">
    <section class="tool-info" :aria-label="t('network.mcp.details')">
      <code v-if="tool.title && tool.title !== tool.name" class="tool-id">{{ tool.name }}</code>
      <p v-if="tool.description" class="description">{{ tool.description }}</p>
      <div class="schemas">
        <details>
          <summary>
            <Braces :size="15" aria-hidden="true" />
            {{ t("network.mcp.inputSchema") }}
            <ChevronRight :size="14" class="schema-chevron" aria-hidden="true" />
          </summary>
          <pre>{{ JSON.stringify(tool.inputSchema, null, 2) }}</pre>
        </details>
        <details v-if="tool.outputSchema">
          <summary>
            <Braces :size="15" aria-hidden="true" />
            {{ t("network.mcp.outputSchema") }}
            <ChevronRight :size="14" class="schema-chevron" aria-hidden="true" />
          </summary>
          <pre>{{ JSON.stringify(tool.outputSchema, null, 2) }}</pre>
        </details>
      </div>
    </section>
    <section class="tester" :aria-label="t('network.mcp.test')">
      <header class="test-bar">
        <button type="button" class="btn primary" :disabled="testing || !args" @click="testTool">
          <Play :size="16" aria-hidden="true" />
          {{ t("network.mcp.test") }}
        </button>
        <div class="test-status">
          <span v-if="running" role="status">{{ t("network.mcp.testing") }}</span>
          <span v-else-if="testing" role="status">{{ t("network.mcp.testPending") }}</span>
          <span v-else-if="response" role="status" :class="response.isError ? 'error' : 'success'">
            {{ t(response.isError ? "network.mcp.toolError" : "network.mcp.testComplete") }}
          </span>
          <span v-if="!args" class="error" role="alert">{{ t("network.mcp.invalidArgs") }}</span>
        </div>
      </header>
      <SplitPane class="test-panes" storage-key="mcp-inspector-test" :default-ratio="0.45">
        <template #left>
          <TextPane v-model="input" :label="t('network.mcp.arguments')" language="json" />
        </template>
        <template #right>
          <TextPane v-if="response" :model-value="output" :label="t('network.mcp.output')" language="json" readonly />
          <TextPane v-else :label="t('network.mcp.output')">
            <template #body>
              <p v-if="failure" class="output-message error" role="alert">{{ failure }}</p>
              <p v-else class="output-message output-empty">{{ t(running ? "network.mcp.testing" : "network.mcp.outputEmpty") }}</p>
            </template>
          </TextPane>
        </template>
      </SplitPane>
    </section>
  </div>
</template>

<style scoped>
.detail { display: flex; flex: 1; flex-direction: column; gap: 20px; }
.tool-info { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.tool-id {
  align-self: flex-start;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--bg-sunken);
  font: 12px/1.5 var(--font-mono);
  overflow-wrap: anywhere;
}
.description {
  max-width: 70ch;
  margin: 0;
  color: var(--text-2);
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.schemas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 194px), 1fr)); align-items: start; gap: 10px; }
details {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  font-size: 13px;
}
summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 8px 12px;
  border-radius: var(--radius);
  list-style: none;
  cursor: pointer;
}
summary::-webkit-details-marker { display: none; }
summary:hover { background: var(--hover); }
summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
summary svg { flex: none; color: var(--text-2); }
.schema-chevron { margin-inline-start: auto; transition: transform var(--dur-fast) var(--ease-out); }
details[open] .schema-chevron { transform: rotate(90deg); }
pre {
  max-height: 230px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border-top: 1px solid var(--border);
  font: 12px/1.55 var(--font-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.tester { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.test-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding-block: 14px;
  border-top: 1px solid var(--border);
}
.test-bar .btn { min-height: 38px; justify-content: center; }
.test-status { display: flex; flex-wrap: wrap; gap: 6px 12px; color: var(--text-2); font-size: 13px; }
.test-panes { min-height: 280px; }
.output-message { margin: 0; padding: 14px; color: var(--text-2); font-size: 13px; overflow-wrap: anywhere; }
.output-empty { margin: auto 0; text-align: center; }
.error { color: var(--danger); }
.success { color: var(--success); }
@container (min-width: 900px) {
  .detail { display: grid; grid-template-columns: minmax(0, 1fr) minmax(225px, 27%); gap: 24px; }
  .tool-info { grid-area: 1 / 2; padding-inline-start: 22px; border-inline-start: 1px solid var(--border); }
  .tester { grid-area: 1 / 1; }
  .schemas { grid-template-columns: minmax(0, 1fr); }
  .test-bar { padding-block-start: 0; border-top: 0; }
}
</style>
