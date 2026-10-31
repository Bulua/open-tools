<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import { CircleAlert, CircleCheck, Download, FileText, LoaderCircle, Printer, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { saveFile, saveFiles } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import DocxPreview from "./DocxPreview.vue";
import { printDocx } from "../docxPrint";

/**
 * Word 转 PDF：调用本机安装的 Word / WPS / LibreOffice 转换（与在 Word 里「另存为 PDF」效果相同）。
 * 没有安装这些软件、或在浏览器中预览时，可以用系统打印「另存为 PDF」作为备用。
 */
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
    for (const item of items.value) {
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
    const done = items.value.filter((i) => i.pdf);
    if (done.length) await saveFiles(done.map((i) => ({ name: pdfName(i), data: i.pdf! })), "Word 转 PDF.zip");
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

const pending = computed(() => items.value.filter((i) => i.status !== "done").length);
</script>

<template>
  <FileDropZone
    v-if="!items.length"
    :accept="ACCEPT"
    multiple
    title="拖入 Word 文档，或点击选择（可多选）"
    hint="支持 .docx、.doc、.rtf、.odt、.wps；调用本机安装的 Word 或 WPS 转换，排版与原文档一致"
    :paste="false"
    @files="addFiles"
  />

  <div v-else class="word2pdf">
    <section class="card stage">
      <div class="card-title">预览<span class="hint">{{ selected?.file.name }}</span></div>
      <DocxPreview :data="previewData">
        <p class="no-preview">{{ selected && selected.ext !== "docx" ? `.${selected.ext} 格式无法预览，可以直接转换` : "" }}</p>
      </DocxPreview>
    </section>

    <aside class="card panel">
      <section class="section">
        <h3>文件<span class="push">{{ items.length }} 个</span></h3>
        <ul class="files">
          <li v-for="item in items" :key="item.id" :class="{ on: item.id === selected?.id }" @click="selectedId = item.id">
            <FileText :size="14" class="icon" />
            <span class="name" :title="item.file.name">{{ item.file.name }}</span>
            <LoaderCircle v-if="item.status === 'working'" :size="14" class="spin" />
            <button v-else-if="item.status === 'done'" class="icon-btn ok" title="下载这个 PDF" @click.stop="downloadOne(item)">
              <CircleCheck :size="14" />
            </button>
            <CircleAlert v-else-if="item.status === 'error'" :size="14" class="bad" />
            <span v-else class="size">{{ formatBytes(item.file.size) }}</span>
            <button class="icon-btn remove" title="移除" @click.stop="remove(item)"><X :size="13" /></button>
          </li>
        </ul>
        <p v-for="item in items.filter((i) => i.status === 'error')" :key="item.id" class="error">{{ item.file.name }}：{{ item.message }}</p>
        <FileDropZone compact :accept="ACCEPT" multiple :paste="false" title="继续添加文档" @files="addFiles" />
      </section>

      <section class="section">
        <h3>转换方式</h3>
        <p v-if="!desktop" class="note warn">浏览器中无法调用 Word，请使用安装后的桌面版；也可以用下方的「打印为 PDF」。</p>
        <p v-else-if="engines === null" class="note">正在检测本机的 Office 软件…</p>
        <p v-else-if="engines.length" class="note">
          使用本机的 <b>{{ engines[0] }}</b> 转换，效果与在其中「另存为 PDF」相同。转换时会在后台打开文档，请稍候。
        </p>
        <p v-else class="note warn">没有找到 Microsoft Word、WPS 或 LibreOffice。安装其中之一即可一键转换，也可以用下方的「打印为 PDF」。</p>

        <button v-if="canConvert" class="btn primary full" :disabled="converting || !pending" @click="convertAll">
          <Download :size="14" />
          {{ converting ? "正在转换…" : !pending ? "已全部转换" : items.length > 1 ? `转换全部 ${pending} 个` : "转换为 PDF" }}
        </button>
        <button
          class="btn full"
          :class="{ primary: !canConvert }"
          :disabled="printing || selected?.ext !== 'docx'"
          title="用系统打印功能，选择「Microsoft Print to PDF」或「另存为 PDF」"
          @click="printSelected"
        >
          <Printer :size="14" />打印为 PDF（当前文档）
        </button>
        <p class="tip">打印方式由程序自行排版，复杂文档可能与 Word 略有差异，仅支持 .docx。</p>
      </section>
    </aside>
  </div>
</template>

<style scoped>
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
.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}
.section + .section {
  border-top: 1px solid var(--border);
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
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
.tip {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
.error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
  word-break: break-all;
}
.btn {
  justify-content: center;
}
.btn.full {
  width: 100%;
}
.btn:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>
