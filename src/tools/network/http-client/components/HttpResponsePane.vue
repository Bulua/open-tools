<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, Download, LoaderCircle } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import { useClipboard } from "@/composables/useClipboard";
import { formatBytes } from "@/utils/format";
import { saveFile } from "@/utils/saveFile";
import {
  decodeText,
  detectKind,
  headerValue,
  hexDump,
  prettyJson,
  responseFileName,
  statusText,
  type HttpResponse,
} from "../http";

const props = defineProps<{ response: HttpResponse | null; sending: boolean; requestUrl: string }>();
const { t } = useI18n();

type ResTab = "preview" | "raw" | "headers";
const resTab = ref<ResTab>("preview");
const contentType = computed(() => (props.response ? headerValue(props.response.headers, "content-type") : ""));
const kind = computed(() => (props.response ? detectKind(contentType.value, props.response.body) : null));
const isTextual = computed(() => !!kind.value && ["json", "html", "xml", "text"].includes(kind.value.kind));
/** 文本太大时只显示前 2 MB，避免界面卡顿 */
const PREVIEW_LIMIT = 2 * 1024 * 1024;
const truncated = computed(() => !!props.response && isTextual.value && props.response.body.length > PREVIEW_LIMIT);
const text = computed(() => {
  const r = props.response;
  if (!r || !isTextual.value) return "";
  return decodeText(truncated.value ? r.body.subarray(0, PREVIEW_LIMIT) : r.body, contentType.value);
});
const previewText = computed(() => (kind.value?.kind === "json" && !truncated.value ? prettyJson(text.value) : text.value));
const rawText = computed(() => (props.response ? (isTextual.value ? text.value : hexDump(props.response.body)) : ""));
const { copied: headersCopied, copy: copyHeaders } = useClipboard();
const headersText = computed(() => props.response?.headers.map(([k, v]) => `${k}: ${v}`).join("\n") ?? "");

// 图片、音视频、PDF 用 blob 地址显示
const blobUrl = ref("");
watch(() => props.response, () => {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = "";
  const r = props.response;
  const k = kind.value;
  if (r && k && ["image", "audio", "video", "pdf"].includes(k.kind)) blobUrl.value = URL.createObjectURL(new Blob([r.body as Uint8Array<ArrayBuffer>], { type: k.mime }));
  resTab.value = r && r.body.length === 0 ? "headers" : "preview";
}, { immediate: true });
onBeforeUnmount(() => blobUrl.value && URL.revokeObjectURL(blobUrl.value));
const imageSize = ref("");

const fileName = computed(() => (props.response && kind.value ? responseFileName(props.response.headers, props.response.url, kind.value.mime) : ""));
const save = () => props.response && saveFile(props.response.body, fileName.value);
const statusClass = computed(() => {
  const s = props.response?.status ?? 0;
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
  <section class="pane-box">
    <div class="res-head">
      <template v-if="response">
        <span class="status" :class="statusClass">{{ response.status }} {{ response.statusText || statusText(response.status) }}</span>
        <span class="meta">{{ Math.round(response.time) }} ms</span>
        <span class="meta">{{ formatBytes(response.body.length) }}</span>
        <span v-if="kind" class="meta kind">{{ KIND_LABEL[kind.kind] }}</span>
        <div class="tabs push">
          <button :class="{ on: resTab === 'preview' }" @click="resTab = 'preview'">{{ t("network.preview") }}</button>
          <button :class="{ on: resTab === 'raw' }" @click="resTab = 'raw'">{{ t("network.raw") }}</button>
          <button :class="{ on: resTab === 'headers' }" @click="resTab = 'headers'">{{ t("network.responseHeaders") }}<em>{{ response.headers.length }}</em></button>
        </div>
        <button class="btn small primary" :disabled="!response.body.length" :title="t('network.saveAs', { name: fileName })" @click="save"><Download :size="13" />{{ t("network.save") }}</button>
      </template>
      <span v-else class="res-title">{{ t("network.response") }}</span>
    </div>

    <div v-if="sending" class="state"><LoaderCircle :size="18" class="spin" />{{ t("network.requesting") }}</div>
    <div v-else-if="!response" class="state">
      <p>{{ t("network.emptyHint") }}</p>
      <p class="sub">{{ t("network.emptySub") }}</p>
    </div>

    <template v-else>
      <p v-if="response.url !== requestUrl && response.url && resTab !== 'headers'" class="redirect" :title="response.url">{{ t("network.redirectedTo", { url: response.url }) }}</p>
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

<style scoped>
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
  padding: 0;
}
.tabs button {
  position: relative;
  padding: 4px 8px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--text-2);
  font-size: 12px;
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
.btn.ok {
  color: var(--success);
}
.btn.small {
  align-self: flex-start;
}
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
