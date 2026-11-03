<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Translation, useI18n } from "vue-i18n";
import { isTauri } from "@tauri-apps/api/core";
import { CircleAlert, CircleCheck, Download, FileText, LoaderCircle, Printer, X } from "lucide-vue-next";
import CheckAll from "@/components/common/CheckAll.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFileChecks } from "@/composables/useFileChecks";
import { saveFile, saveFiles } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import DocxPreview from "./DocxPreview.vue";
import { printDocx } from "../docxPrint";

/**
 * Word 转 PDF：调用本机安装的 Word / WPS / LibreOffice 转换（与在 Word 里「另存为 PDF」效果相同）。
 * 没有安装这些软件、或在浏览器中预览时，可以用系统打印「另存为 PDF」作为备用。
 */
const { t } = useI18n();
const ACCEPT = ".docx,.doc,.docm,.rtf,.odt,.wps";

interface Item {
  id: number;
  file: File;
  ext: string;
  status: "idle" | "working" | "done" | "error";
  pdf?: Uint8Array;
  message?: string;
}
const items = ref<Item[]>([]);
const selectedId = ref<number | null>(null);
let nextId = 1;

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const addFiles = (files: File[]) => {
  const added = files
    .filter((f) => ACCEPT.split(",").includes(`.${extOf(f.name)}`))
    .map((file) => ({ id: nextId++, file, ext: extOf(file.name), status: "idle" as const }));
  items.value = [...items.value, ...added];
  if (!selectedId.value && added[0]) selectedId.value = added[0].id;
};
const remove = (item: Item) => {
  items.value = items.value.filter((i) => i !== item);
  if (selectedId.value === item.id) selectedId.value = items.value[0]?.id ?? null;
};

const selected = computed(() => items.value.find((i) => i.id === selectedId.value) ?? null);
const { isChecked, toggle: toggleFile, checkedItems, allChecked, partlyChecked, toggleAll } = useFileChecks(items);
const previewData = ref<Uint8Array | null>(null);
const loadPreview = async () => {
  const item = selected.value;
  previewData.value = item && item.ext === "docx" ? new Uint8Array(await item.file.arrayBuffer()) : null;
};
// 切换选中的文件时重新读取
watch(() => selected.value?.id, loadPreview);

// ---------- 本机的转换软件 ----------
const desktop = isTauri();
const engines = ref<string[] | null>(null);
onMounted(async () => {
  if (!desktop) return;
  const { invoke } = await import("@tauri-apps/api/core");
  engines.value = await invoke<string[]>("office_engines").catch(() => []);
});
const canConvert = computed(() => desktop && !!engines.value?.length);

// ---------- 转换 ----------
const converting = ref(false);
const pdfName = (item: Item) => item.file.name.replace(/\.[^.]+$/, "") + ".pdf";

const convertAll = async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  converting.value = true;
  try {
    for (const item of checkedItems.value) {
      if (item.status === "done") continue;
      item.status = "working";
      item.message = "";
      try {
        const data = new Uint8Array(await item.file.arrayBuffer());
        const result = await invoke<ArrayBuffer>("office_to_pdf", data, { headers: { "x-file-ext": item.ext } });
        item.pdf = new Uint8Array(result);
        item.status = "done";
      } catch (e) {
        item.status = "error";
        item.message = e instanceof Error ? e.message : String(e);
      }
    }
    const done = checkedItems.value.filter((i) => i.pdf);
    if (done.length) await saveFiles(done.map((i) => ({ name: pdfName(i), data: i.pdf! })), t("document.wordToPdfZip"));
  } finally {
    converting.value = false;
  }
};

const downloadOne = (item: Item) => item.pdf && saveFile(item.pdf, pdfName(item));

const printing = ref(false);
const printSelected = async () => {
  const item = selected.value;
  if (!item) return;
  printing.value = true;
  try {
    await printDocx(new Uint8Array(await item.file.arrayBuffer()));
  } finally {
    printing.value = false;
  }
};

