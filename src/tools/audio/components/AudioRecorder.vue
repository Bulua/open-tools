<script setup lang="ts">
import { recordToolUsage } from "@/composables/toolLibrary";
import { onBeforeUnmount, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { Download, Mic, Pause, Play, Square, Trash2 } from "lucide-vue-next";
import PlayButton from "./PlayButton.vue";
import { saveFile } from "@/utils/saveFile";
import { showError } from "@/utils/errorToast";
import OutputFormat from "./OutputFormat.vue";
import { audioContext, decodeFile, encodeAudio, usePlayer } from "../audio";
import { duration, formatTime, type Pcm } from "../pcm";
import { useOutputFormat } from "../useOutputFormat";

const { t } = useI18n();

/**
 * 录音机：点按钮开始录音，可以暂停、继续，结束后试听、保存。
 * 录音只保存在本次打开的程序中，需要的请及时保存。
 */
type State = "idle" | "recording" | "paused";
const state = ref<State>("idle");
const elapsed = ref(0);

interface Recording {
  id: number;
  name: string;
  pcm: Pcm;
}
const recordings = shallowRef<Recording[]>([]);
let nextId = 1;

let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let analyser: AnalyserNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let timer = 0;
let frame = 0;
let startedAt = 0;
let pausedTotal = 0;
let pausedAt = 0;

// ---------- 实时音量条 ----------
const canvas = ref<HTMLCanvasElement>();
const levels: number[] = [];
const drawLevels = () => {
  const c = canvas.value;
  if (!c || !analyser) return;
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
  if (state.value === "recording") levels.push(peak);
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  c.width = w * dpr;
  c.height = h * dpr;
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const bars = Math.floor(w / 4);
  const recent = levels.slice(-bars);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  recent.forEach((v, i) => {
    const bh = Math.max(2, Math.min(1, v * 1.6) * h);
    ctx.fillRect(w - (recent.length - i) * 4, (h - bh) / 2, 2.5, bh);
  });
  frame = requestAnimationFrame(drawLevels);
};

// ---------- 录音 ----------
const start = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showError(t("audio.micFailed"));
    return;
  }
  chunks = [];
  levels.length = 0;
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = finish;
  recorder.start(250);
  const ac = audioContext();
  if (ac.state === "suspended") await ac.resume();
  source = ac.createMediaStreamSource(stream);
  analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  startedAt = performance.now();
  pausedTotal = 0;
  elapsed.value = 0;
  state.value = "recording";
  timer = window.setInterval(() => {
    if (state.value === "recording") elapsed.value = (performance.now() - startedAt - pausedTotal) / 1000;
  }, 100);
  drawLevels();
};

const pauseOrResume = () => {
  if (!recorder) return;
  if (state.value === "recording") {
    recorder.pause();
    pausedAt = performance.now();
    state.value = "paused";
  } else {
    recorder.resume();
    pausedTotal += performance.now() - pausedAt;
    state.value = "recording";
  }
};

const stop = () => recorder && recorder.state !== "inactive" && recorder.stop();

const cleanup = () => {
  clearInterval(timer);
  cancelAnimationFrame(frame);
  source?.disconnect();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  analyser = null;
  state.value = "idle";
};

