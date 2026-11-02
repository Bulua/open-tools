<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Download, FileText, RefreshCw, X } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import ToolActions from "@/components/tool/ToolActions.vue";
import { saveFile } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { FILE_OUTPUT_FORMATS, decodeFile, formatFileOutput, type FileOutputFormat } from "../base64";

/** 文件 / 图片 ↔ Base64。任何文件都可以编码；解码时自动识别类型，图片可预览，均可下载 */
const direction = useStoredRef<"encode" | "decode">("base64-file.direction", "encode");
const format = useStoredRef<FileOutputFormat>("base64-file.format", "dataUri");

// ---------- 文件 → Base64 ----------

interface LoadedFile {
  name: string;
  size: number;
  mime: string;
  dataUri: string;
}

const file = ref<LoadedFile | null>(null);
const loadError = ref("");
const dropZone = ref<InstanceType<typeof FileDropZone>>();

const isImage = computed(() => !!file.value?.mime.startsWith("image/"));
// CSS / HTML 只对图片有意义
const formats = computed(() => FILE_OUTPUT_FORMATS.filter((f) => !f.imageOnly || isImage.value));
watch(formats, (list) => {
  if (!list.some((f) => f.value === format.value)) format.value = "dataUri";
});

const output = computed(() => (file.value ? formatFileOutput(file.value.dataUri, format.value) : ""));

const loadFile = (f: File) => {
  loadError.value = "";
  const reader = new FileReader();
  reader.onload = () => {
    let dataUri = String(reader.result);
    // 浏览器不认识的类型会得到 data:;base64,，补上通用类型
    if (dataUri.startsWith("data:;")) dataUri = dataUri.replace("data:;", "data:application/octet-stream;");
    file.value = { name: f.name, size: f.size, mime: f.type || "application/octet-stream", dataUri };
  };
  reader.onerror = () => (loadError.value = "读取文件失败");
  reader.readAsDataURL(f);
};

// ---------- Base64 → 文件 ----------

const base64Input = ref("");
const fileName = ref("");

