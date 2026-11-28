<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, FileText, LoaderCircle, Plus, RefreshCw, Upload, X } from "lucide-vue-next";
import CopyList from "@/components/common/CopyList.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import TextPane from "@/components/common/TextPane.vue";
import { useClipboard } from "@/composables/useClipboard";
import { useStoredRef } from "@/composables/useStoredRef";
import { useToolResult } from "@/composables/useToolUsage";
import { formatBytes } from "@/utils/format";
import DevHistoryList, { type DevHistoryItem } from "../shared/components/DevHistoryList.vue";
import { MAX_HISTORY, createHistoryId, formatHistoryTime, loadHistory, previewLine, saveHistory } from "../shared/history";
import { HASH_ALGORITHMS, hashBytes, hashText, type HashAlgorithm } from "./hash";

interface HashRecord {
  id: string;
  source: "text" | "file";
  text?: string;
  fileName?: string;
  fileSize?: number;
  results: Record<HashAlgorithm, string>;
  updatedAt: number;
}

const STORAGE_KEY = "hash.records";
const { t, locale } = useI18n();
const { copied, copy } = useClipboard();

const source = useStoredRef<"text" | "file">("hash.source", "text");
const uppercase = useStoredRef("hash.uppercase", false);

const text = ref("");
const file = ref<File | null>(null);
const restoredFile = ref<{ name: string; size: number } | null>(null);
const dropZone = ref<InstanceType<typeof FileDropZone>>();
const transitionTick = ref(0);

const results = ref<Record<HashAlgorithm, string> | null>(null);
const computing = ref(false);

const records = ref<HashRecord[]>(loadHistory<HashRecord>(STORAGE_KEY));
const activeId = ref<string | null>(null);
let restoring = false;
let recordTimer: ReturnType<typeof setTimeout> | undefined;
let run = 0;

onBeforeUnmount(() => clearTimeout(recordTimer));

const persist = () =>
  saveHistory(STORAGE_KEY, records.value, MAX_HISTORY, 120_000, (r) => r.text?.length ?? 0);

const saveRecord = (entry: Omit<HashRecord, "id" | "updatedAt">) => {
  const now = Date.now();
  const idx = activeId.value ? records.value.findIndex((r) => r.id === activeId.value) : -1;
  if (idx >= 0 && records.value[idx].source === entry.source && entry.source === "text") {
    records.value[idx] = { ...entry, id: records.value[idx].id, updatedAt: now };
    persist();
    return;
  }
  const created: HashRecord = { ...entry, id: createHistoryId(), updatedAt: now };
  records.value = [created, ...records.value].slice(0, MAX_HISTORY);
  activeId.value = created.id;
  persist();
};

const compute = async () => {
  if (restoring) return;
  const id = ++run;
  clearTimeout(recordTimer);
  if (source.value === "text" ? !text.value : !file.value) {
    if (source.value === "file" && restoredFile.value) return;
    results.value = null;
    computing.value = false;
    return;
  }
  computing.value = true;
  const r =
    source.value === "text"
      ? await hashText(text.value)
      : await hashBytes(new Uint8Array(await file.value!.arrayBuffer()));
  if (id !== run) return;
  results.value = r;
  computing.value = false;

  if (source.value === "file" && file.value) {
    restoredFile.value = null;
    saveRecord({ source: "file", fileName: file.value.name, fileSize: file.value.size, results: r });
  } else if (source.value === "text" && text.value.trim()) {
    const snapshot = text.value;
    recordTimer = setTimeout(() => {
      saveRecord({ source: "text", text: snapshot, results: r });
    }, 450);
  }
};
watch([source, text, file], compute, { immediate: true });

const items = computed(() =>
  HASH_ALGORITHMS.map((algo) => {
    const value = results.value?.[algo] ?? "";
    return { label: algo, value: uppercase.value ? value.toUpperCase() : value };
  }),
);

const displayFile = computed(() =>
  file.value ? { name: file.value.name, size: file.value.size } : restoredFile.value,
);

