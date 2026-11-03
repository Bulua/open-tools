<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { isTauri } from "@tauri-apps/api/core";
import { CircleAlert, CircleCheck, Download, FileText, LoaderCircle, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import CheckAll from "@/components/common/CheckAll.vue";
import { useFileChecks } from "@/composables/useFileChecks";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile, saveFiles } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import DocxPreview from "./DocxPreview.vue";

/**
 * PDF 转 Word：本机装有 Microsoft Word 时调用 Word 转换（表格、图片、排版还原得最好），
 * 否则使用内置转换（读出文字和图片重新排版，适合以文字为主的文档）。
 */
interface Item {
  id: number;
  file: File;
  status: "idle" | "working" | "done" | "error";
  docx?: Uint8Array;
  /** 进度或提示，例如「第 3 / 10 页」「没有文字，可能是扫描件」 */
  message?: string;
  warn?: boolean;
}
const { t } = useI18n();
const items = ref<Item[]>([]);
const selectedId = ref<number | null>(null);
let nextId = 1;

const addFiles = (files: File[]) => {
  const added = files.filter((f) => /\.pdf$/i.test(f.name)).map((file) => ({ id: nextId++, file, status: "idle" as const }));
  items.value = [...items.value, ...added];
  if (!selectedId.value && added[0]) selectedId.value = added[0].id;
};
const remove = (item: Item) => {
  items.value = items.value.filter((i) => i !== item);
  if (selectedId.value === item.id) selectedId.value = items.value[0]?.id ?? null;
};
const selected = computed(() => items.value.find((i) => i.id === selectedId.value) ?? null);
const { isChecked, toggle, checkedItems, allChecked, partlyChecked, toggleAll } = useFileChecks(items);

// ---------- 转换方式 ----------
const desktop = isTauri();
/** 本机是否装有 Word；null 表示还在检测 */
const hasWord = ref<boolean | null>(desktop ? null : false);
onMounted(async () => {
  if (!desktop) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const engines = await invoke<string[]>("office_engines").catch((): string[] => []);
  hasWord.value = engines.includes("Microsoft Word");
});
const method = useStoredRef<"word" | "builtin">("pdf2word.method", "word");
const useWord = computed(() => hasWord.value === true && method.value === "word");
// 换了转换方式后，已转换的文件需要重新转换
watch(useWord, () => {
  for (const item of items.value) {
    if (item.status === "working") continue;
    item.status = "idle";
    item.docx = undefined;
    item.message = "";
  }
});

// ---------- 转换 ----------
const converting = ref(false);
const docxName = (item: Item) => item.file.name.replace(/\.pdf$/i, "") + ".docx";

const convertBuiltin = async (item: Item, data: Uint8Array) => {
  const { pdfToDocx } = await import("../pdfRead");
  const result = await pdfToDocx(data, (done, total) => (item.message = t("document.pageProgress", { done, total })));
  if (result.textless === result.pages) return { docx: result.docx, message: t("document.noText"), warn: true };
  if (result.textless) return { docx: result.docx, message: t("document.someNoText", { n: result.textless }), warn: true };
  return { docx: result.docx, message: "", warn: false };
};

const convertOne = async (item: Item) => {
  const data = new Uint8Array(await item.file.arrayBuffer());
  if (useWord.value) {
    item.message = t("document.wordConverting");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return { docx: new Uint8Array(await invoke<ArrayBuffer>("pdf_to_word", data)), message: "", warn: false };
    } catch (e) {
      // Word 转换失败（例如版本太旧）时改用内置转换
      const result = await convertBuiltin(item, data);
      const reason = e instanceof Error ? e.message : String(e);
      return { ...result, message: t("document.wordFallback", { reason }), warn: true };
    }
  }
  return convertBuiltin(item, data);
};

const convertAll = async () => {
  converting.value = true;
  try {
    for (const item of items.value) {
      if (!isChecked(item) || item.status === "done") continue;
      item.status = "working";
      item.message = "";
      try {
        const result = await convertOne(item);
        item.docx = result.docx;
        item.message = result.message;
        item.warn = result.warn;
        item.status = "done";
      } catch (e) {
        item.status = "error";
        const message = e instanceof Error ? e.message : String(e);
        item.message = /password/i.test(message) ? t("document.pdfPassword") : message;
      }
    }
    const done = checkedItems.value.filter((i) => i.docx);
    if (done.length) await saveFiles(done.map((i) => ({ name: docxName(i), data: i.docx! })), t("document.pdfToWordZip"));
  } finally {
    converting.value = false;
  }
};

const downloadOne = (item: Item) => item.docx && saveFile(item.docx, docxName(item));

const pending = computed(() => checkedItems.value.filter((i) => i.status !== "done").length);
const notes = computed(() => items.value.filter((i) => (i.status === "error" || i.warn) && i.message));
</script>

