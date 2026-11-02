<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ArrowDown, ArrowUp, Download, GripVertical, LoaderCircle, X } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import CheckAll from "@/components/common/CheckAll.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFileChecks } from "@/composables/useFileChecks";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { VIDEO_ACCEPT, canCopyConcat, codecName, concatVideos, formatDuration, probeVideo, type ConcatQuality, type VideoInfo } from "../media";

/**
 * 视频拼接：把多段视频按顺序拼成一个 MP4。
 * 所有视频格式完全相同（例如同一部手机拍的）时直接拼接，不重新编码，速度快、画质无损；
 * 否则统一画面大小重新编码，大小、比例不同的视频按比例缩放居中，空白处填黑色。
 */
interface Clip {
  id: number;
  file: File;
  url: string;
  info?: VideoInfo;
  error?: string;
}
const clips = ref<Clip[]>([]);
let nextId = 1;
const { isChecked, toggle: toggleFile, checkedItems, allChecked, partlyChecked, toggleAll } = useFileChecks(clips);
/** 参与拼接的：勾选并且能读取的 */
const usable = computed(() => checkedItems.value.filter((c) => c.info && !c.error));

const addFiles = async (files: File[]) => {
  for (const file of files) {
    const clip: Clip = { id: nextId++, file, url: URL.createObjectURL(file) };
    clips.value.push(clip);
    const added = clips.value.find((c) => c.id === clip.id)!;
    try {
      added.info = await probeVideo(file);
      if (!added.info.width) added.error = "这个文件里没有画面";
    } catch (e) {
      added.error = e instanceof Error ? e.message : String(e);
    }
  }
};
const remove = (clip: Clip) => {
  URL.revokeObjectURL(clip.url);
  clips.value = clips.value.filter((c) => c !== clip);
};
const clear = () => {
  clips.value.forEach((c) => URL.revokeObjectURL(c.url));
  clips.value = [];
};
const move = (index: number, delta: number) => {
  const list = [...clips.value];
  const [clip] = list.splice(index, 1);
  list.splice(Math.max(0, Math.min(list.length, index + delta)), 0, clip);
  clips.value = list;
};
// 拖动排序
const dragIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);
const onDrop = (index: number) => {
  if (dragIndex.value !== null && dragIndex.value !== index) move(dragIndex.value, index - dragIndex.value);
  dragIndex.value = overIndex.value = null;
};

const total = computed(() => usable.value.reduce((s, c) => s + c.info!.duration, 0));

// ---------- 输出设置 ----------
const size = useStoredRef("videoConcat.size", "first");
const quality = useStoredRef<ConcatQuality>("videoConcat.quality", "high");
const forceReencode = ref(false);
const first = computed(() => usable.value[0]?.info);
const SIZE_OPTIONS = computed(() => [
  { value: "first", label: first.value ? `与第 1 个视频相同（${first.value.width}×${first.value.height}）` : "与第 1 个视频相同" },
  { value: "1920x1080", label: "1920×1080（横屏 1080P）" },
  { value: "1280x720", label: "1280×720（横屏 720P）" },
  { value: "1080x1920", label: "1080×1920（竖屏 1080P）" },
  { value: "720x1280", label: "720×1280（竖屏 720P）" },
]);
const outputSize = computed(() => {
  if (size.value === "first") return { width: first.value?.width ?? 1280, height: first.value?.height ?? 720 };
  const [width, height] = size.value.split("x").map(Number);
  return { width, height };
});
const QUALITIES: { value: ConcatQuality; label: string }[] = [
  { value: "medium", label: "标准" },
  { value: "high", label: "高" },
  { value: "very-high", label: "最高" },
];

// 格式是否完全相同：可以直接拼接
const canCopy = ref<boolean | null>(null);
let checkToken = 0;
watch(
  () => usable.value.map((c) => c.id).join(","),
  async () => {
    const current = ++checkToken;
    canCopy.value = null;
    if (usable.value.length < 2) return;
    const ok = await canCopyConcat(usable.value.map((c) => c.file)).catch(() => false);
    if (current === checkToken) canCopy.value = ok;
  },
);
const willCopy = computed(() => !!canCopy.value && !forceReencode.value);

