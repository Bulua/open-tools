<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { Download, Pause, Play, RefreshCw, Scissors, SquareX, Undo2, Volume2, TrendingDown, TrendingUp } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { saveFile } from "@/utils/saveFile";
import Waveform from "./Waveform.vue";
import OutputFormat from "./OutputFormat.vue";
import { decodeFile, encodeAudio, outputName, usePlayer } from "../audio";
import { applyGain, duration, fade, formatTime, normalize, removeRange, slice, type Pcm } from "../pcm";
import { useOutputFormat } from "../useOutputFormat";

/**
 * 音频剪辑：在波形上拖动选择一段，保留或删除；淡入淡出、音量调整。可以撤销。
 * 空格键播放 / 暂停；有选区时只播放选区。
 */
const fileName = ref("");
const history = shallowRef<Pcm[]>([]);
const dropZone = ref<InstanceType<typeof FileDropZone>>();
const pcm = computed(() => history.value[history.value.length - 1] ?? null);
const selection = ref<[number, number] | null>(null);
const position = ref(0);
const volume = ref(100);
const loading = ref(false);
const error = ref("");

const onFiles = async ([file]: File[]) => {
  if (!file) return;
  loading.value = true;
  error.value = "";
  player.stop();
  try {
    history.value = [await decodeFile(file)];
    fileName.value = file.name;
    selection.value = null;
    position.value = 0;
    volume.value = 100;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
};

/** 修改后记入历史（最多保留 10 步，音频数据较大） */
const push = (next: Pcm) => {
  player.stop();
  history.value = [...history.value.slice(-9), next];
  selection.value = null;
  position.value = Math.min(position.value, duration(next));
};
const undo = () => {
  if (history.value.length < 2) return;
  player.stop();
  history.value = history.value.slice(0, -1);
  selection.value = null;
};

// ---------- 编辑 ----------
const sel = computed(() => (selection.value && selection.value[1] - selection.value[0] > 0.01 ? selection.value : null));
const keep = () => pcm.value && sel.value && push(slice(pcm.value, ...sel.value));
const cut = () => pcm.value && sel.value && push(removeRange(pcm.value, ...sel.value));
/** 有选区时作用于选区；没有时作用于开头（淡入）或结尾（淡出）3 秒 */
const fadeIn = () => {
  if (!pcm.value) return;
  const [a, b] = sel.value ?? [0, Math.min(3, duration(pcm.value))];
  push(fade(pcm.value, a, b, "in"));
};
const fadeOut = () => {
  if (!pcm.value) return;
  const total = duration(pcm.value);
  const [a, b] = sel.value ?? [Math.max(0, total - 3), total];
  push(fade(pcm.value, a, b, "out"));
};
const autoVolume = () => pcm.value && push(normalize(pcm.value));

// ---------- 播放 ----------
const player = usePlayer();
const toggle = () => {
  if (!pcm.value) return;
  if (player.playing.value) {
    player.stop();
    return;
  }
  const [from, to] = sel.value ?? [position.value >= duration(pcm.value) - 0.05 ? 0 : position.value, undefined];
  player.play(pcm.value, from, to, null, volume.value / 100);
};
watch(player.position, (t) => player.playing.value && (position.value = t));
watch(volume, (v) => player.setGain(v / 100));
const seek = (t: number) => {
  position.value = t;
  if (player.playing.value && pcm.value) player.play(pcm.value, t, undefined, null, volume.value / 100);
};
useWindowEvent("keydown", (e) => {
  if (e.code !== "Space" || (e.target instanceof Element && e.target.closest("input, textarea, button"))) return;
  e.preventDefault();
  toggle();
});

// ---------- 导出 ----------
const { format, quality } = useOutputFormat();
const saving = ref(false);
const download = async () => {
  if (!pcm.value) return;
  saving.value = true;
  try {
    const data = await encodeAudio(applyGain(pcm.value, volume.value / 100), format.value, quality.value);
    await saveFile(data, outputName(fileName.value, format.value, "_剪辑"));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="editor">
    <aside class="card panel">
      <section class="section">
        <h3>选区</h3>
        <p class="sel-info">
          <template v-if="sel">{{ formatTime(sel[0]) }} – {{ formatTime(sel[1]) }}<em>（{{ (sel[1] - sel[0]).toFixed(1) }} 秒）</em></template>
          <template v-else>在右侧波形上拖动选择一段</template>
        </p>
        <div class="actions">
          <button class="btn" :disabled="!sel" title="只保留选中的部分" @click="keep"><Scissors :size="14" />保留选区</button>
          <button class="btn" :disabled="!sel" title="删除选中的部分" @click="cut"><SquareX :size="14" />删除选区</button>
          <button class="btn" :disabled="!pcm" title="有选区时作用于选区，否则作用于开头 3 秒" @click="fadeIn"><TrendingUp :size="14" />淡入</button>
          <button class="btn" :disabled="!pcm" title="有选区时作用于选区，否则作用于结尾 3 秒" @click="fadeOut"><TrendingDown :size="14" />淡出</button>
        </div>
      </section>

      <section class="section">
        <h3>
          音量
          <button class="link" :disabled="!pcm" title="把最响的地方调到合适的音量，适合声音太小的录音" @click="autoVolume">自动调整</button>
        </h3>
        <label class="slider">
          <Volume2 :size="14" />
          <input v-model.number="volume" type="range" min="0" max="200" step="5" :disabled="!pcm" @dblclick="volume = 100" />
          <em>{{ volume }}%</em>
        </label>
      </section>

      <section class="section">
        <h3>导出</h3>
        <OutputFormat />
        <button class="btn primary full" :disabled="!pcm || saving" @click="download">
          <Download :size="14" />{{ saving ? "导出中…" : "保存音频" }}
        </button>
        <p v-if="error" class="error">{{ error }}</p>
      </section>
    </aside>

    <section class="card stage">
      <div class="card-title">
        <span class="file" :title="fileName">{{ fileName || "未选择音频" }}</span>
        <template v-if="pcm">
          <button class="btn small subtle push" :disabled="history.length < 2" @click="undo"><Undo2 :size="14" />撤销</button>
          <button class="btn small subtle" title="更换音频" @click="dropZone?.open()"><RefreshCw :size="14" />更换</button>
        </template>
      </div>

      <!-- 加载后隐藏但保留：「更换」按钮由它打开选择框 -->
      <FileDropZone
        v-show="!pcm"
        ref="dropZone"
        class="drop"
        accept="audio/*,video/*,.m4a,.flac,.ogg,.aac"
        :paste="false"
        :title="loading ? '正在读取…' : '拖入音频文件，或点击选择'"
        hint="也可以拖入视频文件，剪辑其中的声音"
        @files="onFiles"
      >
        <span v-if="error" class="error">{{ error }}</span>
      </FileDropZone>

      <!-- 音轨：没有文件时显示一条空的音轨 -->
      <Waveform v-model:selection="selection" class="wave" :class="{ empty: !pcm }" :pcm="pcm" :position="pcm ? position : null" @seek="seek" />
      <div class="transport">
        <button class="play" :disabled="!pcm" :title="player.playing.value ? '暂停（空格）' : '播放（空格）'" @click="toggle">
          <Pause v-if="player.playing.value" :size="18" />
          <Play v-else :size="18" />
        </button>
        <span class="time">{{ formatTime(position) }} <em>/ {{ formatTime(pcm ? duration(pcm) : 0) }}</em></span>
        <span class="hint">{{ !pcm ? "添加音频后在上方显示波形" : `点击波形定位，拖动选择一段；${sel ? "播放时只播放选区" : "空格键播放 / 暂停"}` }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.editor {
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
  display: flex;
  align-items: center;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.link {
  margin-left: auto;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  color: var(--accent);
}
.link:disabled {
  color: var(--text-3);
}
.sel-info {
  margin: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.sel-info em {
  font-style: normal;
  color: var(--text-3);
}
.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.actions .btn {
  justify-content: center;
}
.slider {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.slider input {
  flex: 1;
  accent-color: var(--accent);
}
.slider em {
  flex: 0 0 38px;
  font-style: normal;
  text-align: right;
  color: var(--text-3);
}
.btn.full {
  justify-content: center;
}
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.btn.small {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
}
.error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}
.stage {
  flex: 1;
  min-width: 0;
  min-height: 360px;
}
.file {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.push {
  margin-left: auto;
}
.drop {
  flex: 1;
  margin: 12px;
}
.wave {
  flex: 1;
  margin: 16px 16px 8px;
}
/* 没有文件时：上方是拖入区域，下方是一条较矮的空音轨 */
.wave.empty {
  flex: 0 0 120px;
  margin-top: 4px;
}
.play:disabled {
  opacity: 0.4;
  cursor: default;
}
.transport {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px 14px;
}
.play {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
}
.play:hover {
  background: var(--accent-hover);
}
.time {
  font-family: var(--font-mono);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.time em {
  font-style: normal;
  color: var(--text-3);
}
.hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
}
</style>