async function finish() {
  cleanup();
  const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
  recorder = null;
  try {
    const pcm = await decodeFile(blob);
    const now = new Date();
    const name = t("audio.recordingName", { n: nextId, time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` });
    recordings.value = [{ id: nextId++, name, pcm }, ...recordings.value];
    recordToolUsage();
  } catch (e) {
    showError(e);
  }
}
onBeforeUnmount(() => {
  if (recorder && recorder.state !== "inactive") {
    recorder.onstop = null;
    recorder.stop();
  }
  cleanup();
});

// ---------- 试听与保存 ----------
const player = usePlayer();
const togglePlay = (r: Recording) => (player.playingKey.value === r.id ? player.stop() : player.play(r.pcm, 0, undefined, r.id));
const remove = (r: Recording) => {
  if (player.playingKey.value === r.id) player.stop();
  recordings.value = recordings.value.filter((x) => x !== r);
};
const { format, quality } = useOutputFormat();
const saving = ref<number | null>(null);
const save = async (r: Recording) => {
  saving.value = r.id;
  try {
    const name = r.name.replace(/[ ·:]+/g, "_");
    await saveFile(await encodeAudio(r.pcm, format.value, quality.value), `${name}.${format.value}`);
  } catch (e) {
    showError(e);
  } finally {
    saving.value = null;
  }
};
</script>

<template>
  <div class="recorder">
    <aside class="card panel">
      <section class="section">
        <h3>{{ t("audio.saveFormat") }}</h3>
        <OutputFormat />
      </section>
      <section class="section">
        <p class="tip">{{ t("audio.recordTip") }}</p>
      </section>
    </aside>

    <div class="main">
      <section class="card deck" :class="state">
        <canvas ref="canvas" class="levels" />
        <div class="clock">{{ formatTime(elapsed) }}</div>
        <p class="status">{{ state === "recording" ? t("audio.recordingNow") : state === "paused" ? t("audio.paused") : t("audio.recordHint") }}</p>
        <div class="controls">
          <template v-if="state === 'idle'">
            <button class="rec" :title="t('audio.startRecord')" @click="start"><Mic :size="26" /></button>
          </template>
          <template v-else>
            <button class="round" :title="state === 'recording' ? t('audio.pause') : t('audio.resume')" @click="pauseOrResume">
              <Pause v-if="state === 'recording'" :size="20" />
              <Play v-else :size="20" />
            </button>
            <button class="rec stop" :title="t('audio.stopRecord')" @click="stop"><Square :size="22" /></button>
          </template>
        </div>
      </section>

      <section class="card list">
        <div class="card-title">{{ t("audio.recordings") }}<span v-if="recordings.length" class="count">{{ t("audio.recordCount", { n: recordings.length }) }}</span></div>
        <ul v-if="recordings.length" class="rows">
          <li v-for="r in recordings" :key="r.id" class="row">
            <PlayButton :playing="player.playingKey.value === r.id" @click="togglePlay(r)" />
            <span class="name">{{ r.name }}</span>
            <span class="len">{{ formatTime(duration(r.pcm), false) }}</span>
            <button class="btn small" :disabled="saving === r.id" @click="save(r)"><Download :size="13" />{{ saving === r.id ? t("audio.saving") : t("audio.save") }}</button>
            <button class="icon-btn" :title="t('audio.delete')" @click="remove(r)"><Trash2 :size="13" /></button>
          </li>
        </ul>
        <p v-else class="empty">{{ t("audio.recordEmpty") }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.recorder {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.panel {
  flex: 0 0 280px;
  align-self: flex-start;
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.tip {
  line-height: 1.6;
}
.main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.deck {
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  padding: 22px 20px 20px;
}
.levels {
  width: 100%;
  height: 56px;
}
.clock {
  font-family: var(--font-serif);
  font-size: 44px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.recording .clock {
  color: var(--accent);
}
.status {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
}
.controls {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 10px;
}
.rec {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  box-shadow: 0 0 0 6px var(--accent-soft);
  transition: transform 0.15s;
}
.rec:hover {
  transform: scale(1.05);
}
.round {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  background: var(--surface);
  color: var(--text);
}
.round:hover {
  background: var(--hover);
}
.list {
  flex: 1;
  min-height: 0;
}
.count {
  font-weight: 400;
  color: var(--text-3);
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
  padding: 6px 8px;
  border-radius: 8px;
}
.row:hover {
  background: var(--hover);
}
.name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}
.len {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.empty {
  margin: 0;
  padding: 16px;
  font-size: 13px;
  color: var(--text-3);
}
</style>