const historyItems = computed<DevHistoryItem[]>(() =>
  records.value.map((r) => ({
    id: r.id,
    tag: t(r.source === "text" ? "encode.text" : "encode.file"),
    tone: r.source === "text" ? "accent" : "warning",
    time: formatHistoryTime(r.updatedAt, locale.value),
    title: r.source === "text" ? previewLine(r.text, 46) : r.fileName || "file",
    subtitle: r.results.MD5 ? `MD5 ${uppercase.value ? r.results.MD5.toUpperCase() : r.results.MD5}` : undefined,
  })),
);

const switchSource = (next: "text" | "file") => {
  if (source.value === next) return;
  clearTimeout(recordTimer);
  source.value = next;
  transitionTick.value++;
  const active = records.value.find((r) => r.id === activeId.value);
  if (active && active.source !== next) activeId.value = null;
};

const onFilePicked = (picked: File) => {
  restoredFile.value = null;
  activeId.value = null;
  file.value = picked;
};

const clearFile = () => {
  file.value = null;
  restoredFile.value = null;
  activeId.value = null;
  results.value = null;
};

const startNew = () => {
  clearTimeout(recordTimer);
  activeId.value = null;
  if (source.value === "text") text.value = "";
  else {
    file.value = null;
    restoredFile.value = null;
  }
  results.value = null;
  transitionTick.value++;
};

const copyAll = () => {
  if (!results.value) return;
  const lines = items.value.filter((i) => i.value).map((i) => `${i.label}: ${i.value}`);
  if (lines.length) void copy(lines.join("\n"));
};

const selectRecord = async (id: string) => {
  const target = records.value.find((r) => r.id === id);
  if (!target || (activeId.value === id && source.value === target.source)) return;
  clearTimeout(recordTimer);
  restoring = true;
  activeId.value = target.id;
  source.value = target.source;
  if (target.source === "text") {
    text.value = target.text ?? "";
    file.value = null;
    restoredFile.value = null;
  } else {
    file.value = null;
    restoredFile.value = { name: target.fileName ?? "file", size: target.fileSize ?? 0 };
  }
  results.value = target.results;
  computing.value = false;
  transitionTick.value++;
  await nextTick();
  restoring = false;
};

const removeRecord = (id: string) => {
  records.value = records.value.filter((r) => r.id !== id);
  if (activeId.value === id) activeId.value = null;
  persist();
};

const clearRecords = () => {
  records.value = [];
  activeId.value = null;
  persist();
};

useToolResult(() => (results.value ? results.value["SHA-256"] ?? results.value.MD5 : ""));
</script>

