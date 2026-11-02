<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { ArrowDown, ArrowUp, Download, GripVertical, Pause, Play, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile } from "@/utils/saveFile";
import OutputFormat from "./OutputFormat.vue";
import Waveform from "./Waveform.vue";
import { decodeFile, encodeAudio, resample, usePlayer } from "../audio";
import { concat, duration, formatTime, type Pcm } from "../pcm";
import { useOutputFormat } from "../useOutputFormat";

/**
 * 音频拼接：多个音频按顺序拼成一个，拖动或用箭头调整顺序，片段之间可以留一点空白。
 * 下方的音轨显示拼接后的效果，可以直接试听。
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

/** 按顺序拼接：统一到最高的采样率 */
const joinAll = async (list: Item[]) => {
  const rate = Math.max(...list.map((i) => i.pcm.sampleRate));
  const parts = await Promise.all(list.map((i) => resample(i.pcm, rate)));
  return concat(parts, gap.value);
};

// ---------- 拼接后的音轨：顺序、空白变化后重新生成 ----------
const joined = shallowRef<Pcm | null>(null);
const joinedPosition = ref(0);
let joinToken = 0;
watch(
  [items, gap],
  async () => {
    const current = ++joinToken;
    if (player.playingKey.value === "all") player.stop();
    joinedPosition.value = 0;
    if (!items.value.length) return (joined.value = null);
    const result = await joinAll(items.value);
    if (current === joinToken) joined.value = result;
  },
  { immediate: true },
);
watch(player.position, (t) => player.playingKey.value === "all" && (joinedPosition.value = t));
const toggleJoined = () => {
  if (!joined.value) return;
  if (player.playingKey.value === "all") return player.stop();
  const from = joinedPosition.value >= duration(joined.value) - 0.05 ? 0 : joinedPosition.value;
  player.play(joined.value, from, undefined, "all");
};
const seekJoined = (t: number) => {
  joinedPosition.value = t;
  if (player.playingKey.value === "all" && joined.value) player.play(joined.value, t, undefined, "all");
};

// ---------- 导出 ----------
const { format, quality } = useOutputFormat();
const saving = ref(false);
const save = async () => {
  saving.value = true;
  error.value = "";
  try {
    const data = await encodeAudio(joined.value ?? (await joinAll(items.value)), format.value, quality.value);
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
      <!-- 拼接后的音轨：没有音频时显示一条空的音轨 -->
      <div class="joined">
        <div class="joined-head">
          <button class="joined-play" :disabled="!joined" :title="player.playingKey.value === 'all' ? '暂停' : '试听拼接效果'" @click="toggleJoined">
            <Pause v-if="player.playingKey.value === 'all'" :size="16" />
            <Play v-else :size="16" />
          </button>
          <span class="joined-title">拼接效果</span>
          <span class="joined-time">{{ formatTime(joinedPosition, false) }} / {{ formatTime(joined ? duration(joined) : 0, false) }}</span>
        </div>
        <Waveform class="joined-wave" :pcm="joined" :position="joined ? joinedPosition : null" :selectable="false" @seek="seekJoined">
          <span v-if="!joined" class="joined-empty">添加音频后在这里显示拼接后的音轨，可以试听</span>
        </Waveform>
      </div>
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
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow: auto;
}
/* 拼接后的音轨：固定在列表下方 */
.joined {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 12px;
  border-top: 1px solid var(--border);
  background: var(--bg-sunken);
}
.joined-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.joined-play {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
}
.joined-play:disabled {
  opacity: 0.4;
  cursor: default;
}
.joined-title {
  font-size: 13px;
  font-weight: 500;
}
.joined-time {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.joined-wave {
  height: 96px;
}
.joined-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-3);
  pointer-events: none;
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
