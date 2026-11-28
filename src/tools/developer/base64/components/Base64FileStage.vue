<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { CircleAlert, Download, FileDown, FileText, Info, RefreshCw, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import TextPane from "@/components/common/TextPane.vue";
import type { DecodedFile } from "../base64";
import type { Base64Direction, LoadedFile } from "../history";

const PREVIEW_LIMIT = 24_000;

/** 右侧文件/图片 Base64 编解码工作台：大图全宽预览 + 底部信息条 + 下方 Base64 输出 */
const props = defineProps<{
  direction: Base64Direction;
  file: LoadedFile | null;
  fileOutput: string;
  base64Input: string;
  fileName: string;
  decoded: { ok: true; file: DecodedFile } | { ok: false; message: string } | null;
  decodedPreviewUrl?: string;
  encodeInfo: { label: string; value: string }[];
  decodeInfo: { label: string; value: string }[];
  saved: boolean;
}>();

const emit = defineEmits<{
  "load-file": [file: File];
  "clear-file": [];
  "update:base64Input": [value: string];
  "update:fileName": [value: string];
  download: [];
}>();

const { t } = useI18n();
const dropZone = ref<InstanceType<typeof FileDropZone>>();

const isOutputTruncated = computed(() => props.fileOutput.length > PREVIEW_LIMIT);
const displayFileOutput = computed(() =>
  isOutputTruncated.value ? `${props.fileOutput.slice(0, PREVIEW_LIMIT)}\n…` : props.fileOutput,
);

defineExpose({
  openPicker: () => dropZone.value?.open(),
});
</script>

<template>
  <div class="file-stage">
    <!-- ========== 文件 → Base64 ========== -->
    <template v-if="direction === 'encode'">
      <section v-if="file" class="card file-card">
        <header class="card-title">
          <span class="file-name" :title="file.name">{{ file.name }}</span>
          <button type="button" class="btn small subtle" :title="t('encode.replaceFile')" @click="dropZone?.open()">
            <RefreshCw :size="14" />{{ t("encode.replace") }}
          </button>
          <button type="button" class="icon-btn" :title="t('encode.clear')" @click="emit('clear-file')">
            <X :size="14" />
          </button>
        </header>

        <div v-if="file.mime.startsWith('image/')" class="preview checker">
          <img :src="file.objectUrl || file.dataUri" :alt="t('encode.preview')" />
        </div>
        <div v-else class="preview file-icon">
          <span class="file-badge"><FileText :size="26" :stroke-width="1.5" /></span>
          <span class="preview-name" :title="file.name">{{ file.name }}</span>
        </div>

        <dl class="info-bar">
          <div v-for="row in encodeInfo" :key="row.label" class="info-item">
            <dt>{{ row.label }}</dt>
            <dd :title="row.value">{{ row.value }}</dd>
          </div>
        </dl>
      </section>

      <!-- 选好文件后隐藏但保留，「更换文件」和 Ctrl+V 粘贴仍由它处理 -->
      <FileDropZone
        v-show="!file"
        ref="dropZone"
        class="drop-area"
        :paste="direction === 'encode'"
        :title="t('encode.dropFile')"
        :hint="t('encode.dropFileHint')"
        @files="emit('load-file', $event[0])"
      />

      <div class="output-wrap">
        <TextPane
          :model-value="displayFileOutput"
          :copy-text="fileOutput"
          class="stage-pane"
          label="Base64"
          readonly
          :placeholder="t('encode.encodePlaceholder')"
        >
          <template #actions>
            <span v-if="fileOutput" class="count-pill">{{ t("encode.chars", { n: fileOutput.length.toLocaleString() }) }}</span>
          </template>
        </TextPane>
        <p v-if="isOutputTruncated" class="truncate-notice">
          <Info :size="13" />
          <span>{{ t("encode.previewTruncated", { n: PREVIEW_LIMIT.toLocaleString() }) }}</span>
        </p>
      </div>
    </template>

    <!-- ========== Base64 → 文件 ========== -->
    <template v-else>
      <TextPane
        :model-value="base64Input"
        class="stage-pane"
        label="Base64"
        copyable
        :placeholder="t('encode.decodePlaceholder')"
        @update:model-value="emit('update:base64Input', $event)"
      >
        <template #actions>
          <span v-if="base64Input" class="count-pill">{{ t("encode.chars", { n: base64Input.length.toLocaleString() }) }}</span>
        </template>
      </TextPane>

      <section class="card decode-card">
        <header class="card-title">{{ t("encode.decodeResult") }}</header>

        <template v-if="decoded?.ok">
          <div v-if="decoded.file.isImage" class="preview checker">
            <img :src="decodedPreviewUrl || decoded.file.dataUri" :alt="t('encode.preview')" />
          </div>
          <div v-else class="preview file-icon">
            <span class="file-badge"><FileText :size="26" :stroke-width="1.5" /></span>
            <span class="preview-name">{{ t("encode.noPreview") }}</span>
          </div>

          <dl class="info-bar">
            <div v-for="row in decodeInfo" :key="row.label" class="info-item">
              <dt>{{ row.label }}</dt>
              <dd :title="row.value">{{ row.value }}</dd>
            </div>
          </dl>

          <footer class="save">
            <input
              :value="fileName"
              class="field small-text mono name-input"
              spellcheck="false"
              :placeholder="t('encode.fileName')"
              @input="emit('update:fileName', ($event.target as HTMLInputElement).value)"
            />
            <button type="button" class="btn primary" @click="emit('download')">
              <Download :size="14" />{{ saved ? t("encode.saved") : t("encode.download") }}
            </button>
          </footer>
        </template>
        <div v-else-if="decoded" class="state-box error" role="alert">
          <span class="state-icon"><CircleAlert :size="18" /></span>
          <p>{{ t("encode.decodeFailed", { error: decoded.message }) }}</p>
        </div>
        <div v-else class="state-box">
          <span class="state-icon"><FileDown :size="18" /></span>
          <p>{{ t("encode.decodeHint") }}</p>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.file-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.file-card,
.decode-card {
  flex: 1.25;
  min-height: 220px;
  box-shadow: var(--shadow-sm);
}
.drop-area {
  flex: 1;
  min-height: 200px;
  box-shadow: var(--shadow-sm);
}
.output-wrap {
  flex: 1;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stage-pane {
  flex: 1;
  min-height: 160px;
}
.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count-pill {
  margin-right: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--active);
  color: var(--text-2);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.preview {
  position: relative;
  flex: 1;
  min-height: 140px;
  margin: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
/* 棋盘格背景，透明图片也能看清 */
.preview.checker {
  background-color: var(--bg);
  background-image:
    linear-gradient(45deg, var(--active) 25%, transparent 25%),
    linear-gradient(-45deg, var(--active) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--active) 75%),
    linear-gradient(-45deg, transparent 75%, var(--active) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}
.preview img {
  position: absolute;
  inset: 0;
  margin: auto;
  max-width: 100%;
  max-height: 100%;
}
.preview.file-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  background: var(--bg-sunken);
  color: var(--text-2);
  font-size: 12px;
  text-align: center;
}
.file-badge {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  display: grid;
  place-items: center;
  color: var(--accent);
}
.preview-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info-bar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
  margin: 0;
  padding: 9px 14px;
  border-top: 1px solid var(--border);
  background: var(--bg-sunken);
  font-size: 12px;
}
.info-item {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.info-item dt {
  color: var(--text-3);
  white-space: nowrap;
}
.info-item dd {
  margin: 0;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}
.save {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.name-input {
  flex: 1;
  height: 32px;
}
.truncate-notice {
  margin: 0;
  padding: 0 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-3);
}
.state-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  text-align: center;
  color: var(--text-3);
}
.state-box p {
  margin: 0;
  max-width: 380px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.state-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  color: var(--text-3);
}
.state-box.error p {
  color: var(--danger);
}
.state-box.error .state-icon {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: color-mix(in srgb, var(--danger) 24%, transparent);
}
</style>
