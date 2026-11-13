<script setup lang="ts">
import { recordToolUsage } from "@/composables/toolLibrary";
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, FileInput, History, Send, Square, Trash2, Upload, X } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import SplitPane from "@/components/common/SplitPane.vue";
import TextPane from "@/components/common/TextPane.vue";
import { useClipboard } from "@/composables/useClipboard";
import { usePopover } from "@/composables/usePopover";
import { useStoredRef } from "@/composables/useStoredRef";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { formatBytes } from "@/utils/format";
import { showError } from "@/utils/errorToast";
import HttpResponsePane from "./components/HttpResponsePane.vue";
import KeyValueEditor from "./components/KeyValueEditor.vue";
import { parseInput } from "../shared/parseRequest";
import { METHODS, applyQuery, emptyRow, forHistory, fromParsed, newRequest, parseQuery, prettyJson, sendRequest, toCurlCommand, type BodyType, type HistoryEntry, type HttpResponse, type RequestModel } from "./http";
import { sendMode } from "../shared/transport";

/**
 * HTTP 请求：发送任意 HTTP 请求，查看响应。
 * 请求：方法、网址、查询参数、请求头、认证（Bearer / Basic）、请求体（JSON、文本、表单、multipart 文件上传、二进制文件）。
 * 响应：按内容类型预览（JSON、网页、XML、文本、图片、音频、视频、PDF、其他文件显示十六进制），可以保存为文件。
 * 支持导入、复制 cURL 命令，自动保存最近的请求记录。Ctrl + Enter 发送。
 */
const req = ref<RequestModel>(newRequest());

// ---------- 网址与查询参数双向同步 ----------
let syncing = false;
watch(
  () => req.value.url,
  (url) => {
    if (syncing) return;
    syncing = true;
    // 网址里没有的停用参数保留在表格里
    const disabled = req.value.params.filter((p) => !p.enabled && p.key);
    req.value.params = [...parseQuery(url), ...disabled, emptyRow()];
    syncing = false;
  },
);
watch(
  () => req.value.params,
  (params) => {
    if (syncing) return;
    syncing = true;
    req.value.url = applyQuery(req.value.url, params);
    syncing = false;
  },
  { deep: true },
);

const METHOD_OPTIONS = METHODS.map((m) => ({ value: m, label: m }));
const methodColor = (m: string) => ({ GET: "get", POST: "post", PUT: "put", PATCH: "patch", DELETE: "delete" })[m] ?? "other";

