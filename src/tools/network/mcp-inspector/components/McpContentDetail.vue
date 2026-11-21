<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { FileText } from "lucide-vue-next";
import { computed, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import TextPane from "@/components/common/TextPane.vue";
import { errorMessage } from "@/utils/errorToast";
import type { McpEntry } from "../catalog";

const props = defineProps<{ sessionId: string; entry: Exclude<McpEntry, { kind: "tool" }> }>();
const { t } = useI18n();
const argumentsDraft = ref<Record<string, string>>(Object.create(null));
const uri = ref("");
const result = shallowRef<Record<string, unknown>>();
const error = ref("");
const loading = ref(false);
const output = computed(() => {
  if (!result.value) return;
  const contents = result.value.contents;
  if (props.entry.kind !== "prompt" && Array.isArray(contents) && contents.length === 1 && typeof contents[0]?.text === "string") {
    return { value: contents[0].text as string, language: undefined };
  }
  return { value: JSON.stringify(result.value, null, 2), language: "json" as const };
});

async function load() {
  if (loading.value) return;
  const { entry, sessionId } = props;
  const resourceUri = entry.kind === "resource" ? entry.value.uri : uri.value.trim();
  if (entry.kind !== "prompt" && !resourceUri) return;
  loading.value = true;
  error.value = "";
  result.value = undefined;
  try {
    result.value = entry.kind === "prompt"
      ? await invoke("mcp_get_prompt", {
          sessionId, name: entry.value.name,
          arguments: Object.fromEntries(Object.entries(argumentsDraft.value).filter(([, value]) => value !== "")),
        })
      : await invoke("mcp_read_resource", { sessionId, uri: resourceUri });
  } catch (issue) {
    error.value = errorMessage(issue);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="content-detail">
    <form class="entry-form" @submit.prevent="load">
      <code v-if="entry.kind !== 'prompt' && entry.detail">{{ entry.detail }}</code>
      <template v-if="entry.kind === 'prompt'">
        <label v-for="argument in entry.value.arguments" :key="argument.name" class="argument">
          <span>{{ argument.title || argument.name }} <span v-if="argument.required" class="required">*</span></span>
          <input v-model="argumentsDraft[argument.name]" class="field" :required="argument.required" :placeholder="argument.description" />
        </label>
      </template>
      <label v-else-if="entry.kind === 'template'" class="argument">
        <span>{{ t("network.mcp.resolvedUri") }}</span>
        <input v-model="uri" class="field" required :placeholder="entry.value.uriTemplate" spellcheck="false" />
      </label>
      <button class="btn primary" type="submit" :disabled="loading">
        <FileText :size="15" aria-hidden="true" />
        {{ t(entry.kind === "prompt" ? "network.mcp.getPrompt" : "network.mcp.readResource") }}
      </button>
    </form>
    <p v-if="loading" class="message" role="status">{{ t("network.mcp.loadingCatalog") }}</p>
    <p v-if="error" class="message required" role="alert">{{ error }}</p>
    <TextPane v-if="output" class="preview" :label="t('network.mcp.preview')" :model-value="output.value" :language="output.language" readonly />
  </div>
</template>

<style scoped>
.content-detail { display: flex; flex: 1; flex-direction: column; min-height: 0; gap: 14px; }
.entry-form { display: grid; justify-items: start; gap: 12px; max-width: 640px; }
.argument { display: grid; gap: 5px; width: 100%; min-width: 0; font-size: 13px; }
code { color: var(--text-2); font: 12px var(--font-mono); overflow-wrap: anywhere; }
.message { margin: 0; color: var(--text-2); font-size: 13px; overflow-wrap: anywhere; }
.required { color: var(--danger); }
.preview { min-height: 220px; }
</style>
