<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, Download, FileInput, History, LoaderCircle, Send, Square, Trash2, Upload, X } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import SplitPane from "@/components/common/SplitPane.vue";
import TextPane from "@/components/common/TextPane.vue";
import { useClipboard } from "@/composables/useClipboard";
import { usePopover } from "@/composables/usePopover";
import { useStoredRef } from "@/composables/useStoredRef";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { saveFile } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import KeyValueEditor from "./KeyValueEditor.vue";
import { parseInput } from "../headers";
import {
  METHODS,
  applyQuery,
  decodeText,
  detectKind,
  emptyRow,
  forHistory,
  fromParsed,
  headerValue,
  hexDump,
  newRequest,
  parseQuery,
  prettyJson,
  responseFileName,
  sendMode,
  sendRequest,
  statusText,
  toCurlCommand,
  type BodyType,
  type HistoryEntry,
  type HttpResponse,
  type RequestModel,
} from "../http";

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
const error = ref("");
let controller: AbortController | null = null;

const history = useStoredRef<HistoryEntry[]>("http.history", []);
const send = async () => {
  if (sending.value) return;
  sending.value = true;
  error.value = "";
  controller = new AbortController();
  const entry: HistoryEntry = { id: Date.now(), time: Date.now(), status: null, request: forHistory(req.value) };
  try {
    response.value = await sendRequest(req.value, controller.signal);
    entry.status = response.value.status;
  } catch (e) {
    response.value = null;
    error.value = e instanceof Error ? e.message : String(e);
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
    error.value = e instanceof Error ? e.message : String(e);
  }
};

// ---------- 响应 ----------
type ResTab = "preview" | "raw" | "headers";
const resTab = ref<ResTab>("preview");
const contentType = computed(() => (response.value ? headerValue(response.value.headers, "content-type") : ""));
const kind = computed(() => (response.value ? detectKind(contentType.value, response.value.body) : null));
const isTextual = computed(() => !!kind.value && ["json", "html", "xml", "text"].includes(kind.value.kind));
/** 文本太大时只显示前 2 MB，避免界面卡顿 */
const PREVIEW_LIMIT = 2 * 1024 * 1024;
const truncated = computed(() => !!response.value && isTextual.value && response.value.body.length > PREVIEW_LIMIT);
const text = computed(() => {
  const r = response.value;
  if (!r || !isTextual.value) return "";
  return decodeText(truncated.value ? r.body.subarray(0, PREVIEW_LIMIT) : r.body, contentType.value);
});
const previewText = computed(() => (kind.value?.kind === "json" && !truncated.value ? prettyJson(text.value) : text.value));
const rawText = computed(() => (response.value ? (isTextual.value ? text.value : hexDump(response.value.body)) : ""));
const { copied: headersCopied, copy: copyHeaders } = useClipboard();
const headersText = computed(() => response.value?.headers.map(([k, v]) => `${k}: ${v}`).join("\n") ?? "");

// 图片、音视频、PDF 用 blob 地址显示
const blobUrl = ref("");
watch([response, kind], () => {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = "";
  const r = response.value;
  const k = kind.value;
  if (r && k && ["image", "audio", "video", "pdf"].includes(k.kind)) blobUrl.value = URL.createObjectURL(new Blob([r.body as Uint8Array<ArrayBuffer>], { type: k.mime }));
  resTab.value = r && r.body.length === 0 ? "headers" : "preview";
});
onBeforeUnmount(() => blobUrl.value && URL.revokeObjectURL(blobUrl.value));
const imageSize = ref("");

