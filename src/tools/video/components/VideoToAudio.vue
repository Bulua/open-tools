<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { CircleAlert, CircleCheck, Download, FileVideo, LoaderCircle, X } from "lucide-vue-next";
import AudioTrack, { type TrackSource } from "@/tools/audio/components/AudioTrack.vue";
import PlayButton from "@/tools/audio/components/PlayButton.vue";
import CheckAll from "@/components/common/CheckAll.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFileChecks } from "@/composables/useFileChecks";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile, saveFiles } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { VIDEO_ACCEPT, codecName, extractAudio, formatDuration, probeVideo, type AudioTarget, type VideoInfo } from "../media";

/**
 * 视频转音频：提取视频里的声音。「原始音轨」直接复制，不重新编码，速度最快、音质无损；
 * 也可以转成 MP3、M4A、WAV。可批量处理，勾选的文件才转换。
 * 下方的音轨显示选中视频的声音波形，可以试听；转换后可以切换试听转换结果。
 */
interface Item {
  id: number;
  file: File;
  /** 转换结果，用于试听 */
  resultBlob?: Blob;
  info?: VideoInfo;
  status: "idle" | "working" | "done" | "error";
  progress: number;
  result?: { data: Uint8Array; ext: string; copied: boolean };
  message?: string;
}
const items = ref<Item[]>([]);
const selectedId = ref<number | null>(null);
let nextId = 1;
const selected = computed(() => items.value.find((i) => i.id === selectedId.value) ?? null);
const { isChecked, toggle: toggleFile, checkedItems, allChecked, partlyChecked, toggleAll } = useFileChecks(items);

const target = useStoredRef<AudioTarget>("videoToAudio.target", "mp3");
const bitrate = useStoredRef("videoToAudio.bitrate", 192);
const TARGETS: { value: AudioTarget; label: string; tip: string }[] = [
  { value: "original", label: "原始音轨", tip: "直接复制视频里的声音，不重新编码：速度最快、音质无损。格式与视频里的相同，通常是 M4A（AAC）" },
  { value: "mp3", label: "MP3", tip: "兼容性最好，几乎所有设备都能播放" },
  { value: "m4a", label: "M4A", tip: "AAC 编码，同样的音质比 MP3 小；视频里本来就是 AAC 时直接复制" },
  { value: "wav", label: "WAV", tip: "无损格式，文件较大，适合继续剪辑" },
];
const BITRATES = [
  { value: 128, label: "普通" },
  { value: 192, label: "高" },
  { value: 320, label: "最高" },
];
const targetTip = computed(() => TARGETS.find((t) => t.value === target.value)?.tip);

