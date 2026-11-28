<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowUpDown, Plus, RefreshCw, Upload } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useToolResult } from "@/composables/useToolUsage";
import { formatBytes } from "@/utils/format";
import { showError } from "@/utils/errorToast";
import { base64ToText, textToBase64 } from "../shared/base64";
import { FILE_OUTPUT_FORMATS, decodeFile, formatFileOutput, type FileOutputFormat } from "./base64";
import {
  MAX_RECORDS,
  createRecordId,
  loadBase64Records,
  saveBase64Records,
  type Base64Direction,
  type Base64Mode,
  type Base64Record,
  type LoadedFile,
} from "./history";
import Base64HistoryList from "./components/Base64HistoryList.vue";
import Base64FileStage from "./components/Base64FileStage.vue";

/** Base64 编解码工作台：左侧统一放置模式、方向、选项与历史记录，右侧展示输入与输出 */
const { t } = useI18n();

const mode = useStoredRef<Base64Mode>("base64.mode", "text");
const direction = useStoredRef<Base64Direction>("base64.direction", "encode");
const urlSafe = useStoredRef("base64.urlSafe", false);
const format = useStoredRef<FileOutputFormat>("base64-file.format", "dataUri");
const transitionTick = ref(0);

// ---------- 文本编解码 ----------

