<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { Play, RotateCcw } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { recordToolUsage } from "@/composables/toolLibrary";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { errorMessage, showError } from "@/utils/errorToast";
import { parseToolArguments, type McpTool } from "../config";
import { draftsFromArgs, fieldsFromSchema, initialDrafts, readDrafts, type ArgumentDraft } from "../toolArguments";
import { testing } from "../workspace";
import McpArgumentForm from "./McpArgumentForm.vue";
import McpJsonInput from "./McpJsonInput.vue";
import McpToolOutput from "./McpToolOutput.vue";

const props = defineProps<{ sessionId: string; tool: McpTool }>();
const { t } = useI18n();
const fields = computed(() => fieldsFromSchema(props.tool.inputSchema));
const drafts = shallowRef(initialDrafts(fields.value ?? []));
const form = computed(() => readDrafts(fields.value ?? [], drafts.value));
const jsonMode = ref(!fields.value);
const input = ref(JSON.stringify(form.value.args, null, 2));
const submitted = ref(false);
const modeChanged = ref(false);
const switchError = ref<"fixFormBeforeJson" | "cannotUseForm">();
const showingResult = ref(false);
const response = shallowRef<{ isError?: boolean; [key: string]: unknown }>();
const failure = ref("");
const running = ref(false);
const elapsed = ref<number>();
const jsonArgs = computed(() => parseToolArguments(input.value));
let active = true;
onBeforeUnmount(() => { active = false; });

useWindowEvent("keydown", (event) => {
  if (showingResult.value || !event.ctrlKey || event.key !== "Enter" || event.repeat || event.isComposing || document.querySelector("dialog[open]")) return;
  event.preventDefault();
  void testTool();
});

function resetArguments() {
  if (testing.value) return;
  drafts.value = initialDrafts(fields.value ?? []);
  input.value = JSON.stringify(form.value.args, null, 2);
  submitted.value = false;
  switchError.value = undefined;
}

function updateDraft(name: string, value: ArgumentDraft | undefined) {
  if (value === undefined) drafts.value.delete(name);
  else drafts.value.set(name, value);
  drafts.value = new Map(drafts.value);
  switchError.value = undefined;
}

function toggleMode() {
  if (testing.value || !fields.value) return;
  if (jsonMode.value) {
    const next = jsonArgs.value && draftsFromArgs(fields.value, jsonArgs.value);
    if (!next) {
      switchError.value = "cannotUseForm";
      return;
    }
    drafts.value = next;
  } else {
    if ([...form.value.errors.values()].includes("invalidField")) {
      submitted.value = true;
      switchError.value = "fixFormBeforeJson";
      return;
    }
    input.value = JSON.stringify(form.value.args, null, 2);
  }
  submitted.value = false;
  switchError.value = undefined;
  modeChanged.value = true;
  jsonMode.value = !jsonMode.value;
}

