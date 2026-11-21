<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { Play, RotateCcw } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { recordToolUsage } from "@/composables/toolLibrary";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { errorMessage, showError } from "@/utils/errorToast";
import { parseToolArguments, type McpConfig, type McpTool } from "../config";
import { testing } from "../workspace";
import McpJsonInput from "./McpJsonInput.vue";
import McpToolOutput from "./McpToolOutput.vue";

const props = defineProps<{ config: McpConfig; tool: McpTool }>();
const { t } = useI18n();
const input = ref("{}");
const response = shallowRef<{ isError?: boolean; [key: string]: unknown }>();
const failure = ref("");
const running = ref(false);
const elapsed = ref<number>();
const args = computed(() => parseToolArguments(input.value));
let active = true;
onBeforeUnmount(() => { active = false; });

useWindowEvent("keydown", (event) => {
  if (!event.ctrlKey || event.key !== "Enter" || event.repeat || event.isComposing || document.querySelector("dialog[open]")) return;
  event.preventDefault();
  void testTool();
});

function resetArguments() {
  if (testing.value) return;
  input.value = "{}";
}

async function testTool() {
  const request = args.value;
  if (testing.value || !request) return;
  testing.value = true;
  running.value = true;
  response.value = undefined;
  failure.value = "";
  elapsed.value = undefined;
  const start = performance.now();
  try {
    const result = await invoke<NonNullable<typeof response.value>>("mcp_call_tool", {
      config: props.config,
      name: props.tool.name,
      arguments: request,
    });
    recordToolUsage();
    if (active) response.value = result;
  } catch (error) {
    if (!active) return;
    failure.value = errorMessage(error);
    showError(error, t("network.mcp.callFailed"));
  } finally {
    elapsed.value = performance.now() - start;
    running.value = false;
    testing.value = false;
  }
}
</script>

<template>
  <div class="detail">
    <section class="argument-pane" :aria-label="t('network.mcp.arguments')">
      <header class="argument-head">
        <h3>{{ t("network.mcp.arguments") }}</h3>
      </header>
      <McpJsonInput v-model="input" :label="t('network.mcp.arguments')" hide-label />
      <footer class="argument-footer">
        <p v-if="!args" class="error" role="alert">{{ t("network.mcp.invalidArgs") }}</p>
        <div class="argument-actions">
          <button type="button" class="btn primary" :disabled="testing || !args" aria-keyshortcuts="Control+Enter" @click="testTool">
            <Play :size="15" aria-hidden="true" />
            {{ t("network.mcp.runTool") }}
          </button>
          <button type="button" class="btn subtle" :disabled="testing" @click="resetArguments">
            <RotateCcw :size="14" aria-hidden="true" />
            {{ t("network.mcp.resetArguments") }}
          </button>
          <kbd>{{ t("network.mcp.runShortcut") }}</kbd>
        </div>
      </footer>
    </section>
    <McpToolOutput :response="response" :failure="failure" :running="running" :pending="testing" :elapsed="elapsed" />
  </div>
</template>

<style scoped>
.detail {
  display: grid;
  grid-template-columns: clamp(380px, 38%, 420px) minmax(0, 1fr);
  flex: 1;
  min-width: 0;
  min-height: 320px;
  gap: 12px;
}
.argument-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.argument-head {
  display: flex;
  flex: none;
  align-items: center;
  min-height: 46px;
  padding: 6px 10px 6px 14px;
  border-bottom: 1px solid var(--border);
}
.argument-head h3 { margin: 0; font-size: 13px; font-weight: 600; }
.argument-footer { flex: none; padding: 8px 12px; border-top: 1px solid var(--border); }
.argument-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.argument-actions kbd { margin-inline-start: auto; color: var(--text-2); font: 11px var(--font-mono); }
.error { margin: 0 0 6px; color: var(--danger); font-size: 12px; }
@container (max-width: 760px) {
  .detail { flex: none; grid-template-columns: minmax(0, 1fr); grid-auto-rows: clamp(280px, 52vh, 520px); }
}
</style>