const decoded = computed(() => {
  if (!base64Input.value.trim()) return null;
  try {
    return { ok: true as const, file: decodeFile(base64Input.value) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
});

// 识别出类型后给一个默认文件名，用户可以修改
watch(
  () => (decoded.value?.ok ? decoded.value.file.ext : null),
  (ext) => {
    if (ext) fileName.value = `${fileName.value.replace(/\.[^.]*$/, "") || "decoded"}.${ext}`;
  },
);

const saved = ref(false);
const download = async () => {
  if (!decoded.value?.ok) return;
  if (await saveFile(decoded.value.file.bytes, fileName.value || "decoded.bin")) {
    saved.value = true;
    setTimeout(() => (saved.value = false), 1500);
  }
};

// ---------- 图片尺寸（两种模式共用） ----------

const previewSrc = computed(() => {
  if (direction.value === "encode") return isImage.value ? file.value!.dataUri : null;
  return decoded.value?.ok && decoded.value.file.isImage ? decoded.value.file.dataUri : null;
});
const dimensions = ref("");
watch(
  previewSrc,
  (src) => {
    dimensions.value = "";
    if (!src) return;
    const img = new Image();
    img.onload = () => (dimensions.value = `${img.naturalWidth} × ${img.naturalHeight}`);
    img.src = src;
  },
  { immediate: true },
);

const encodeInfo = computed(() => {
  const f = file.value;
  if (!f) return [];
  return [
    { label: "类型", value: f.mime },
    ...(isImage.value ? [{ label: "尺寸", value: dimensions.value || "…" }] : []),
    { label: "文件大小", value: formatBytes(f.size) },
    { label: "Base64 长度", value: `${output.value.length.toLocaleString()} 字符` },
  ];
});

const decodeInfo = computed(() => {
  if (!decoded.value?.ok) return [];
  const f = decoded.value.file;
  return [
    { label: "类型", value: f.mime === "application/octet-stream" ? "未知（二进制文件）" : f.mime },
    ...(f.isImage ? [{ label: "尺寸", value: dimensions.value || "…" }] : []),
    { label: "文件大小", value: formatBytes(f.bytes.length) },
  ];
});
</script>

<template>
  <div class="base64-file">
    <ToolActions>
      <div class="seg">
        <button :class="{ on: direction === 'encode' }" @click="direction = 'encode'">文件 → Base64</button>
        <button :class="{ on: direction === 'decode' }" @click="direction = 'decode'">Base64 → 文件</button>
      </div>
    </ToolActions>

    <!-- ========== 文件 → Base64 ========== -->
    <template v-if="direction === 'encode'">
      <section v-if="file" class="card source">
        <header class="card-title">
          <span class="file-name" :title="file.name">{{ file.name }}</span>
          <button class="btn small subtle" title="更换文件" @click="dropZone?.open()"><RefreshCw :size="14" />更换</button>
          <button class="icon-btn" title="清除" @click="file = null"><X :size="14" /></button>
        </header>
        <div v-if="isImage" class="preview checker"><img :src="file.dataUri" alt="预览" /></div>
        <div v-else class="preview file-icon">
          <FileText :size="40" :stroke-width="1.25" />
          <span>{{ file.name }}</span>
        </div>
        <dl class="info">
          <template v-for="row in encodeInfo" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </template>
        </dl>
      </section>
      <!-- 选好文件后隐藏但保留，「更换文件」和 Ctrl+V 粘贴仍由它处理 -->
      <FileDropZone
        v-show="!file"
        ref="dropZone"
        class="source"
        title="拖入文件，或点击选择"
        hint="支持图片、PDF、压缩包等任意文件，也可以按 Ctrl + V 粘贴截图"
        @files="loadFile($event[0])"
      >
        <span v-if="loadError" class="error">{{ loadError }}</span>
      </FileDropZone>

      <TextPane :model-value="output" class="result" label="Base64" readonly placeholder="选择文件后，这里会显示编码结果">
        <template #actions>
          <div class="seg">
            <button v-for="f in formats" :key="f.value" :class="{ on: format === f.value }" @click="format = f.value">
              {{ f.label }}
            </button>
          </div>
        </template>
      </TextPane>
    </template>

    <!-- ========== Base64 → 文件 ========== -->
    <template v-else>
      <TextPane
        v-model="base64Input"
        class="source"
        label="Base64"
        placeholder="粘贴 Base64 或 Data URI（data:image/png;base64,...）"
      />

      <section class="card result">
        <header class="card-title">解码结果</header>

        <template v-if="decoded?.ok">
          <div v-if="decoded.file.isImage" class="preview checker"><img :src="decoded.file.dataUri" alt="预览" /></div>
          <div v-else class="preview file-icon">
            <FileText :size="40" :stroke-width="1.25" />
            <span>无法预览此类型，可以下载后打开</span>
          </div>
          <dl class="info">
            <template v-for="row in decodeInfo" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>
          <footer class="save">
            <input v-model="fileName" class="name-input" spellcheck="false" placeholder="文件名" />
            <button class="btn primary" @click="download">
              <Download :size="14" />{{ saved ? "已保存" : "下载" }}
            </button>
          </footer>
        </template>
        <p v-else-if="decoded" class="message error">解码失败：{{ decoded.message }}</p>
        <p v-else class="message">在左侧粘贴内容后，这里会显示解码出的文件，可以预览和下载。</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.base64-file {
  flex: 1;
  display: flex;
  gap: 14px;
  min-height: 0;
}
.source {
  flex: 0 0 420px;
}
.result {
  flex: 1;
  min-width: 0;
}
@media (max-width: 1100px) {
  .base64-file {
    flex-direction: column;
  }
  .source,
  .result {
    flex: 1 1 0;
  }
}

.card {
  min-height: 0;
}
.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.error {
  margin-top: 6px;
  color: var(--danger);
}

.preview {
  position: relative;
  flex: 1;
  min-height: 120px;
  margin: 6px 12px 10px;
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
/* 绝对定位让图片按预览区大小等比缩放，不会被裁切 */
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
  background: var(--bg-sunken);
  color: var(--text-3);
  font-size: 12px;
}

.info {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 16px;
  margin: 0;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--border);
  font-size: 12px;
}
.info dt {
  color: var(--text-3);
}
.info dd {
  margin: 0;
  color: var(--text);
  user-select: text;
}

.save {
  display: flex;
  gap: 8px;
  padding: 10px 12px 12px 16px;
  border-top: 1px solid var(--border);
}
.name-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  outline: none;
  font-size: 13px;
}
.name-input:focus {
  border-color: var(--accent);
}

.message {
  margin: 0;
  padding: 6px 16px 14px;
  font-size: 13px;
  color: var(--text-3);
}
.message.error {
  color: var(--danger);
}
</style>