const textInput = ref("");
const textResult = computed(() => {
  if (!textInput.value) return { output: "", error: "" };
  try {
    const output =
      direction.value === "encode"
        ? textToBase64(textInput.value, urlSafe.value)
        : textInput.value.trim()
          ? base64ToText(textInput.value)
          : "";
    return { output, error: "" };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
});

// ---------- 文件 / 图片编解码 ----------

const fileStage = ref<InstanceType<typeof Base64FileStage>>();
const file = ref<LoadedFile | null>(null);
const base64Input = ref("");
const fileName = ref("");
const saved = ref(false);

const isImage = computed(() => !!file.value?.mime.startsWith("image/"));
const formats = computed(() =>
  FILE_OUTPUT_FORMATS.filter((f) => !f.imageOnly || isImage.value).map((f) =>
    f.value === "base64" ? { ...f, label: t("encode.pureBase64") } : f,
  ),
);
watch(formats, (list) => {
  if (!list.some((f) => f.value === format.value)) format.value = "dataUri";
});

const fileOutput = computed(() => (file.value ? formatFileOutput(file.value.dataUri, format.value) : ""));

const decoded = computed(() => {
  if (!base64Input.value.trim()) return null;
  try {
    return { ok: true as const, file: decodeFile(base64Input.value) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
});

// ---------- 图片尺寸与 Blob 预览 URL 缓存 ----------

const dimensions = ref("");
const decodedPreviewUrl = ref("");
const liveFileObjectUrls = new Set<string>();

function trackObjectUrl(url: string): string {
  liveFileObjectUrls.add(url);
  return url;
}

function revokeRecordObjectUrl(record: Base64Record) {
  if (!record.objectUrl) return;
  URL.revokeObjectURL(record.objectUrl);
  liveFileObjectUrls.delete(record.objectUrl);
  record.objectUrl = undefined;
}

function measureDimensions(src: string, onReady: (value: string) => void) {
  const img = new Image();
  img.onload = () => onReady(`${img.naturalWidth} × ${img.naturalHeight}`);
  img.src = src;
}

watch(
  decoded,
  (next) => {
    if (decodedPreviewUrl.value) {
      URL.revokeObjectURL(decodedPreviewUrl.value);
      decodedPreviewUrl.value = "";
    }
    if (direction.value !== "decode") return;
    dimensions.value = "";
    if (!next?.ok || !next.file.isImage) return;
    const url = URL.createObjectURL(new Blob([new Uint8Array(next.file.bytes)], { type: next.file.mime }));
    decodedPreviewUrl.value = url;
    measureDimensions(url, (val) => {
      if (decodedPreviewUrl.value === url) dimensions.value = val;
    });
  },
  { immediate: true },
);

const encodeInfo = computed(() => {
  const f = file.value;
  if (!f) return [];
  return [
    { label: t("encode.type"), value: f.mime },
    ...(isImage.value ? [{ label: t("encode.dimensions"), value: dimensions.value || "…" }] : []),
    { label: t("encode.fileSize"), value: formatBytes(f.size) },
    { label: t("encode.base64Length"), value: t("encode.chars", { n: fileOutput.value.length.toLocaleString() }) },
  ];
});

const decodeInfo = computed(() => {
  if (!decoded.value?.ok) return [];
  const f = decoded.value.file;
  return [
    { label: t("encode.type"), value: f.mime === "application/octet-stream" ? t("encode.unknownBinary") : f.mime },
    ...(f.isImage ? [{ label: t("encode.dimensions"), value: dimensions.value || "…" }] : []),
    { label: t("encode.fileSize"), value: formatBytes(f.bytes.length) },
  ];
});

// ---------- 历史记录 ----------

const records = ref<Base64Record[]>(loadBase64Records());
const activeRecordId = ref<string | null>(null);
let restoring = false;
let recordTimer: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => {
  clearTimeout(recordTimer);
  if (decodedPreviewUrl.value) URL.revokeObjectURL(decodedPreviewUrl.value);
  for (const url of liveFileObjectUrls) URL.revokeObjectURL(url);
  liveFileObjectUrls.clear();
});

const upsertRecord = (next: Omit<Base64Record, "id" | "createdAt" | "updatedAt">) => {
  const now = Date.now();
  const idx = activeRecordId.value ? records.value.findIndex((r) => r.id === activeRecordId.value) : -1;
  if (idx >= 0) {
    const prev = records.value[idx];
    if (prev.mode === next.mode && prev.direction === next.direction) {
      records.value[idx] = { ...next, id: prev.id, createdAt: prev.createdAt, updatedAt: now };
      saveBase64Records(records.value);
      return;
    }
  }
  const created: Base64Record = { ...next, id: createRecordId(), createdAt: now, updatedAt: now };
  const nextList = [created, ...records.value];
  while (nextList.length > MAX_RECORDS) {
    const dropped = nextList.pop();
    if (dropped) revokeRecordObjectUrl(dropped);
  }
  records.value = nextList;
  activeRecordId.value = created.id;
  saveBase64Records(records.value);
};

// 文本模式防抖记录（不触发 transitionTick，避免编辑失焦）
watch([textInput, () => textResult.value.output, () => textResult.value.error, urlSafe], () => {
  if (restoring || mode.value !== "text") return;
  clearTimeout(recordTimer);
  if (!textInput.value.trim() || textResult.value.error || !textResult.value.output) return;
  recordTimer = setTimeout(() => {
    upsertRecord({
      mode: "text",
      direction: direction.value,
      input: textInput.value,
      output: textResult.value.output,
      urlSafe: urlSafe.value,
    });
  }, 450);
});

// 文件编码：用 ObjectURL 加速大图渲染并缓存尺寸，直接显式持久化
const loadFile = (f: File) => {
  const objectUrl = trackObjectUrl(URL.createObjectURL(f));
  const mime = f.type || "application/octet-stream";
  const reader = new FileReader();
  reader.onload = () => {
    let dataUri = String(reader.result);
    if (dataUri.startsWith("data:;")) dataUri = dataUri.replace("data:;", "data:application/octet-stream;");
    const loaded: LoadedFile = { name: f.name, size: f.size, mime, dataUri, objectUrl };
    file.value = loaded;
    dimensions.value = "";
    const now = Date.now();
    const created: Base64Record = {
      id: createRecordId(),
      mode: "file",
      direction: "encode",
      createdAt: now,
      updatedAt: now,
      fileName: loaded.name,
      fileSize: loaded.size,
      fileMime: loaded.mime,
      dataUri: loaded.dataUri,
      objectUrl,
      format: format.value,
    };
    const nextList = [created, ...records.value];
    while (nextList.length > MAX_RECORDS) {
      const dropped = nextList.pop();
      if (dropped) revokeRecordObjectUrl(dropped);
    }
    records.value = nextList;
    activeRecordId.value = created.id;
    saveBase64Records(records.value);

    if (mime.startsWith("image/")) {
      measureDimensions(objectUrl, (val) => {
        loaded.dimensions = val;
        created.dimensions = val;
        if (file.value === loaded) dimensions.value = val;
        saveBase64Records(records.value);
      });
    }
  };
  reader.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    liveFileObjectUrls.delete(objectUrl);
    showError(t("encode.readFailed"));
  };
  reader.readAsDataURL(f);
};

watch(format, (fmt) => {
  if (restoring || mode.value !== "file" || direction.value !== "encode" || !activeRecordId.value) return;
  const current = records.value.find((r) => r.id === activeRecordId.value);
  if (current?.mode === "file" && current.direction === "encode") {
    current.format = fmt;
    current.updatedAt = Date.now();
    saveBase64Records(records.value);
  }
});

// 文件解码：自动识别扩展名并防抖写入记录
watch(
  () => (decoded.value?.ok ? decoded.value.file.ext : null),
  (ext) => {
    if (restoring && fileName.value) return;
    if (ext) fileName.value = `${fileName.value.replace(/\.[^.]*$/, "") || "decoded"}.${ext}`;
  },
);

watch([base64Input, fileName, decoded], () => {
  if (restoring || mode.value !== "file" || direction.value !== "decode") return;
  clearTimeout(recordTimer);
  if (!decoded.value?.ok) return;
  const info = decoded.value.file;
  recordTimer = setTimeout(() => {
    upsertRecord({
      mode: "file",
      direction: "decode",
      base64Input: base64Input.value,
      decodedName: fileName.value,
      decodedMime: info.mime,
      decodedSize: info.bytes.length,
    });
  }, 450);
});

const download = async () => {
  if (!decoded.value?.ok) return;
  const { saveFile } = await import("@/utils/saveFile");
  if (await saveFile(decoded.value.file.bytes, fileName.value || "decoded.bin")) {
    saved.value = true;
    setTimeout(() => (saved.value = false), 1500);
  }
};

// ---------- 交互控制 ----------

const switchMode = (next: Base64Mode) => {
  if (mode.value === next) return;
  clearTimeout(recordTimer);
  mode.value = next;
  transitionTick.value++;
  const active = records.value.find((r) => r.id === activeRecordId.value);
  if (active && active.mode !== next) activeRecordId.value = null;
};

const switchDirection = (next: Base64Direction) => {
  if (direction.value === next) return;
  clearTimeout(recordTimer);
  direction.value = next;
  transitionTick.value++;
  const active = records.value.find((r) => r.id === activeRecordId.value);
  if (active && (active.mode !== mode.value || active.direction !== next)) activeRecordId.value = null;
};

const swapText = () => {
  if (!textResult.value.output) return;
  clearTimeout(recordTimer);
  activeRecordId.value = null;
  const nextInput = textResult.value.output;
  direction.value = direction.value === "encode" ? "decode" : "encode";
  textInput.value = nextInput;
  transitionTick.value++;
};

const startNew = () => {
  clearTimeout(recordTimer);
  activeRecordId.value = null;
  if (mode.value === "text") {
    textInput.value = "";
  } else if (direction.value === "encode") {
    file.value = null;
    dimensions.value = "";
  } else {
    base64Input.value = "";
    fileName.value = "";
  }
  transitionTick.value++;
};

const selectRecord = async (item: Base64Record) => {
  if (activeRecordId.value === item.id && mode.value === item.mode && direction.value === item.direction) return;
  clearTimeout(recordTimer);
  restoring = true;
  activeRecordId.value = item.id;
  mode.value = item.mode;
  direction.value = item.direction;

  if (item.mode === "text") {
    if (item.urlSafe !== undefined) urlSafe.value = item.urlSafe;
    textInput.value = item.input ?? "";
  } else if (item.direction === "encode") {
    if (item.format) format.value = item.format;
    if (item.dataUri) {
      const mime = item.fileMime ?? "application/octet-stream";
      const loaded: LoadedFile = {
        name: item.fileName ?? "file",
        size: item.fileSize ?? 0,
        mime,
        dataUri: item.dataUri,
        dimensions: item.dimensions,
        objectUrl: item.objectUrl,
      };
      file.value = loaded;
      dimensions.value = item.dimensions ?? "";
      if (!item.dimensions && mime.startsWith("image/")) {
        measureDimensions(item.objectUrl || item.dataUri, (val) => {
          item.dimensions = val;
          loaded.dimensions = val;
          if (file.value === loaded) dimensions.value = val;
        });
      }
    } else {
      file.value = null;
      dimensions.value = "";
    }
  } else {
    fileName.value = item.decodedName ?? "";
    base64Input.value = item.base64Input ?? "";
  }

  transitionTick.value++;
  await nextTick();
  restoring = false;
};

const removeRecord = (id: string) => {
  const target = records.value.find((r) => r.id === id);
  if (target) revokeRecordObjectUrl(target);
  records.value = records.value.filter((r) => r.id !== id);
  if (activeRecordId.value === id) activeRecordId.value = null;
  saveBase64Records(records.value);
};

const clearRecords = () => {
  for (const r of records.value) revokeRecordObjectUrl(r);
  records.value = [];
  activeRecordId.value = null;
  saveBase64Records(records.value);
};

useToolResult(() => {
  if (mode.value === "text") return !textResult.value.error ? textResult.value.output : "";
  return direction.value === "encode"
    ? file.value
      ? `${file.value.name}:${file.value.size}:${format.value}`
      : ""
    : decoded.value?.ok
      ? `${decoded.value.file.mime}:${decoded.value.file.bytes.length}`
      : "";
});
</script>

<template>
  <div class="base64-studio">
    <aside class="card sidebar">
      <section class="section">
        <h3>{{ t("encode.mode") }}</h3>
        <div class="seg fill">
          <button type="button" :class="{ on: mode === 'text' }" @click="switchMode('text')">{{ t("encode.text") }}</button>
          <button type="button" :class="{ on: mode === 'file' }" @click="switchMode('file')">{{ t("encode.fileImage") }}</button>
        </div>

        <h3>{{ t("encode.direction") }}</h3>
        <div v-if="mode === 'text'" class="seg fill">
          <button type="button" :class="{ on: direction === 'encode' }" @click="switchDirection('encode')">{{ t("encode.encodeAction") }}</button>
          <button type="button" :class="{ on: direction === 'decode' }" @click="switchDirection('decode')">{{ t("encode.decodeAction") }}</button>
        </div>
        <div v-else class="seg fill">
          <button type="button" :class="{ on: direction === 'encode' }" @click="switchDirection('encode')">{{ t("encode.fileToBase64") }}</button>
          <button type="button" :class="{ on: direction === 'decode' }" @click="switchDirection('decode')">{{ t("encode.base64ToFile") }}</button>
        </div>
      </section>

      <section class="section">
        <Transition name="panel-swap" mode="out-in">
          <div v-if="mode === 'text'" key="text" class="option-group">
            <h3>{{ t("encode.options") }}</h3>
            <div class="switch-row" :title="t('encode.urlSafeTitle')">
              <span>{{ t("encode.urlSafe") }}</span>
              <button
                type="button"
                class="control-switch"
                role="switch"
                :aria-checked="urlSafe"
                :aria-label="t('encode.urlSafe')"
                @click="urlSafe = !urlSafe"
              >
                <span />
              </button>
            </div>
            <div class="action-grid">
              <button type="button" class="btn small" :disabled="!textResult.output" @click="swapText">
                <ArrowUpDown :size="13" />{{ t("encode.swapDirection") }}
              </button>
              <button type="button" class="btn small" :disabled="!textInput && !activeRecordId" @click="startNew">
                <Plus :size="13" />{{ t("encode.newEntry") }}
              </button>
            </div>
          </div>

          <div v-else-if="direction === 'encode'" key="file-encode" class="option-group">
            <h3>{{ t("encode.outputFormat") }}</h3>
            <div class="format-grid">
              <button
                v-for="f in formats"
                :key="f.value"
                type="button"
                class="format-pill"
                :class="{ on: format === f.value }"
                @click="format = f.value"
              >
                {{ f.label }}
              </button>
            </div>
            <div class="action-grid">
              <button type="button" class="btn small" @click="fileStage?.openPicker()">
                <RefreshCw v-if="file" :size="13" />
                <Upload v-else :size="13" />
                {{ file ? t("encode.replace") : t("encode.chooseFile") }}
              </button>
              <button type="button" class="btn small" :disabled="!file && !activeRecordId" @click="startNew">
                <Plus :size="13" />{{ t("encode.newEntry") }}
              </button>
            </div>
          </div>

          <div v-else key="file-decode" class="option-group">
            <div class="action-grid single">
              <button type="button" class="btn small" :disabled="!base64Input && !activeRecordId" @click="startNew">
                <Plus :size="13" />{{ t("encode.newEntry") }}
              </button>
            </div>
          </div>
        </Transition>
      </section>

      <Base64HistoryList :records="records" :active-id="activeRecordId" @select="selectRecord" @remove="removeRecord" @clear="clearRecords" />
    </aside>

    <main class="stage">
      <Transition name="stage-swap" mode="out-in">
        <div v-if="mode === 'text'" :key="`text:${direction}:${transitionTick}`" class="text-stage">
          <TextPane
            v-model="textInput"
            class="stage-pane"
            copyable
            :label="direction === 'encode' ? t('encode.text') : 'Base64'"
            :placeholder="direction === 'encode' ? t('encode.inputTextPlaceholder') : t('encode.inputBase64Placeholder')"
          >
            <template #actions>
              <span v-if="textInput" class="count-pill">{{ t("encode.chars", { n: textInput.length.toLocaleString() }) }}</span>
            </template>
          </TextPane>

          <TextPane
            :model-value="textResult.output"
            class="stage-pane"
            readonly
            :label="direction === 'encode' ? 'Base64' : t('encode.text')"
            :placeholder="direction === 'encode' ? t('encode.outputBase64Placeholder') : t('encode.outputTextPlaceholder')"
            :error="textResult.error"
          >
            <template #actions>
              <span v-if="textResult.output" class="count-pill">{{ t("encode.chars", { n: textResult.output.length.toLocaleString() }) }}</span>
            </template>
          </TextPane>
        </div>

        <Base64FileStage
          v-else
          :key="`file:${direction}:${transitionTick}`"
          ref="fileStage"
          :direction="direction"
          :file="file"
          :file-output="fileOutput"
          :base64-input="base64Input"
          :file-name="fileName"
          :decoded="decoded"
          :decoded-preview-url="decodedPreviewUrl"
          :encode-info="encodeInfo"
          :decode-info="decodeInfo"
          :saved="saved"
          @load-file="loadFile"
          @clear-file="file = null; dimensions = ''"
          @update:base64-input="base64Input = $event"
          @update:file-name="fileName = $event"
          @download="download"
        />
      </Transition>
    </main>
  </div>
</template>

<style scoped>
.base64-studio {
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
.option-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
.format-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.format-pill {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-sunken);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.format-pill:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.format-pill.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.action-grid.single {
  grid-template-columns: minmax(0, 1fr);
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
.text-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stage-pane {
  flex: 1;
  min-height: 180px;
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

/* 右侧工作区与左侧动态选项的平滑过渡（无回弹） */
.stage-swap-enter-active,
.panel-swap-enter-active {
  transition: opacity var(--dur) var(--ease-out), translate var(--dur) var(--ease-out);
}
.stage-swap-leave-active,
.panel-swap-leave-active {
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
.panel-swap-enter-from {
  opacity: 0;
  translate: 0 4px;
}
.panel-swap-leave-to {
  opacity: 0;
  translate: 0 -4px;
}

@media (max-width: 860px) {
  .base64-studio {
    flex: none;
    width: 100%;
    flex-direction: column;
  }
  .sidebar {
    flex: none;
  }
}
</style>