// ---------- 请求设置 ----------
const { t } = useI18n();
type Tab = "params" | "headers" | "auth" | "body" | "settings";
const tab = useStoredRef<Tab>("http.tab", "params");
const count = (rows: { enabled: boolean; key: string }[]) => rows.filter((r) => r.enabled && r.key).length;
const TABS = computed<{ value: Tab; label: string; badge?: number | string }[]>(() => [
  { value: "params", label: t("network.params"), badge: count(req.value.params) || undefined },
  { value: "headers", label: t("network.headers"), badge: count(req.value.headers) || undefined },
  { value: "auth", label: t("network.auth"), badge: req.value.auth.type !== "none" ? "●" : undefined },
  { value: "body", label: t("network.body"), badge: req.value.bodyType !== "none" ? "●" : undefined },
  { value: "settings", label: t("network.settings") },
]);
const BODY_TYPES = computed<{ value: BodyType; label: string }[]>(() => [
  { value: "none", label: t("network.none") },
  { value: "json", label: "JSON" },
  { value: "text", label: t("network.text") },
  { value: "form", label: t("network.form") },
  { value: "multipart", label: t("network.multipart") },
  { value: "binary", label: t("network.file") },
]);
const TEXT_TYPES = ["text/plain", "application/xml", "text/html", "text/csv", "application/javascript"].map((t) => ({ value: t, label: t }));
const COMMON_HEADERS = [
  "Accept",
  "Accept-Language",
  "Authorization",
  "Cache-Control",
  "Content-Type",
  "Cookie",
  "If-None-Match",
  "Origin",
  "Range",
  "Referer",
  "User-Agent",
  "X-Requested-With",
];
const bodyIgnored = computed(() => (req.value.method === "GET" || req.value.method === "HEAD") && req.value.bodyType !== "none");
const jsonError = computed(() => {
  if (req.value.bodyType !== "json" || !req.value.bodyText.trim()) return "";
  try {
    JSON.parse(req.value.bodyText);
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
});
const formatJsonBody = () => (req.value.bodyText = prettyJson(req.value.bodyText));
const pickBinary = (e: Event) => {
  const input = e.target as HTMLInputElement;
  req.value.binary = input.files?.[0] ?? null;
  input.value = "";
};
const mode = sendMode();

// ---------- 发送 ----------
const response = shallowRef<HttpResponse | null>(null);
const sending = ref(false);
let controller: AbortController | null = null;

const history = useStoredRef<HistoryEntry[]>("http.history", []);
const send = async () => {
  if (sending.value) return;
  sending.value = true;
  controller = new AbortController();
  const entry: HistoryEntry = { id: Date.now(), time: Date.now(), status: null, request: forHistory(req.value) };
  try {
    response.value = await sendRequest(req.value, controller.signal);
    entry.status = response.value.status;
    recordToolUsage();
  } catch (e) {
    response.value = null;
    showError(e);
  } finally {
    sending.value = false;
    controller = null;
    // 同样的请求只保留最新一条，最多 30 条
    const key = (r: RequestModel) => `${r.method} ${r.url}`;
    history.value = [entry, ...history.value.filter((h) => key(h.request) !== key(entry.request))].slice(0, 30);
  }
};
const cancel = () => controller?.abort();
useWindowEvent("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    send();
  }
});

// ---------- 历史记录 ----------
const historyBtn = ref<HTMLButtonElement>();
const historyPanel = ref<HTMLDivElement>();
const { open: historyOpen, style: historyStyle, toggle: toggleHistory, close: closeHistory } = usePopover(historyBtn, historyPanel, { minWidth: 420, maxHeight: 420 });
const restore = (h: HistoryEntry) => {
  syncing = true;
  req.value = { ...newRequest(), ...JSON.parse(JSON.stringify(h.request)) };
  syncing = false;
  closeHistory();
};
const ago = (time: number) => {
  const s = Math.round((Date.now() - time) / 1000);
  if (s < 60) return t("network.justNow");
  if (s < 3600) return t("network.minutesAgo", { n: Math.floor(s / 60) });
  if (s < 86400) return t("network.hoursAgo", { n: Math.floor(s / 3600) });
  return new Date(time).toLocaleDateString();
};

// ---------- 导入 / 复制 cURL ----------
const importBtn = ref<HTMLButtonElement>();
const importPanel = ref<HTMLDivElement>();
const { open: importOpen, style: importStyle, toggle: toggleImport, close: closeImport } = usePopover(importBtn, importPanel, { minWidth: 480, maxHeight: 360 });
const importText = ref("");
const importError = ref("");
const doImport = () => {
  importError.value = "";
  const parsed = parseInput(importText.value);
  if (!parsed.url) {
    importError.value = t("network.noUrlInCurl");
    return;
  }
  syncing = true;
  req.value = fromParsed(parsed);
  syncing = false;
  if (req.value.bodyType !== "none") tab.value = "body";
  importText.value = "";
  closeImport();
};
const { copied: curlCopied, copy } = useClipboard();
const copyCurl = () => {
  try {
    copy(toCurlCommand(req.value));
  } catch (e) {
    showError(e);
  }
};
</script>

