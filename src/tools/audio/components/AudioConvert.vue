<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CircleAlert, CircleCheck, Download, FileAudio, FileVideo, LoaderCircle, X } from "lucide-vue-next";
import CheckAll from "@/components/common/CheckAll.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFileChecks } from "@/composables/useFileChecks";
import { saveFile, saveFiles } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import OutputFormat from "./OutputFormat.vue";
import { decodeFile, encodeAudio, outputName } from "../audio";
import { formatTime } from "../pcm";
import { useOutputFormat } from "../useOutputFormat";

/**
 * 音频格式转换：MP3、WAV、M4A、OGG、FLAC 等互转；拖入 MP4 等视频文件则提取其中的声音。
 */
const ACCEPT = "audio/*,video/*,.m4a,.flac,.ogg,.opus,.aac,.wma,.mkv,.mov";
const { format, quality } = useOutputFormat();

interface Item {
  id: number;
  file: File;
  video: boolean;
  duration: number | null;
  status: "idle" | "working" | "done" | "error";
  result?: Uint8Array;
  message?: string;
}
const items = ref<Item[]>([]);
let nextId = 1;
const { isChecked, toggle: toggleFile, checkedItems, allChecked, partlyChecked, toggleAll } = useFileChecks(items);

/** 读取时长：只读文件头，不解码整个文件 */
const probeDuration = (file: File) =>
  new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      resolve(Number.isFinite(el.duration) ? el.duration : null);
      URL.revokeObjectURL(url);
    };
    el.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    el.src = url;
  });

const addFiles = async (files: File[]) => {
  for (const file of files) {
    const item: Item = { id: nextId++, file, video: file.type.startsWith("video/"), duration: null, status: "idle" };
    items.value.push(item);
    const d = await probeDuration(file);
    const target = items.value.find((i) => i.id === item.id);
    if (target) target.duration = d;
  }
};
const remove = (item: Item) => (items.value = items.value.filter((i) => i !== item));

// 修改格式后，之前的结果作废
watch([format, quality], () => items.value.forEach((i) => i.status === "done" && Object.assign(i, { status: "idle", result: undefined })));

const working = ref(false);
const convertAll = async () => {
  working.value = true;
  try {
    for (const item of checkedItems.value) {
      if (item.status === "done") continue;
      item.status = "working";
      try {
        const pcm = await decodeFile(item.file);
        item.result = await encodeAudio(pcm, format.value, quality.value);
        item.status = "done";
      } catch (e) {
        item.status = "error";
        item.message = e instanceof Error ? e.message : String(e);
      }
    }
    const done = checkedItems.value.filter((i) => i.result);
    if (done.length) await saveFiles(done.map((i) => ({ name: outputName(i.file.name, format.value), data: i.result! })), "音频.zip");
  } finally {
    working.value = false;
  }
};

const downloadOne = (item: Item) => item.result && saveFile(item.result, outputName(item.file.name, format.value));
const pending = computed(() => checkedItems.value.filter((i) => i.status !== "done").length);
</script>

<template>
  <div class="convert">
    <aside class="card panel">
      <section class="section">
        <h3>转换为</h3>
        <OutputFormat />
      </section>
      <section class="section">
        <button class="btn primary full" :disabled="!checkedItems.length || working" @click="convertAll">
          <Download :size="14" />{{
            working
              ? "转换中…"
              : items.length && !checkedItems.length
                ? "请勾选要转换的文件"
                : items.length > 1
                  ? `转换选中的 ${checkedItems.length} 个`
                  : "转换并保存"
          }}
        </button>
        <p class="tip">也可以拖入视频文件（MP4、MOV、WebM），提取其中的声音</p>
      </section>
    </aside>

    <section class="card list">
      <div class="card-title">
        <CheckAll v-if="items.length" :checked="allChecked" :partly="partlyChecked" :disabled="working" @toggle="toggleAll">文件</CheckAll>
        <template v-else>文件</template>
        <span v-if="items.length" class="count">{{ items.length > 1 ? `已选 ${checkedItems.length} / ${items.length} 个` : `${items.length} 个` }}</span>
        <button v-if="items.length && !working" class="btn small subtle push" @click="items = []">清空</button>
      </div>
      <FileDropZone
        v-if="!items.length"
        class="drop"
        :accept="ACCEPT"
        multiple
        :paste="false"
        title="拖入音频或视频文件，或点击选择（可多选）"
        hint="支持 MP3、WAV、M4A、AAC、OGG、FLAC，以及 MP4、MOV、WebM 视频"
        @files="addFiles"
      />
      <template v-else>
        <ul class="rows">
          <li v-for="item in items" :key="item.id" class="row" :class="{ unchecked: !isChecked(item) }">
            <input type="checkbox" class="file-check" title="勾选的文件才转换" :checked="isChecked(item)" :disabled="working" @change="toggleFile(item)" />
            <component :is="item.video ? FileVideo : FileAudio" :size="16" class="icon" />
            <div class="meta">
              <span class="name" :title="item.file.name">{{ item.file.name }}</span>
              <span class="sub">
                {{ item.duration !== null ? formatTime(item.duration, false) : "—" }} · {{ formatBytes(item.file.size) }}
                <template v-if="item.result"> → {{ formatBytes(item.result.length) }}</template>
              </span>
              <span v-if="item.status === 'error'" class="error">{{ item.message }}</span>
            </div>
            <LoaderCircle v-if="item.status === 'working'" :size="15" class="spin" />
            <CircleAlert v-else-if="item.status === 'error'" :size="15" class="bad" />
            <button v-else-if="item.status === 'done'" class="icon-btn ok" title="保存这个文件" @click="downloadOne(item)"><CircleCheck :size="15" /></button>
            <button class="icon-btn" title="移除" :disabled="working" @click="remove(item)"><X :size="14" /></button>
          </li>
        </ul>
        <FileDropZone compact class="more" :accept="ACCEPT" multiple :paste="false" title="继续添加文件" @files="addFiles" />
      </template>
      <p v-if="items.length && pending === 0 && !working" class="done-tip">全部转换完成，点文件右侧的 ✓ 可以单独保存</p>
    </section>
  </div>
</template>

<style scoped>
.convert {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.panel {
  flex: 0 0 280px;
  align-self: flex-start;
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
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.btn.full {
  justify-content: center;
}
.btn:disabled,
.icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn.small {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
}
.tip {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
.list {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.count {
  font-weight: 400;
  color: var(--text-3);
}
.push {
  margin-left: auto;
}
.drop {
  flex: 1;
  margin: 12px;
}
.rows {
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow: auto;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
}
.row:hover {
  background: var(--hover);
}
.icon {
  flex-shrink: 0;
  color: var(--accent);
}
.meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.sub {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.error {
  font-size: 12px;
  color: var(--danger);
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
.more {
  margin: 0 12px 12px;
}
.done-tip {
  margin: 0;
  padding: 0 16px 12px;
  font-size: 12px;
  color: var(--success);
}
</style>