const pending = computed(() => checkedItems.value.filter((i) => i.status !== "done").length);
</script>

<template>
  <div class="word2pdf">
    <aside class="card panel">
      <section class="section">
        <h3>
          <CheckAll v-if="items.length" :checked="allChecked" :partly="partlyChecked" :disabled="converting" @toggle="toggleAll">{{ t("document.files") }}</CheckAll>
          <template v-else>{{ t("document.files") }}</template>
          <span class="push">{{ items.length > 1 ? t("files.selected", { checked: checkedItems.length, total: items.length }) : t("files.count", { n: items.length }) }}</span>
        </h3>
        <ul class="files">
          <li v-for="item in items" :key="item.id" :class="{ on: item.id === selected?.id, unchecked: !isChecked(item) }" @click="selectedId = item.id">
            <input type="checkbox" class="file-check" :title="t('document.checkFiles')" :checked="isChecked(item)" :disabled="converting" @click.stop @change="toggleFile(item)" />
            <FileText :size="14" class="icon" />
            <span class="name" :title="item.file.name">{{ item.file.name }}</span>
            <LoaderCircle v-if="item.status === 'working'" :size="14" class="spin" />
            <button v-else-if="item.status === 'done'" class="icon-btn ok" :title="t('document.downloadPdf')" @click.stop="downloadOne(item)">
              <CircleCheck :size="14" />
            </button>
            <CircleAlert v-else-if="item.status === 'error'" :size="14" class="bad" />
            <span v-else class="size">{{ formatBytes(item.file.size) }}</span>
            <button class="icon-btn remove" :title="t('document.remove')" @click.stop="remove(item)"><X :size="13" /></button>
          </li>
        </ul>
        <p v-for="item in items.filter((i) => i.status === 'error')" :key="item.id" class="error">{{ item.file.name }}：{{ item.message }}</p>
        <FileDropZone compact :accept="ACCEPT" multiple :paste="false" :title="t('document.addDocs')" @files="addFiles" />
      </section>

      <section class="section">
        <h3>{{ t("document.convertMode") }}</h3>
        <p v-if="!desktop" class="note warn">{{ t("document.browserNoWord") }}</p>
        <p v-else-if="engines === null" class="note">{{ t("document.detectingOffice") }}</p>
        <Translation v-else-if="engines.length" keypath="document.engineNote" tag="p" class="note">
          <template #engine><b>{{ engines[0] }}</b></template>
        </Translation>
        <p v-else class="note warn">{{ t("document.noOffice") }}</p>

        <button v-if="canConvert" class="btn primary full" :disabled="converting || !pending" @click="convertAll">
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
                    : t("document.toPdf")
          }}
        </button>
        <button
          class="btn full"
          :class="{ primary: !canConvert }"
          :disabled="printing || selected?.ext !== 'docx'"
          :title="t('document.printTitle')"
          @click="printSelected"
        >
          <Printer :size="14" />{{ t("document.printPdf") }}
        </button>
        <p class="tip">{{ t("document.printTip") }}</p>
      </section>
    </aside>

    <section class="card stage">
      <div class="card-title">{{ t("document.preview") }}<span class="hint">{{ selected?.file.name }}</span></div>
      <FileDropZone
        v-if="!items.length"
        class="drop"
        :accept="ACCEPT"
        multiple
        :title="t('document.dropWord')"
        :hint="t('document.wordToPdfHint')"
        :paste="false"
        @files="addFiles"
      />
      <DocxPreview v-else :data="previewData">
        <p class="no-preview">{{ selected && selected.ext !== "docx" ? t("document.noPreviewExt", { ext: selected.ext }) : "" }}</p>
      </DocxPreview>
    </section>
  </div>
</template>

<style scoped>
.drop {
  flex: 1;
  margin: 12px;
}
.word2pdf {
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
  font-size: 12px;
  color: var(--text-3);
}
.bad {
  color: var(--danger);
}
.spin {
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
.error {
  word-break: break-all;
}
.btn {
  justify-content: center;
}
</style>