<template>
  <div class="workbench">
    <aside class="card sidebar">
      <section class="section">
        <h3>{{ t("dev.mode") }}</h3>
        <div class="seg fill">
          <button type="button" :class="{ on: source === 'text' }" @click="switchSource('text')">{{ t("encode.text") }}</button>
          <button type="button" :class="{ on: source === 'file' }" @click="switchSource('file')">{{ t("encode.file") }}</button>
        </div>
      </section>

      <section class="section">
        <h3>{{ t("dev.options") }}</h3>
        <div class="switch-row">
          <span>{{ t("encode.uppercase") }}</span>
          <button
            type="button"
            class="control-switch"
            role="switch"
            :aria-checked="uppercase"
            :aria-label="t('encode.uppercase')"
            @click="uppercase = !uppercase"
          >
            <span />
          </button>
        </div>

        <div class="action-grid">
          <button v-if="source === 'file'" type="button" class="btn small" @click="dropZone?.open()">
            <RefreshCw v-if="displayFile" :size="13" />
            <Upload v-else :size="13" />
            {{ displayFile ? t("encode.replace") : t("dev.chooseFile") }}
          </button>
          <button v-else type="button" class="btn small" :disabled="!results" @click="copyAll">
            <Check v-if="copied" :size="13" />
            <Copy v-else :size="13" />
            {{ t("dev.copyAll") }}
          </button>
          <button
            type="button"
            class="btn small"
            :disabled="source === 'text' ? !text && !activeId : !displayFile && !activeId"
            @click="startNew"
          >
            <Plus :size="13" />{{ t("dev.newEntry") }}
          </button>
        </div>
        <button v-if="source === 'file'" type="button" class="btn small full" :disabled="!results" @click="copyAll">
          <Check v-if="copied" :size="13" />
          <Copy v-else :size="13" />
          {{ t("dev.copyAll") }}
        </button>
      </section>

      <DevHistoryList :items="historyItems" :active-id="activeId" @select="selectRecord" @remove="removeRecord" @clear="clearRecords" />
    </aside>

    <main class="stage">
      <Transition name="stage-swap" mode="out-in">
        <div :key="`${source}:${transitionTick}`" class="stage-stack">
          <TextPane
            v-if="source === 'text'"
            v-model="text"
            class="input"
            copyable
            :label="t('encode.text')"
            :placeholder="t('encode.hashPlaceholder')"
          >
            <template #actions>
              <span v-if="text" class="count-pill">{{ t("dev.chars", { n: text.length.toLocaleString() }) }}</span>
            </template>
          </TextPane>

          <template v-else>
            <section v-if="displayFile" class="card file">
              <span class="file-badge"><FileText :size="18" :stroke-width="1.6" /></span>
              <div class="file-meta">
                <strong :title="displayFile.name">{{ displayFile.name }}</strong>
                <span class="file-size">{{ formatBytes(displayFile.size) }}</span>
              </div>
              <div class="file-actions">
                <button type="button" class="btn small subtle" @click="dropZone?.open()"><RefreshCw :size="14" />{{ t("encode.replace") }}</button>
                <button type="button" class="icon-btn" :title="t('encode.clear')" @click="clearFile"><X :size="14" /></button>
              </div>
            </section>
            <FileDropZone
              v-show="!displayFile"
              ref="dropZone"
              class="input"
              :title="t('encode.dropFile')"
              :hint="t('encode.hashHint')"
              :paste="false"
              @files="onFilePicked($event[0])"
            />
          </template>

          <section class="card results">
            <header class="card-title">
              <span>{{ t("encode.result") }}</span>
              <span v-if="computing" class="hint"><LoaderCircle :size="13" class="spin" />{{ t("encode.computing") }}</span>
            </header>
            <CopyList :items="items" label-width="76px" class="hash-list" />
          </section>
        </div>
      </Transition>
    </main>
  </div>
</template>

<style scoped>
.workbench {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.sidebar {
  flex: 0 0 296px;
  min-height: 0;
  box-shadow: var(--shadow-sm);
}
.sidebar h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 0;
  font-size: 13px;
  color: var(--text);
}
.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.action-grid .btn {
  justify-content: center;
}
.stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.stage-stack {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.input {
  flex: 1;
  min-height: 160px;
}
.file {
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  box-shadow: var(--shadow-sm);
}
.file-badge {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent);
  display: grid;
  place-items: center;
}
.file-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.file-meta strong {
  font-size: 13.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-size {
  font-size: 12px;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
}
.file-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.results {
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}
.hash-list :deep(.label) {
  font-family: var(--font-mono);
  font-size: 12px;
}
.hint {
  margin-left: auto;
  padding-right: 6px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 400;
  color: var(--text-3);
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
.stage-swap-enter-active {
  transition: opacity var(--dur) var(--ease-out), translate var(--dur) var(--ease-out);
}
.stage-swap-leave-active {
  transition: opacity var(--dur-fast) ease-in, translate var(--dur-fast) ease-in;
}
.stage-swap-enter-from {
  opacity: 0;
  translate: 0 6px;
}
.stage-swap-leave-to {
  opacity: 0;
  translate: 0 -4px;
}
@media (max-width: 860px) {
  .workbench {
    flex: none;
    width: 100%;
    flex-direction: column;
  }
  .sidebar {
    flex: none;
  }
}
</style>