// ---------- 拼接 ----------
const working = ref(false);
const progress = ref(0);
const error = ref("");
const result = ref<{ data: Uint8Array; url: string; copied: boolean } | null>(null);
const clearResult = () => {
  if (result.value) URL.revokeObjectURL(result.value.url);
  result.value = null;
};
// 改了列表或设置，之前的结果作废
watch([() => usable.value.map((c) => c.id).join(","), size, quality, forceReencode], clearResult);
onBeforeUnmount(() => {
  clearResult();
  clips.value.forEach((c) => URL.revokeObjectURL(c.url));
});

const start = async () => {
  working.value = true;
  progress.value = 0;
  error.value = "";
  clearResult();
  try {
    const { data, copied } = await concatVideos(
      usable.value.map((c) => c.file),
      { ...outputSize.value, quality: quality.value, forceReencode: forceReencode.value },
      (p) => (progress.value = p),
    );
    result.value = { data, copied, url: URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: "video/mp4" })) };
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    working.value = false;
  }
};
const save = () => result.value && saveFile(result.value.data, "拼接视频.mp4");

const describe = (info: VideoInfo) =>
  `${formatDuration(info.duration)} · ${info.width}×${info.height} · ${codecName(info.videoCodec)}${info.audio ? ` + ${codecName(info.audio.codec)}` : " · 无声音"}`;
</script>

<template>
  <div class="concat">
    <aside class="card panel">
      <section class="section">
        <h3>拼接方式</h3>
        <p v-if="usable.length < 2" class="note">添加并勾选至少两个视频</p>
        <p v-else-if="canCopy === null" class="note">正在检查视频格式…</p>
        <p v-else-if="willCopy" class="note good">所有视频格式相同，<b>直接拼接</b>：不重新编码，速度快、画质无损。</p>
        <p v-else-if="canCopy" class="note">将重新编码为 MP4（H.264），可以统一画面大小。</p>
        <p v-else class="note">视频的格式或画面大小不同，将<b>重新编码</b>为 MP4（H.264），统一画面大小；大小、比例不同的视频按比例缩放居中，空白处为黑色。</p>
        <label v-if="canCopy" class="check"><input v-model="forceReencode" type="checkbox" :disabled="working" />仍然重新编码（统一画面大小）</label>
      </section>

      <section v-if="!willCopy" class="section">
        <h3>画面大小</h3>
        <AppSelect v-model="size" :options="SIZE_OPTIONS" :disabled="working" />
        <h3>画质</h3>
        <div class="seg fill">
          <button v-for="q in QUALITIES" :key="q.value" :class="{ on: quality === q.value }" :disabled="working" @click="quality = q.value">{{ q.label }}</button>
        </div>
        <p class="tip">重新编码使用电脑的硬件加速，速度取决于显卡，长视频需要一些时间。</p>
      </section>

      <section class="section">
        <button class="btn primary full" :disabled="usable.length < 2 || working || canCopy === null" @click="start">
          <LoaderCircle v-if="working" :size="14" class="spin" />
          <Download v-else :size="14" />
          {{ working ? `正在拼接 ${Math.round(progress * 100)}%` : `拼接 ${usable.length} 个视频` }}
        </button>
        <span v-if="working" class="bar"><i :style="{ width: `${Math.round(progress * 100)}%` }" /></span>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="usable.length" class="tip">合计 {{ formatDuration(total) }}；在本机处理，不上传文件。</p>
      </section>

      <section v-if="result" class="section">
        <h3>拼接结果<span class="push">{{ formatBytes(result.data.length) }}{{ result.copied ? " · 直接拼接" : " · 重新编码" }}</span></h3>
        <video :src="result.url" controls class="result" />
        <button class="btn primary full" @click="save"><Download :size="14" />保存视频</button>
      </section>
    </aside>

    <section class="card list">
      <div class="card-title">
        <CheckAll v-if="clips.length" :checked="allChecked" :partly="partlyChecked" :disabled="working" @toggle="toggleAll">视频</CheckAll>
        <template v-else>视频</template>
        <span v-if="clips.length" class="count">{{ clips.length > 1 ? `已选 ${checkedItems.length} / ${clips.length} 个` : `${clips.length} 个` }}</span>
        <span v-if="clips.length > 1" class="hint">拖动调整顺序</span>
        <button v-if="clips.length && !working" class="btn small subtle push" @click="clear">清空</button>
      </div>
      <FileDropZone
        v-if="!clips.length"
        class="drop"
        :accept="VIDEO_ACCEPT"
        multiple
        :paste="false"
        title="拖入要拼接的视频，或点击选择（可多选）"
        hint="按添加的顺序拼接，之后可以拖动调整；支持 MP4、MOV、MKV、WebM、TS"
        @files="addFiles"
      />
      <template v-else>
        <ol class="rows">
          <li
            v-for="(clip, i) in clips"
            :key="clip.id"
            class="row"
            :class="{ over: overIndex === i && dragIndex !== i, dragging: dragIndex === i, unchecked: !isChecked(clip) }"
            :draggable="!working"
            @dragstart="dragIndex = i"
            @dragover.prevent="overIndex = i"
            @drop.prevent="onDrop(i)"
            @dragend="dragIndex = overIndex = null"
          >
            <GripVertical :size="14" class="grip" />
            <input type="checkbox" class="file-check" title="勾选的视频才拼接" :checked="isChecked(clip)" :disabled="working" @change="toggleFile(clip)" />
            <span class="no">{{ i + 1 }}</span>
            <video class="thumb" :src="`${clip.url}#t=0.5`" muted preload="metadata" />
            <div class="meta">
              <span class="name" :title="clip.file.name">{{ clip.file.name }}</span>
              <span v-if="clip.error" class="error">{{ clip.error }}</span>
              <span v-else-if="clip.info" class="sub">{{ describe(clip.info) }} · {{ formatBytes(clip.file.size) }}</span>
              <span v-else class="sub">正在读取…</span>
            </div>
            <button class="icon-btn" title="上移" :disabled="i === 0 || working" @click="move(i, -1)"><ArrowUp :size="13" /></button>
            <button class="icon-btn" title="下移" :disabled="i === clips.length - 1 || working" @click="move(i, 1)"><ArrowDown :size="13" /></button>
            <button class="icon-btn" title="移除" :disabled="working" @click="remove(clip)"><X :size="13" /></button>
          </li>
        </ol>
        <FileDropZone compact class="more" :accept="VIDEO_ACCEPT" multiple :paste="false" title="继续添加视频" @files="addFiles" />
      </template>
    </section>
  </div>