<template>
  <div class="pdf2word">
    <aside class="card panel">
      <section class="section">
        <h3>
          <CheckAll v-if="items.length" :checked="allChecked" :partly="partlyChecked" :disabled="converting" @toggle="toggleAll">{{ t("document.files") }}</CheckAll>
          <template v-else>{{ t("document.files") }}</template>
          <span class="push">{{ items.length > 1 ? t("files.selected", { checked: checkedItems.length, total: items.length }) : t("files.count", { n: items.length }) }}</span>
        </h3>
        <ul class="files">
          <li v-for="item in items" :key="item.id" :class="{ on: item.id === selected?.id, unchecked: !isChecked(item) }" @click="selectedId = item.id">
            <input type="checkbox" class="file-check" :title="t('document.checkFiles')" :checked="isChecked(item)" :disabled="converting" @click.stop @change="toggle(item)" />
            <FileText :size="14" class="icon" />
            <span class="name" :title="item.file.name">{{ item.file.name }}</span>
            <template v-if="item.status === 'working'">
              <span v-if="item.message" class="size">{{ item.message }}</span>
              <LoaderCircle :size="14" class="spin" />
            </template>
            <button v-else-if="item.status === 'done'" class="icon-btn ok" :title="t('document.downloadDocx')" @click.stop="downloadOne(item)">
              <CircleCheck :size="14" />
            </button>
            <CircleAlert v-else-if="item.status === 'error'" :size="14" class="bad" />
            <span v-else class="size">{{ formatBytes(item.file.size) }}</span>
            <button class="icon-btn remove" :title="t('document.remove')" @click.stop="remove(item)"><X :size="13" /></button>
          </li>
        </ul>
        <p v-for="item in notes" :key="item.id" :class="item.status === 'error' ? 'error' : 'warn-text'">{{ item.file.name }}：{{ item.message }}</p>
        <FileDropZone compact accept=".pdf" multiple :paste="false" :title="t('document.addPdf')" @files="addFiles" />
      </section>

      <section class="section">
        <h3>{{ t("document.convertMode") }}</h3>
        <div v-if="hasWord" class="seg fill">
          <button :class="{ on: method === 'word' }" :disabled="converting" @click="method = 'word'">Microsoft Word</button>
          <button :class="{ on: method === 'builtin' }" :disabled="converting" @click="method = 'builtin'">{{ t("document.builtin") }}</button>
        </div>
        <p v-if="hasWord === null" class="note">{{ t("document.detectingWord") }}</p>
        <p v-else-if="useWord" class="note">
          {{ t("document.wordNote") }}
        </p>
        <template v-else>
          <p class="note">
            {{ t("document.builtinNote") }}
          </p>
          <p v-if="!hasWord" class="note warn">
            {{ desktop ? t("document.noWord") : t("document.noWordBrowser") }}
          </p>
        </template>

        <button class="btn primary full" :disabled="converting || !pending || hasWord === null" @click="convertAll">
          <Download :size="14" />
          {{
            converting
              ? t("document.converting")
              : !checkedItems.length
                ? t("document.checkToConvert")
                : !pending
                  ? t("document.allConverted")
                  : items.length > 1
                    ? t("document.convertSelected", { n: pending })
                    : t("document.toWord")
          }}
        </button>
        <p class="tip">{{ t("document.scanTip") }}</p>
      </section>
    </aside>

    <section class="card stage">
      <div class="card-title">{{ t("document.preview") }}<span class="hint">{{ selected ? docxName(selected) : "" }}</span></div>
      <FileDropZone
        v-if="!items.length"
        class="drop"
        accept=".pdf"
        multiple
        :title="t('document.dropPdfs')"
        :hint="t('document.pdfToWordHint')"
        :paste="false"
        @files="addFiles"
      />
      <DocxPreview v-else :data="selected?.docx ?? null">
        <p class="no-preview">{{ selected?.status === "working" ? t("document.converting") : selected?.status === "error" ? t("document.convertFailed") : t("document.previewAfter") }}</p>
      </DocxPreview>
    </section>
  </div>
</template>

<style scoped>
.drop {
  flex: 1;
  margin: 12px;
}
.pdf2word {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.stage {
  flex: 1;
  min-width: 0;
}
.card-title .hint {
  margin-left: 6px;
  font-weight: 400;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.no-preview {
  margin: 80px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
}
.panel {
  flex: 0 0 300px;
  align-self: flex-start;
  max-height: 100%;
  overflow: auto;
}
h3 {
  display: flex;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.push {
  margin-left: auto;
  font-weight: 400;
  color: var(--text-3);
}
.files {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 260px;
  overflow: auto;
}
.files li {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 4px 0 8px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}
.files li:hover {
  background: var(--hover);
}
.files li.on {
  background: var(--accent-soft);
}
.icon {
  flex-shrink: 0;
  color: var(--text-3);
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.size {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-3);
}
.bad {
  color: var(--danger);
}
.spin {
  flex-shrink: 0;
  color: var(--accent);
}
.remove {
  opacity: 0;
}
.files li:hover .remove {
  opacity: 1;
}
.note {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-sunken);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
}
.note.warn {
  background: var(--warning-soft);
  color: var(--warning);
}
.error,
.warn-text {
  margin: 0;
  font-size: 12px;
  word-break: break-all;
}
.warn-text {
  color: var(--warning);
}
.btn {
  justify-content: center;
}
</style>
