<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppSelect from "@/components/common/AppSelect.vue";
import TextPane from "@/components/common/TextPane.vue";
import SplitPane from "@/components/common/SplitPane.vue";
import ToolActions from "@/components/tool/ToolActions.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { filterHeaders, parseInput, toCurl, toFetch, toHeaderText, toJson, toPython, type ParsedRequest } from "../headers";

/**
 * 请求头转换：粘贴浏览器复制的请求头、cURL 命令或 JSON，
 * 转成 JSON、cURL（bash / Windows CMD）、fetch、Python requests 或整理后的请求头。
 */
type Target = "json" | "curl" | "fetch" | "python" | "headers";
const { t } = useI18n();
const TARGETS = computed<{ value: Target; label: string }[]>(() => [
  { value: "json", label: "JSON" },
  { value: "curl", label: "cURL" },
  { value: "fetch", label: "fetch" },
  { value: "python", label: "Python" },
  { value: "headers", label: t("network.headers") },
]);

const input = ref("");
const target = useStoredRef<Target>("headers.target", "json");
const shell = useStoredRef<"bash" | "cmd">("headers.shell", "bash");
const dropCookie = useStoredRef("headers.dropCookie", false);
const dropAuto = useStoredRef("headers.dropAuto", true);

const parsed = computed<{ req: ParsedRequest | null; error: string }>(() => {
  try {
    return { req: parseInput(input.value), error: "" };
  } catch (e) {
    return { req: null, error: e instanceof Error ? e.message : String(e) };
  }
});

// 请求地址和方法可以手动修改；输入变化时用解析出的值覆盖
const method = ref("GET");
const url = ref("");
watch(
  () => parsed.value.req,
  (req) => {
    if (!req) return;
    method.value = req.method || (req.body ? "POST" : "GET");
    if (req.url) url.value = req.url;
  },
);

const headers = computed(() => (parsed.value.req ? filterHeaders(parsed.value.req.headers, { dropCookie: dropCookie.value, dropAuto: dropAuto.value }) : []));
const request = computed<ParsedRequest>(() => ({ ...(parsed.value.req ?? parseInput("")), method: method.value, url: url.value }));

const output = computed(() => {
  if (!parsed.value.req || parsed.value.req.source === "empty") return "";
  switch (target.value) {
    case "json":
      return toJson(headers.value);
    case "curl":
      return toCurl(request.value, headers.value, shell.value);
    case "fetch":
      return toFetch(request.value, headers.value);
    case "python":
      return toPython(request.value, headers.value);
    default:
      return toHeaderText(headers.value);
  }
});

const SOURCE_LABELS = computed(() => ({ headers: t("network.headers"), curl: t("network.curlCommand"), json: "JSON", empty: "" }));
const summary = computed(() => {
  const req = parsed.value.req;
  if (!req || req.source === "empty") return "";
  const removed = req.headers.length - headers.value.length;
  return (
    t("network.summary", { source: SOURCE_LABELS.value[req.source], n: req.headers.length }) +
    (removed ? t("network.summaryRemoved", { n: removed }) : "") +
    (req.body ? t("network.summaryBody", { n: req.body.length }) : "")
  );
});

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const SAMPLE = `POST /api/v1/login HTTP/1.1
Host: example.com
Accept: application/json, text/plain, */*
Content-Type: application/json;charset=UTF-8
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.demo
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)
Cookie: session=abc123; theme=light
Content-Length: 42`;

useToolResult(() => output.value);
</script>

<template>
  <ToolActions>
    <label class="check" :title="t('network.dropAutoTitle')"><input v-model="dropAuto" type="checkbox" />{{ t("network.dropAuto") }}</label>
    <label class="check"><input v-model="dropCookie" type="checkbox" />{{ t("network.dropCookie") }}</label>
  </ToolActions>

  <div class="headers">
    <section class="card bar">
      <AppSelect v-model="method" class="method" :options="METHODS.map((m) => ({ value: m, label: m }))" />
      <input v-model="url" class="field mono" spellcheck="false" :placeholder="t('network.urlPlaceholder')" />
      <span class="summary" :class="{ error: parsed.error }">{{ parsed.error || summary }}</span>
    </section>

    <SplitPane storage-key="headers" :default-ratio="0.45">
      <template #left>
        <TextPane v-model="input" :label="t('network.input')" language="text" :placeholder="t('network.headersPlaceholder')">
          <template #actions>
            <button v-if="!input" class="btn small subtle" @click="input = SAMPLE">{{ t("network.sample") }}</button>
          </template>
        </TextPane>
      </template>
      <template #right>
        <TextPane :model-value="output" :label="t('network.result')" readonly nowrap :language="target === 'json' ? 'json' : 'text'" :placeholder="t('network.resultPlaceholder')">
          <template #actions>
            <div v-if="target === 'curl'" class="seg">
              <button :class="{ on: shell === 'bash' }" title="macOS、Linux、Git Bash" @click="shell = 'bash'">bash</button>
              <button :class="{ on: shell === 'cmd' }" :title="t('network.cmdTitle')" @click="shell = 'cmd'">CMD</button>
            </div>
            <div class="seg">
              <button v-for="t in TARGETS" :key="t.value" :class="{ on: target === t.value }" @click="target = t.value">{{ t.label }}</button>
            </div>
          </template>
        </TextPane>
      </template>
    </SplitPane>
  </div>
</template>

<style scoped>
.headers {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bar {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
}
.bar :deep(.method) {
  flex: 0 0 110px;
  font-weight: 600;
}
.bar .mono {
  flex: 1;
  height: 34px;
}
.summary {
  flex: 0 1 auto;
  max-width: 40%;
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary.error {
  color: var(--danger);
}
.seg + .seg {
  margin-left: 6px;
}
</style>