</template>

<style scoped>
.concat {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.panel {
  flex: 0 0 320px;
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
.note {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-sunken);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
}
.note.good {
  background: var(--success-soft);
}
.seg.fill {
  display: flex;
}
.seg.fill button {
  flex: 1;
}
.seg button:disabled {
  opacity: 0.5;
  cursor: default;
}
.tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}
.error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
  word-break: break-all;
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
.bar {
  height: 4px;
  border-radius: 2px;
  background: var(--active);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}
.result {
  width: 100%;
  max-height: 240px;
  border-radius: 8px;
  background: #000;
}
.list {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.count,
.hint {
  margin-left: 8px;
  font-weight: 400;
  color: var(--text-3);
}
.hint {
  font-size: 12px;
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
  gap: 10px;
  padding: 8px 10px;
  border-top: 2px solid transparent;
  border-radius: 8px;
  cursor: grab;
}
.row:hover {
  background: var(--hover);
}
.row.over {
  border-top-color: var(--accent);
}
.row.dragging {
  opacity: 0.4;
}
.grip {
  flex-shrink: 0;
  color: var(--text-3);
}
.no {
  flex: 0 0 18px;
  font-size: 12px;
  color: var(--text-3);
  text-align: right;
}
.thumb {
  flex-shrink: 0;
  width: 80px;
  height: 45px;
  border-radius: 6px;
  background: #000;
  object-fit: contain;
  pointer-events: none;
}
.meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
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
.spin {
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
</style>
