<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { Download, FileText, RotateCcw } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import TextPane from "@/components/common/TextPane.vue";
import ProcessingMascot from "@/components/common/ProcessingMascot.vue";
import { saveFile } from "@/utils/saveFile";
import { showError } from "@/utils/errorToast";
import { formatBytes } from "@/utils/format";
import { recordToolUsage } from "@/composables/toolLibrary";
import { convertDocx, MAX_WORD_BYTES, type WordMarkdownResult } from "./conversion";

const { t } = useI18n();
const file = shallowRef<File>();
const result = shallowRef<WordMarkdownResult>();
const busy = ref(false);
const saving = ref(false);
const validation = ref("");
const downloadLabel = computed(() => {
  if (saving.value) return t("document.wordMarkdown.saving");
  if (!result.value) return t("document.wordMarkdown.download");
  return t(result.value.format === "zip" ? "document.wordMarkdown.downloadZip" : "document.wordMarkdown.downloadMd");
});
let disposed = false;
onBeforeUnmount(() => { disposed = true; });

async function convert() {
  const source = file.value;
  if (!source || busy.value || saving.value) return;
  busy.value = true;
  result.value = undefined;
  try {
    const converted = await convertDocx(source);
    if (disposed) return;
    result.value = converted;
    recordToolUsage();
  } catch (e) {
    if (!disposed) showError(e, t("document.wordMarkdown.failed"));
  } finally {
    if (!disposed) busy.value = false;
  }
}

function addFiles(files: File[]) {
  if (busy.value || saving.value || !files[0]) return;
  const source = files[0];
  validation.value = !/\.docx$/i.test(source.name) ? t("document.wordMarkdown.invalid")
    : source.size > MAX_WORD_BYTES ? t("document.wordMarkdown.tooLarge") : "";
  if (validation.value) return;
  file.value = source;
  void convert();
}

async function download() {
  if (!result.value || saving.value) return;
  saving.value = true;
  try { await saveFile(result.value.data, result.value.fileName); }
  catch (e) { if (!disposed) showError(e, t("document.wordMarkdown.saveFailed")); }
  finally { if (!disposed) saving.value = false; }
}
</script>

<template>
  <div class="word-markdown">
    <aside class="card panel">
      <section class="section">
        <h3>{{ t("document.wordMarkdown.file") }}</h3>
        <div v-if="file" class="file-info">
          <FileText :size="20" />
          <div><strong :title="file.name">{{ file.name }}</strong><small>{{ formatBytes(file.size) }}</small></div>
        </div>
        <FileDropZone v-if="!busy && !saving && file" compact accept=".docx" :paste="false" :title="t('document.wordMarkdown.replace')" @files="addFiles" />
        <p v-if="validation" class="error">{{ validation }}</p>
        <p class="note">{{ t("document.wordMarkdown.structure") }}</p>
        <p class="note">{{ t("document.wordMarkdown.local") }}</p>
        <button v-if="file && !result" class="btn full" :disabled="busy || saving" @click="convert">
          <RotateCcw :size="14" />{{ t(busy ? "document.wordMarkdown.converting" : "document.wordMarkdown.convert") }}
        </button>
        <button class="btn primary full" :disabled="!result || busy || saving" @click="download">
          <Download :size="14" />{{ downloadLabel }}
        </button>
        <small v-if="result" class="ready" role="status">{{ t("document.wordMarkdown.ready") }}</small>
      </section>
    </aside>
    <section v-if="busy" class="card stage" aria-busy="true">
      <ProcessingMascot :title="file?.name ?? ''" :detail="t('document.wordMarkdown.converting')" />
    </section>
    <TextPane v-else-if="result" :model-value="result.markdown" :label="t('document.wordMarkdown.output')" language="markdown" readonly />
    <section v-else class="card stage">
      <FileDropZone class="drop" accept=".docx" :paste="false" :title="t('document.wordMarkdown.drop')" :hint="t('document.wordMarkdown.hint')" @files="addFiles" />
    </section>
  </div>
</template>

<style scoped>
.word-markdown { display: flex; flex: 1; min-height: 0; gap: 14px; }
.panel { flex: 0 0 280px; align-self: flex-start; max-height: 100%; overflow: auto; }
.stage { display: flex; flex: 1; min-width: 0; min-height: 0; }
.drop { margin: 14px; }
h3 { margin: 0; font-size: 12px; font-weight: 500; color: var(--text-2); }
.file-info { display: flex; align-items: center; gap: 10px; min-width: 0; color: var(--text-2); }
.file-info > svg { flex-shrink: 0; }
.file-info > div { min-width: 0; }
.file-info strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; color: var(--text); }
.file-info small { color: var(--text-3); font-size: 12px; }
.note { margin: 0; font-size: 12px; line-height: 1.7; color: var(--text-3); }
.ready { text-align: center; color: var(--text-2); }
.empty { margin: auto; padding: 24px; color: var(--text-3); font-size: 13px; }
</style>