const addFiles = async (files: File[]) => {
  for (const file of files) {
    const item: Item = { id: nextId++, file, status: "idle", progress: 0 };
    items.value.push(item);
    selectedId.value ??= item.id;
    // 取回响应式的那一份再修改，界面才会更新
    const added = items.value.find((i) => i.id === item.id)!;
    try {
      added.info = await probeVideo(file);
      if (!added.info.audio) Object.assign(added, { status: "error", message: "这个视频里没有声音" });
    } catch (e) {
      Object.assign(added, { status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }
};
const remove = (item: Item) => {
  items.value = items.value.filter((i) => i !== item);
  if (selectedId.value === item.id) selectedId.value = items.value[0]?.id ?? null;
};
const clear = () => {
  items.value = [];
  selectedId.value = null;
};

// 换了格式或音质后，之前的结果作废
watch([target, bitrate], () =>
  items.value.forEach((i) => {
    if (i.status === "done") Object.assign(i, { status: "idle", result: undefined, resultBlob: undefined, progress: 0 });
  }),
);

// ---------- 试听 ----------
const MIME: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac" };
const track = ref<InstanceType<typeof AudioTrack>>();
const trackSources = computed<TrackSource[]>(() => {
  const item = selected.value;
  if (!item?.info?.audio) return [];
  const list: TrackSource[] = [{ key: `${item.id}:source`, label: "原视频声音", blob: item.file }];
  if (item.resultBlob) list.push({ key: `${item.id}:result`, label: "转换结果", blob: item.resultBlob });
  return list;
});
/** 列表里的试听：在下方音轨中从头播放，正在播放的再点一下停止 */
const isPlaying = (item: Item) => item.id === selectedId.value && !!track.value?.playing;
const play = async (item: Item) => {
  if (isPlaying(item)) return track.value?.pause();
  selectedId.value = item.id;
  await nextTick();
  track.value?.play();
};

const outputName = (item: Item) => `${item.file.name.replace(/\.[^.]+$/, "") || "audio"}.${item.result?.ext ?? "mp3"}`;

const working = ref(false);
const convertAll = async () => {
  working.value = true;
  try {
    for (const item of checkedItems.value) {
      if (item.status === "done" || !item.info?.audio) continue;
      item.status = "working";
      item.progress = 0;
      try {
        item.result = await extractAudio(item.file, target.value, bitrate.value, (p) => (item.progress = p));
        const type = MIME[item.result.ext] ?? "audio/mp4";
        item.resultBlob = new Blob([item.result.data as Uint8Array<ArrayBuffer>], { type });
        item.status = "done";
      } catch (e) {
        item.status = "error";
        item.message = e instanceof Error ? e.message : String(e);
      }
    }
    const done = checkedItems.value.filter((i) => i.result);
    if (done.length) await saveFiles(done.map((i) => ({ name: outputName(i), data: i.result!.data })), "视频转音频.zip");
  } finally {
    working.value = false;
  }
};

const downloadOne = (item: Item) => item.result && saveFile(item.result.data, outputName(item));
const pending = computed(() => checkedItems.value.filter((i) => i.status !== "done" && i.info?.audio).length);
</script>

<template>
  <div class="v2a">
    <aside class="card panel">
      <section class="section">
        <h3>转换为</h3>
        <div class="seg fill">
          <button v-for="t in TARGETS" :key="t.value" :class="{ on: target === t.value }" :disabled="working" @click="target = t.value">{{ t.label }}</button>
        </div>
        <div v-if="target === 'mp3' || target === 'm4a'" class="row">
          <span>音质</span>
          <div class="seg fill">
            <button v-for="b in BITRATES" :key="b.value" :class="{ on: bitrate === b.value }" :title="`${b.value} kbps`" :disabled="working" @click="bitrate = b.value">
              {{ b.label }}
            </button>
          </div>
        </div>
        <p class="tip">{{ targetTip }}</p>
      </section>
      <section class="section">
        <button class="btn primary full" :disabled="!pending || working" @click="convertAll">
          <Download :size="14" />{{
            working
              ? "转换中…"
              : items.length && !checkedItems.length
                ? "请勾选要转换的视频"
                : items.length > 1
                  ? `转换选中的 ${pending} 个`
                  : "提取声音并保存"
          }}
        </button>
        <p class="tip">在本机处理，不上传文件；几 GB 的视频也可以转换。</p>
      </section>
    </aside>

    <section class="card list">
      <div class="card-title">
        <CheckAll v-if="items.length" :checked="allChecked" :partly="partlyChecked" :disabled="working" @toggle="toggleAll">视频</CheckAll>
        <template v-else>视频</template>
        <span v-if="items.length" class="count">{{ items.length > 1 ? `已选 ${checkedItems.length} / ${items.length} 个` : `${items.length} 个` }}</span>
        <button v-if="items.length && !working" class="btn small subtle push" @click="clear">清空</button>
      </div>
      <FileDropZone
        v-if="!items.length"
        class="drop"
        :accept="VIDEO_ACCEPT"
        multiple
        :paste="false"
        title="拖入视频文件，或点击选择（可多选）"
        hint="支持 MP4、MOV、MKV、WebM、TS，提取其中的声音保存为 MP3、M4A、WAV"
        @files="addFiles"
      />
      <template v-else>
        <ul class="rows">
          <li
            v-for="item in items"
            :key="item.id"
            class="row"
            :class="{ unchecked: !isChecked(item), on: item.id === selected?.id }"
            @click="selectedId = item.id"
          >
            <input type="checkbox" class="file-check" title="勾选的视频才转换" :checked="isChecked(item)" :disabled="working" @click.stop @change="toggleFile(item)" />
            <PlayButton v-if="item.info?.audio" :playing="isPlaying(item)" @click.stop="play(item)" />
            <FileVideo v-else :size="16" class="icon" />
            <div class="meta">
              <span class="name" :title="item.file.name">{{ item.file.name }}</span>
              <span class="sub">
                <template v-if="item.info">
                  {{ formatDuration(item.info.duration) }}
                  <template v-if="item.info.audio"> · 声音 {{ codecName(item.info.audio.codec) }} {{ item.info.audio.channels > 1 ? "立体声" : "单声道" }}</template>
                  ·
                </template>
                {{ formatBytes(item.file.size) }}
                <template v-if="item.result">
                  → {{ formatBytes(item.result.data.length) }} {{ item.result.ext.toUpperCase() }}{{ item.result.copied ? "（直接复制）" : "" }}
                </template>
              </span>
              <span v-if="item.status === 'error'" class="error">{{ item.message }}</span>
              <span v-if="item.status === 'working'" class="bar"><i :style="{ width: `${Math.round(item.progress * 100)}%` }" /></span>
            </div>
            <span v-if="item.status === 'working'" class="percent">{{ Math.round(item.progress * 100) }}%</span>
            <LoaderCircle v-if="item.status === 'working'" :size="15" class="spin" />
            <CircleAlert v-else-if="item.status === 'error'" :size="15" class="bad" />
            <button v-else-if="item.status === 'done'" class="icon-btn ok" title="保存这个文件" @click.stop="downloadOne(item)"><CircleCheck :size="15" /></button>
            <button class="icon-btn" title="移除" :disabled="working" @click.stop="remove(item)"><X :size="14" /></button>
          </li>
        </ul>
        <FileDropZone compact class="more" :accept="VIDEO_ACCEPT" multiple :paste="false" title="继续添加视频" @files="addFiles" />
      </template>
      <!-- 音轨：没有视频时也显示，添加后显示选中视频的声音 -->
      <AudioTrack
        ref="track"
        class="player"
        :sources="trackSources"
        :title="selected?.file.name"
        :empty-text="selected && !selected.info?.audio ? '这个视频没有可以试听的声音' : '添加视频后在这里显示音轨，可以试听'"
      />
    </section>
  </div>
</template>

<style scoped>
.v2a {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.panel {
  flex: 0 0 300px;
  align-self: flex-start;
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.seg.fill button {
  padding: 0 6px;
}
.seg button:disabled {
  opacity: 0.5;
  cursor: default;
}
.panel .row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-2);
}
.panel .row .seg {
  flex: 1;
}
.btn:disabled,
.icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.tip {
  line-height: 1.6;
}
.list {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.count {
  margin-left: 8px;
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
  flex: 1;
  min-height: 0;
}
.rows .row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
}
.rows .row:hover {
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
.bar {
  height: 3px;
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
.percent {
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.bad {
  color: var(--danger);
}
.spin {
  color: var(--accent);
}
.more {
  margin: 0 12px 12px;
}
.rows .row {
  cursor: pointer;
}
.rows .row.on {
  background: var(--accent-soft);
}
/* 音轨：固定在列表下方 */
.player {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  background: var(--bg-sunken);
}
</style>