async function testTool() {
  if (testing.value || showingResult.value) return;
  submitted.value = true;
  const request = jsonMode.value ? jsonArgs.value : form.value.errors.size ? undefined : form.value.args;
  if (!request) return;
  testing.value = true;
  running.value = true;
  response.value = undefined;
  failure.value = "";
  elapsed.value = undefined;
  const start = performance.now();
  try {
    const result = await invoke<NonNullable<typeof response.value>>("mcp_call_tool", {
      sessionId: props.sessionId,
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
    if (active) {
      elapsed.value = performance.now() - start;
      running.value = false;
      modeChanged.value = false;
      showingResult.value = true;
    }
    testing.value = false;
  }
}
</script>

<template>
  <div class="detail" :class="{ 'editing-arguments': !showingResult }">
    <McpToolOutput v-if="showingResult" :response="response" :failure="failure" :elapsed="elapsed" @back="showingResult = false" />
    <section v-else class="argument-pane" :class="{ 'form-mode': !jsonMode, 'empty-form': !jsonMode && fields?.length === 0 }"
      :aria-label="t('network.mcp.requestParameters')">
      <header v-if="fields" class="argument-head">
        <span>{{ t("network.mcp.editAsJson") }}</span>
        <button type="button" class="control-switch" role="switch" :aria-checked="jsonMode" :disabled="testing"
          :aria-label="t('network.mcp.editAsJson')" @click="toggleMode"><span /></button>
      </header>
      <p v-if="switchError" class="error" role="alert">{{ t("network.mcp." + switchError) }}</p>
      <div class="argument-scroll" :class="{ 'mode-changed': modeChanged }">
        <McpJsonInput v-if="jsonMode" v-model="input" class="argument-editor" :label="t('network.mcp.arguments')" hide-label
          @update:model-value="switchError = undefined" />
        <McpArgumentForm v-else-if="fields" class="argument-fields" :fields="fields" :drafts="drafts"
          :errors="form.errors" :submitted="submitted" @update="updateDraft" />
      </div>
      <footer class="argument-footer">
        <p v-if="jsonMode && !jsonArgs" class="error" role="alert">{{ t("network.mcp.invalidArgs") }}</p>
        <div class="argument-actions">
          <div class="argument-buttons">
            <button type="button" class="btn primary" :disabled="testing || (jsonMode && !jsonArgs)" aria-keyshortcuts="Control+Enter" @click="testTool">
              <Play :size="15" aria-hidden="true" />
              {{ t(running ? "network.mcp.testing" : testing ? "network.mcp.testPending" : "network.mcp.runTool") }}
            </button>
            <button type="button" class="btn subtle" :disabled="testing" @click="resetArguments">
              <RotateCcw :size="14" aria-hidden="true" />
              {{ t("network.mcp.resetArguments") }}
            </button>
            <kbd>{{ t("network.mcp.runShortcut") }}</kbd>
          </div>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.detail { min-width: 0; border-top: 1px solid var(--border); }
.editing-arguments { display: flex; flex-direction: column; min-height: 0; }
.argument-pane {
  --form-max-width: 620px;
  --argument-columns: minmax(78px, 22%) minmax(0, 1fr);
  --argument-column-gap: 12px;
  --argument-warning-space: 118px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 12px;
  padding-top: 10px;
}
.form-mode > .error, .argument-fields, .form-mode .argument-actions {
  width: 100%;
  max-width: var(--form-max-width);
  margin-inline: auto;
}
.argument-head {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-height: 28px;
  font-size: 12px;
  color: var(--text-2);
}
.argument-scroll { min-height: 0; max-height: min(54vh, 520px); overflow: auto; scrollbar-width: thin; padding: 3px; }
.form-mode :is(.argument-scroll, .argument-footer) {
  margin-inline: calc(-1 * var(--mcp-details-padding, 0px));
  padding-inline: max(3px, var(--mcp-details-padding, 0px));
  scrollbar-gutter: stable both-edges;
}
.form-mode .argument-scroll { padding-block-start: 8px; }
.argument-editor { height: clamp(140px, 37vh, 380px); border: 1px solid var(--border); border-radius: var(--radius); }
.argument-footer { flex: none; }
.form-mode .argument-footer { overflow: hidden; }
.form-mode .argument-actions { display: grid; grid-template-columns: var(--argument-columns); column-gap: var(--argument-column-gap); }
.argument-buttons { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 0 2px; border-top: 1px solid var(--border); }
.form-mode .argument-buttons { grid-column: -2 / -1; margin-inline-end: var(--argument-warning-space); }
.argument-buttons kbd { margin-inline-start: auto; color: var(--text-2); font: 11px var(--font-mono); }
.empty-form .argument-actions { display: flex; justify-content: center; }
.empty-form .argument-buttons { justify-content: center; margin-inline-end: 0; }
.empty-form .argument-buttons kbd { margin-inline-start: 0; }
.mode-changed > :is(.argument-editor, .argument-fields) {
  animation: argument-mode-in var(--dur-slow) var(--ease-out);
}
@keyframes argument-mode-in {
  from { translate: 0 12px; }
  to { translate: 0 0; }
}
.error { margin: 0 0 6px; color: var(--danger); font-size: 12px; }
@container mcp-details (max-width: 460px) {
  .argument-pane { --argument-warning-space: 0px; }
}
@container mcp-details (max-width: 340px) {
  .argument-pane { --argument-columns: minmax(0, 1fr); }
}
</style>