<template>
  <div class="http">
    <!-- 地址栏 -->
    <div class="card bar">
      <!-- 下拉框组件默认占满宽度，放在固定宽度的容器里 -->
      <div class="method" :class="methodColor(req.method)">
        <AppSelect v-model="req.method" :options="METHOD_OPTIONS" :menu-width="120" />
      </div>
      <input v-model="req.url" class="field url" :placeholder="t('network.requestUrlPlaceholder')" spellcheck="false" @keydown.enter.exact="send" />
      <button v-if="!sending" class="btn primary send" :title="t('network.sendTitle')" @click="send"><Send :size="14" />{{ t("network.send") }}</button>
      <button v-else class="btn send" :title="t('network.cancelTitle')" @click="cancel"><Square :size="13" />{{ t("network.cancel") }}</button>
      <button ref="importBtn" class="btn subtle" :title="t('network.importTitle')" @click="toggleImport"><FileInput :size="14" />{{ t("network.import") }}</button>
      <button class="btn subtle" :class="{ ok: curlCopied }" :title="t('network.copyCurlTitle')" @click="copyCurl">
        <Check v-if="curlCopied" :size="14" />
        <Copy v-else :size="14" />cURL
      </button>
      <button ref="historyBtn" class="btn subtle" :title="t('network.historyTitle')" @click="toggleHistory"><History :size="14" />{{ t("network.history") }}</button>
    </div>

    <SplitPane storage-key="http-client" :default-ratio="0.45" :min="320">
      <!-- 请求 -->
      <template #left>
        <section class="pane-box">
          <div class="tabs">
            <button v-for="tb in TABS" :key="tb.value" :class="{ on: tab === tb.value }" @click="tab = tb.value">
              {{ tb.label }}<em v-if="tb.badge !== undefined">{{ tb.badge }}</em>
            </button>
          </div>
          <div class="tab-body">
            <template v-if="tab === 'params'">
              <p class="hint">{{ t("network.paramsHint") }}</p>
              <KeyValueEditor v-model="req.params" :key-placeholder="t('network.paramName')" :value-placeholder="t('network.paramValue')" />
            </template>

            <template v-else-if="tab === 'headers'">
              <p class="hint">
                {{ t("network.headersHint") }}
                <template v-if="mode === 'browser'">{{ t("network.browserHeadersHint") }}</template>
              </p>
              <KeyValueEditor v-model="req.headers" :key-placeholder="t('network.headerName')" :value-placeholder="t('network.value')" :suggestions="COMMON_HEADERS" />
            </template>

            <template v-else-if="tab === 'auth'">
              <div class="seg">
                <button :class="{ on: req.auth.type === 'none' }" @click="req.auth.type = 'none'">{{ t("network.none") }}</button>
                <button :class="{ on: req.auth.type === 'bearer' }" @click="req.auth.type = 'bearer'">Bearer Token</button>
                <button :class="{ on: req.auth.type === 'basic' }" @click="req.auth.type = 'basic'">{{ t("network.basic") }}</button>
              </div>
              <template v-if="req.auth.type === 'bearer'">
                <input v-model="req.auth.token" class="field mono" :placeholder="t('network.tokenPlaceholder')" spellcheck="false" />
                <p class="hint">{{ t("network.bearerHint") }}</p>
              </template>
              <template v-else-if="req.auth.type === 'basic'">
                <input v-model="req.auth.username" class="field" :placeholder="t('network.username')" spellcheck="false" />
                <input v-model="req.auth.password" class="field" type="password" :placeholder="t('network.password')" />
                <p class="hint">{{ t("network.basicHint") }}</p>
              </template>
              <p v-else class="hint">{{ t("network.authHint") }}</p>
            </template>

            <template v-else-if="tab === 'body'">
              <div class="seg wrap">
                <button v-for="b in BODY_TYPES" :key="b.value" :class="{ on: req.bodyType === b.value }" @click="req.bodyType = b.value">{{ b.label }}</button>
              </div>
              <p v-if="bodyIgnored" class="warn">{{ t("network.bodyIgnored", { method: req.method }) }}</p>
              <template v-if="req.bodyType === 'json'">
                <TextPane v-model="req.bodyText" class="body-editor" label="JSON" language="json" :placeholder="t('network.jsonBodyPlaceholder')">
                  <template #actions>
                    <button class="btn small subtle" :disabled="!!jsonError" @click="formatJsonBody">{{ t("network.format") }}</button>
                  </template>
                </TextPane>
                <p v-if="jsonError" class="warn">{{ t("network.jsonError", { error: jsonError }) }}</p>
              </template>
              <template v-else-if="req.bodyType === 'text'">
                <div class="row">
                  <span>{{ t("network.type") }}</span>
                  <AppSelect v-model="req.textType" :options="TEXT_TYPES" size="sm" />
                </div>
                <TextPane v-model="req.bodyText" class="body-editor" :label="t('network.content')" language="text" />
              </template>
              <template v-else-if="req.bodyType === 'form'">
                <p class="hint">{{ t("network.formHint") }}</p>
                <KeyValueEditor v-model="req.form" :key-placeholder="t('network.fieldName')" :value-placeholder="t('network.value')" />
              </template>
              <template v-else-if="req.bodyType === 'multipart'">
                <p class="hint">{{ t("network.multipartHint") }}</p>
                <KeyValueEditor v-model="req.multipart" :key-placeholder="t('network.fieldFile')" :value-placeholder="t('network.value')" allow-files />
              </template>
              <template v-else-if="req.bodyType === 'binary'">
                <p class="hint">{{ t("network.binaryHint") }}</p>
                <label class="pick">
                  <Upload :size="15" />
                  <span>{{ req.binary ? req.binary.name + t("network.paren", { text: formatBytes(req.binary.size) }) : t("network.chooseFile") }}</span>
                  <input type="file" hidden @change="pickBinary" />
                </label>
                <button v-if="req.binary" class="btn small subtle" @click="req.binary = null"><X :size="13" />{{ t("network.removeFile") }}</button>
              </template>
              <p v-else class="hint">{{ t("network.noBody") }}</p>
            </template>

            <template v-else>
              <div class="row">
                <span>{{ t("network.timeoutLabel") }}</span>
                <input v-model.number="req.timeout" class="field num" type="number" min="1" max="600" />
                <span>{{ t("network.seconds") }}</span>
              </div>
              <label class="check"><input v-model="req.followRedirects" type="checkbox" />{{ t("network.followRedirects") }}</label>
              <label class="check" :class="{ disabled: mode !== 'desktop' }">
                <input v-model="req.insecure" type="checkbox" :disabled="mode !== 'desktop'" />{{ t("network.insecure") }}
              </label>
              <p class="hint">
                {{
                  mode === "desktop"
                    ? t("network.modeDesktop")
                    : mode === "dev-proxy"
                      ? t("network.modeProxy")
                      : t("network.modeBrowser")
                }}
              </p>
              <button class="btn small subtle" @click="req = newRequest()"><Trash2 :size="13" />{{ t("network.resetAll") }}</button>
            </template>
          </div>
        </section>
      </template>

      <!-- 响应 -->
      <template #right>
        <HttpResponsePane :response="response" :sending="sending" :request-url="req.url" />
      </template>
    </SplitPane>

    <!-- 弹出层：历史记录、导入 cURL -->
    <Teleport to="body">
      <Transition name="pop">
        <div v-if="historyOpen" ref="historyPanel" class="popover history" :style="historyStyle">
          <div class="pop-head">
            {{ t("network.historyTitle") }}
            <button v-if="history.length" class="btn small subtle" @click="history = []"><Trash2 :size="12" />{{ t("network.clear") }}</button>
          </div>
          <p v-if="!history.length" class="pop-empty">{{ t("network.historyEmpty") }}</p>
          <button v-for="h in history" :key="h.id" class="history-item" @click="restore(h)">
            <span class="m" :class="methodColor(h.request.method)">{{ h.request.method }}</span>
            <span class="u" :title="h.request.url">{{ h.request.url }}</span>
            <span v-if="h.status" class="code" :class="h.status >= 400 ? 'bad' : 'good'">{{ h.status }}</span>
            <span v-else class="code bad">{{ t("network.failed") }}</span>
            <span class="t">{{ ago(h.time) }}</span>
          </button>
        </div>
      </Transition>
      <Transition name="pop">
        <div v-if="importOpen" ref="importPanel" class="popover import" :style="importStyle">
          <div class="pop-head">{{ t("network.importHead") }}</div>
          <textarea v-model="importText" class="field area" :placeholder="t('network.importPlaceholder')" spellcheck="false" />
          <p v-if="importError" class="warn">{{ importError }}</p>
          <button class="btn primary" :disabled="!importText.trim()" @click="doImport">{{ t("network.import") }}</button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.http {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bar {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 8px;
}
.method {
  flex: 0 0 116px;
}
.method :deep(.app-select) {
  color: inherit;
  font-weight: 600;
  font-family: var(--font-mono);
}
.url {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 13px;
}
.send {
  min-width: 84px;
  justify-content: center;
}
.btn.ok {
  color: var(--success);
}
.get {
  color: var(--success);
}
.post {
  color: var(--warning);
}
.put,
.patch {
  color: var(--accent);
}
.delete {
  color: var(--danger);
}
.pane-box {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.tabs {
  display: flex;
  gap: 2px;
  padding: 6px 10px 0;
  border-bottom: 1px solid var(--border);
}
.tabs button {
  position: relative;
  padding: 8px 12px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--text-2);
  font-size: 13px;
}
.tabs button:hover {
  color: var(--text);
}
.tabs button.on {
  color: var(--text);
  font-weight: 500;
  border-bottom-color: var(--accent);
}
.tabs em {
  margin-left: 4px;
  font-style: normal;
  font-size: 11px;
  color: var(--accent);
}
.tab-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}
.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}
.warn {
  margin: 0;
  font-size: 12px;
  color: var(--warning);
}
.seg.wrap {
  flex-wrap: wrap;
  align-self: flex-start;
}
.seg {
  align-self: flex-start;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-2);
}
.num {
  width: 90px;
}
.body-editor {
  flex: 1;
  min-height: 220px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.pick {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
}
.pick:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.check.disabled {
  opacity: 0.55;
}
.btn.small {
  align-self: flex-start;
}
</style>

<style>
/* 弹出层放在 body 下，不能用 scoped */
.popover.history,
.popover.import {
  position: fixed;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}
.popover.history {
  max-height: 420px;
  overflow: auto;
}
.popover .pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.popover .pop-head .btn.small {
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
}
.popover .pop-empty {
  margin: 8px 0;
  font-size: 12px;
  color: var(--text-3);
}
.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  text-align: left;
  font-size: 12.5px;
}
.history-item:hover {
  background: var(--hover);
}
.history-item .m {
  flex: 0 0 56px;
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 11.5px;
}
.history-item .m.get {
  color: var(--success);
}
.history-item .m.post {
  color: var(--warning);
}
.history-item .m.put,
.history-item .m.patch {
  color: var(--accent);
}
.history-item .m.delete {
  color: var(--danger);
}
.history-item .u {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  color: var(--text);
}
.history-item .code {
  font-family: var(--font-mono);
  font-size: 11.5px;
}
.history-item .code.good {
  color: var(--success);
}
.history-item .code.bad {
  color: var(--danger);
}
.history-item .t {
  flex-shrink: 0;
  font-size: 11.5px;
  color: var(--text-3);
}
.popover.import .area {
  height: 180px;
  padding: 8px 10px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 12px;
}
.popover.import .btn {
  align-self: flex-end;
}
.popover .warn {
  margin: 0;
  font-size: 12px;
  color: var(--warning);
}
</style>