const fileName = computed(() => (response.value && kind.value ? responseFileName(response.value.headers, response.value.url, kind.value.mime) : ""));
const save = () => response.value && saveFile(response.value.body, fileName.value);
const statusClass = computed(() => {
  const s = response.value?.status ?? 0;
  return s >= 500 ? "s5" : s >= 400 ? "s4" : s >= 300 ? "s3" : "s2";
});
const KIND_LABEL = computed(() => ({
  json: "JSON",
  html: t("network.kindHtml"),
  xml: "XML",
  text: t("network.text"),
  image: t("network.kindImage"),
  audio: t("network.kindAudio"),
  video: t("network.kindVideo"),
  pdf: "PDF",
  binary: t("network.file"),
}));
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
        <section class="pane-box">
          <div class="res-head">
            <template v-if="response">
              <span class="status" :class="statusClass">{{ response.status }} {{ response.statusText || statusText(response.status) }}</span>
              <span class="meta">{{ Math.round(response.time) }} ms</span>
              <span class="meta">{{ formatBytes(response.body.length) }}</span>
              <span v-if="kind" class="meta kind">{{ KIND_LABEL[kind.kind] }}</span>
              <div class="tabs small push">
                <button :class="{ on: resTab === 'preview' }" @click="resTab = 'preview'">{{ t("network.preview") }}</button>
                <button :class="{ on: resTab === 'raw' }" @click="resTab = 'raw'">{{ t("network.raw") }}</button>
                <button :class="{ on: resTab === 'headers' }" @click="resTab = 'headers'">{{ t("network.responseHeaders") }}<em>{{ response.headers.length }}</em></button>
              </div>
              <button class="btn small primary" :disabled="!response.body.length" :title="t('network.saveAs', { name: fileName })" @click="save"><Download :size="13" />{{ t("network.save") }}</button>
            </template>
            <span v-else class="res-title">{{ t("network.response") }}</span>
          </div>

          <div v-if="sending" class="state"><LoaderCircle :size="18" class="spin" />{{ t("network.requesting") }}</div>
          <div v-else-if="error" class="state error">{{ error }}</div>
          <div v-else-if="!response" class="state">
            <p>{{ t("network.emptyHint") }}</p>
            <p class="sub">{{ t("network.emptySub") }}</p>
          </div>

          <template v-else>
            <p v-if="response.url !== req.url && response.url && resTab !== 'headers'" class="redirect" :title="response.url">{{ t("network.redirectedTo", { url: response.url }) }}</p>
            <p v-if="truncated && resTab !== 'headers'" class="redirect">{{ t("network.truncated") }}</p>

            <!-- 预览 -->
            <template v-if="resTab === 'preview' && kind">
              <TextPane v-if="kind.kind === 'json' || kind.kind === 'xml' || kind.kind === 'text'" :model-value="previewText" class="res-body" :label="t('network.content')" :language="kind.kind === 'json' ? 'json' : 'text'" readonly nowrap />
              <!-- 网页：不运行脚本，只显示页面 -->
              <iframe v-else-if="kind.kind === 'html'" class="frame" sandbox="" :srcdoc="text" :title="t('network.webPreview')" />
              <div v-else-if="kind.kind === 'image'" class="media checker">
                <img :src="blobUrl" alt="" @load="imageSize = `${($event.target as HTMLImageElement).naturalWidth} × ${($event.target as HTMLImageElement).naturalHeight}`" />
                <span v-if="imageSize" class="media-info">{{ imageSize }}</span>
              </div>
              <div v-else-if="kind.kind === 'audio'" class="media"><audio :src="blobUrl" controls /></div>
              <div v-else-if="kind.kind === 'video'" class="media"><video :src="blobUrl" controls /></div>
              <iframe v-else-if="kind.kind === 'pdf'" class="frame" :src="blobUrl" :title="t('network.pdfPreview')" />
              <div v-else class="binary">
                <p>
                  {{ response.body.length ? t("network.noPreview", { mime: kind.mime, name: fileName }) : t("network.emptyResponse") }}
                </p>
                <TextPane v-if="response.body.length" :model-value="hexDump(response.body, 1024)" class="res-body" :label="t('network.hexFirst')" language="text" readonly nowrap />
              </div>
            </template>
            <TextPane v-else-if="resTab === 'raw'" :model-value="rawText" class="res-body" :label="isTextual ? t('network.raw') : t('network.hex')" language="text" readonly nowrap />
            <div v-else class="headers-table">
              <button class="btn small subtle copy-headers" :class="{ ok: headersCopied }" @click="copyHeaders(headersText)">
                <Check v-if="headersCopied" :size="13" />
                <Copy v-else :size="13" />{{ t("network.copyAll") }}
              </button>
              <table>
                <tr v-for="([k, v], i) in response.headers" :key="i">
                  <th>{{ k }}</th>
                  <td>{{ v }}</td>
                </tr>
              </table>
            </div>
          </template>
        </section>
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
.tabs.small {
  padding: 0;
  border: none;
}
.tabs.small button {
  padding: 4px 8px;
  font-size: 12px;
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
/* 响应 */
.res-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.res-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
}
.status {
  padding: 2px 8px;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
}
.status.s2 {
  background: var(--success-soft);
  color: var(--success);
}
.status.s3 {
  background: var(--accent-soft);
  color: var(--accent);
}
.status.s4 {
  background: var(--warning-soft);
  color: var(--warning);
}
.status.s5 {
  background: var(--danger-soft, var(--warning-soft));
  color: var(--danger);
}
.meta {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.kind {
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
}
.push {
  margin-left: auto;
}
.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  font-size: 13px;
  color: var(--text-3);
  text-align: center;
}
.state p {
  margin: 0;
}
.state .sub {
  font-size: 12px;
}
.state.error {
  color: var(--danger);
  word-break: break-all;
}
.redirect {
  margin: 0;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.res-body {
  flex: 1;
  min-height: 0;
}
.frame {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: none;
  background: #fff;
}
.media {
  flex: 1;
  min-height: 0;
  position: relative;
  display: grid;
  place-items: center;
  padding: 16px;
  overflow: auto;
}
.media img,
.media video {
  max-width: 100%;
  max-height: 100%;
}
.media audio {
  width: min(480px, 100%);
}
.checker {
  background: repeating-conic-gradient(var(--bg-sunken) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
}
.media-info {
  position: absolute;
  right: 10px;
  bottom: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 11px;
}
.binary {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.binary > p {
  margin: 0;
  padding: 12px 14px;
  font-size: 13px;
  color: var(--text-2);
}
.headers-table {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 12px;
}
.headers-table table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.headers-table th,
.headers-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
  word-break: break-all;
}
.headers-table th {
  width: 32%;
  font-weight: 500;
  color: var(--text-2);
}
.copy-headers {
  margin: 4px 0 6px;
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
