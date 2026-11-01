<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import { ArrowDown, ArrowUp, Download, GripVertical, Pause, Play, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile } from "@/utils/saveFile";
import OutputFormat from "./OutputFormat.vue";
import { decodeFile, encodeAudio, resample, usePlayer } from "../audio";
import { concat, duration, formatTime, type Pcm } from "../pcm";
import { useOutputFormat } from "../useOutputFormat";

/**
 * 音频拼接：多个音频按顺序拼成一个，拖动或用箭头调整顺序，片段之间可以留一点空白。
 */
interface Item {
  id: number;
  name: string;
  pcm: Pcm;
}
const items = shallowRef<Item[]>([]);
const loading = ref(false);
const error = ref("");
let nextId = 1;

const GAPS = [
  { value: 0, label: "无" },
  { value: 0.5, label: "0.5 秒" },
  { value: 1, label: "1 秒" },
  { value: 2, label: "2 秒" },
];
const gap = useStoredRef("audio.joinGap", 0);

const addFiles = async (files: File[]) => {
  loading.value = true;
  error.value = "";
  for (const file of files) {
    try {
      items.value = [...items.value, { id: nextId++, name: file.name, pcm: await decodeFile(file) }];
    } catch (e) {
      error.value = `${file.name}：${e instanceof Error ? e.message : e}`;
    }
  }
  loading.value = false;
};
const remove = (item: Item) => {
  if (player.playingKey.value === item.id) player.stop();
  items.value = items.value.filter((i) => i !== item);
};
const move = (index: number, delta: number) => {
  const list = [...items.value];
  const [item] = list.splice(index, 1);
  list.splice(Math.max(0, Math.min(list.length, index + delta)), 0, item);
  items.value = list;
};

// 拖动排序
const dragIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);
const onDrop = (index: number) => {
  if (dragIndex.value !== null && dragIndex.value !== index) move(dragIndex.value, index - dragIndex.value);
  dragIndex.value = overIndex.value = null;
};

const total = computed(() => items.value.reduce((s, i) => s + duration(i.pcm), 0) + gap.value * Math.max(0, items.value.length - 1));

const player = usePlayer();
const togglePlay = (item: Item) => (player.playingKey.value === item.id ? player.stop() : player.play(item.pcm, 0, undefined, item.id));

// ---------- 导出 ----------
const { format, quality } = useOutputFormat();
const saving = ref(false);
const save = async () => {
  saving.value = true;
  error.value = "";
  try {
    // 统一到最高的采样率再拼接
    const rate = Math.max(...items.value.map((i) => i.pcm.sampleRate));
    const parts = await Promise.all(items.value.map((i) => resample(i.pcm, rate)));
    const data = await encodeAudio(concat(parts, gap.value), format.value, quality.value);
    await saveFile(data, `拼接音频.${format.value}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="join">
    <aside class="card panel">
      <section class="section">
        <h3>片段之间留空白</h3>
        <div class="seg fill">
          <button v-for="g in GAPS" :key="g.value" :class="{ on: gap === g.value }" @click="gap = g.value">{{ g.label }}</button>
        </div>
      </section>
      <section class="section">
        <h3>导出</h3>
        <OutputFormat />
        <button class="btn primary full" :disabled="items.length < 2 || saving" @click="save">
          <Download :size="14" />{{ saving ? "拼接中…" : "拼接并保存" }}
        </button>
        <p class="tip">{{ items.length < 2 ? "至少添加两个音频" : `共 ${items.length} 段，总时长 ${formatTime(total, false)}` }}</p>
        <p v-if="error" class="error">{{ error }}</p>
      </section>
    </aside>

    <section class="card list">
      <div class="card-title">
        拼接顺序<span class="hint">从上到下依次拼接，可以拖动调整</span>
        <button v-if="items.length" class="btn small subtle push" @click="(player.stop(), (items = []))">清空</button>
      </div>
      <FileDropZone
        v-if="!items.length"
        class="drop"
        accept="audio/*,video/*,.m4a,.flac,.ogg,.aac"
        multiple
        :paste="false"
        :title="loading ? '正在读取…' : '拖入要拼接的音频，或点击选择（可多选）'"
        hint="按添加的顺序排列，之后可以调整"
        @files="addFiles"
      />
      <template v-else>
        <ol class="rows">
          <li
            v-for="(item, i) in items"
            :key="item.id"
            class="row"
            :class="{ over: overIndex === i && dragIndex !== i, dragging: dragIndex === i }"
            draggable="true"
            @dragstart="dragIndex = i"
            @dragover.prevent="overIndex = i"
            @drop.prevent="onDrop(i)"
            @dragend="dragIndex = overIndex = null"
          >
            <GripVertical :size="14" class="grip" />
            <span class="no">{{ i + 1 }}</span>
            <button class="play" :title="player.playingKey.value === item.id ? '停止' : '试听'" @click="togglePlay(item)">
              <Pause v-if="player.playingKey.value === item.id" :size="13" />
              <Play v-else :size="13" />
            </button>
            <span class="name" :title="item.name">{{ item.name }}</span>
            <span class="len">{{ formatTime(duration(item.pcm), false) }}</span>
            <button class="icon-btn" title="上移" :disabled="i === 0" @click="move(i, -1)"><ArrowUp :size="13" /></button>
            <button class="icon-btn" title="下移" :disabled="i === items.length - 1" @click="move(i, 1)"><ArrowDown :size="13" /></button>
            <button class="icon-btn" title="移除" @click="remove(item)"><X :size="13" /></button>
          </li>
        </ol>
        <FileDropZone compact class="more" accept="audio/*,video/*,.m4a,.flac,.ogg,.aac" multiple :paste="false" :title="loading ? '正在读取…' : '继续添加音频'" @files="addFiles" />
      </template>
    </section>
  </div>
</template>

<style scoped>
.join {
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
.seg.fill {
  display: flex;
}
.seg.fill button {
  flex: 1;
}
.btn.full {
  justify-content: center;
}
.btn:disabled,
.icon-btn:disabled {
  opacity: 0.4;
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
.error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}
.list {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.card-title .hint {
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
  gap: 10px;
  padding: 7px 8px;
  border-radius: 8px;
  border-top: 2px solid transparent;
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
.play {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}
.play:hover {
  background: var(--accent);
  color: #fff;
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.len {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.more {
  margin: 0 12px 12px;
}
</style>
