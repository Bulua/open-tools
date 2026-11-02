<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { Circle, Download, Pause, Play, Square, Trash2, Video } from "lucide-vue-next";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { formatTime } from "@/tools/audio/pcm";
import { openCapture, pickFormat, recordingFileName, recordingName, type Capture, type RecordSource } from "../recorder";

/**
 * 视频录制，注册为「屏幕录制」和「摄像头录制」两个工具：
 * 录屏幕时可以同时录系统声音和麦克风，录摄像头时可以录麦克风；可以暂停、继续，结束后预览、保存。
 * 录像只保存在本次打开的程序中，需要的请及时保存。
 */
const props = defineProps<{ source: RecordSource }>();
const source = computed(() => props.source);
const systemAudio = useStoredRef("screenRecorder.systemAudio", true);
const microphone = useStoredRef(`${props.source}Recorder.microphone`, props.source === "camera");

type State = "idle" | "starting" | "recording" | "paused";
const state = ref<State>("idle");
const elapsed = ref(0);
const error = ref("");
const warning = ref("");

interface Recording {
  id: number;
  name: string;
  blob: Blob;
  url: string;
  ext: string;
  seconds: number;
}
const recordings = shallowRef<Recording[]>([]);
const selectedId = ref<number | null>(null);
const selected = computed(() => recordings.value.find((r) => r.id === selectedId.value) ?? null);
let nextId = 1;

let capture: Capture | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let format: { mimeType: string; ext: string } | null = null;
let timer = 0;
let startedAt = 0;
let pausedTotal = 0;
let pausedAt = 0;

// 录制中实时显示画面
const live = ref<HTMLVideoElement>();

// ---------- 录制 ----------
const start = async () => {
  error.value = warning.value = "";
  format = pickFormat();
  if (!format) return (error.value = "当前环境不支持录制视频");
  state.value = "starting";
  try {
    capture = await openCapture({ source: source.value, systemAudio: systemAudio.value, microphone: microphone.value, mirror: source.value === "camera" });
  } catch (e) {
    state.value = "idle";
    error.value = e instanceof Error ? e.message : String(e);
    return;
  }
  if (capture.mirrorUnsupported) warning.value = "当前环境不支持翻转画面，录下来的是摄像头的原始画面";
  if (capture.missingSystemAudio) warning.value = "没有录到系统声音：选择时请选「整个屏幕」或浏览器标签页，并勾选「分享系统音频」";
  // 在系统提示条上点「停止共享」时结束录制
  capture.video.addEventListener("ended", stop);

  chunks = [];
  recorder = new MediaRecorder(capture.stream, { mimeType: format.mimeType });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = finish;
  recorder.start(1000);
  startedAt = performance.now();
  pausedTotal = 0;
  elapsed.value = 0;
  state.value = "recording";
  timer = window.setInterval(() => {
    if (state.value === "recording") elapsed.value = (performance.now() - startedAt - pausedTotal) / 1000;
  }, 200);
  selectedId.value = null;
  // 等预览的 <video> 出现后接上画面
  requestAnimationFrame(() => {
    if (live.value && capture) live.value.srcObject = capture.stream;
  });
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

function stop() {
  if (recorder && recorder.state !== "inactive") recorder.stop();
}

const cleanup = () => {
  clearInterval(timer);
  capture?.video.removeEventListener("ended", stop);
  capture?.release();
  capture = null;
  if (live.value) live.value.srcObject = null;
  state.value = "idle";
};

function finish() {
  const seconds = elapsed.value;
  cleanup();
  const blob = new Blob(chunks, { type: recorder?.mimeType || format?.mimeType || "video/webm" });
  recorder = null;
  chunks = [];
  if (!blob.size) return (error.value = "没有录到内容");
  const id = nextId++;
  recordings.value = [{ id, name: recordingName(id), blob, url: URL.createObjectURL(blob), ext: format?.ext ?? "webm", seconds }, ...recordings.value];
  selectedId.value = id;
}

onBeforeUnmount(() => {
  if (recorder && recorder.state !== "inactive") {
    recorder.onstop = null;
    recorder.stop();
  }
  cleanup();
  recordings.value.forEach((r) => URL.revokeObjectURL(r.url));
});

// ---------- 预览与保存 ----------
const remove = (r: Recording) => {
  URL.revokeObjectURL(r.url);
  recordings.value = recordings.value.filter((x) => x !== r);
  if (selectedId.value === r.id) selectedId.value = recordings.value[0]?.id ?? null;
};
const saving = ref<number | null>(null);
const save = async (r: Recording) => {
  saving.value = r.id;
  try {
    await saveFile(new Uint8Array(await r.blob.arrayBuffer()), recordingFileName(r.name, r.ext));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = null;
  }
};

const busy = computed(() => state.value !== "idle");
const statusText = computed(() =>
  state.value === "starting"
    ? source.value === "screen"
      ? "请在弹出的窗口中选择要录制的屏幕或窗口…"
      : "正在打开摄像头…"
    : state.value === "recording"
      ? "正在录制…"
      : state.value === "paused"
        ? "已暂停"
        : "点击下方按钮开始录制",
);
</script>

<template>
  <div class="video-recorder">
    <aside class="card panel">
      <section class="section">
        <h3>录制声音</h3>
        <label v-if="source === 'screen'" class="check"><input v-model="systemAudio" type="checkbox" :disabled="busy" />系统声音</label>
        <label class="check"><input v-model="microphone" type="checkbox" :disabled="busy" />麦克风</label>
      </section>
      <section class="section">
        <p class="tip">
          <template v-if="source === 'screen'">开始后会弹出选择窗口，可以录整个屏幕、某个窗口或浏览器标签页。要录系统声音，请选整个屏幕或标签页并勾选「分享系统音频」。</template>
          <template v-else>开始后会请求使用摄像头和麦克风的权限，录制时在右侧显示画面。</template>
        </p>
        <p class="tip">录像只保存在本次打开的程序中，关闭后会丢失，需要的请及时保存。</p>
      </section>
    </aside>

    <div class="main">
      <section class="card deck" :class="state">
        <div class="screen">
          <video v-if="busy" ref="live" autoplay muted playsinline />
          <video v-else-if="selected" :key="selected.url" :src="selected.url" controls />
          <div v-else class="placeholder">
            <Video :size="32" />
            <span>录制时在这里显示画面</span>
          </div>
        </div>
        <div class="bar">
          <span class="clock">{{ formatTime(elapsed, false) }}</span>
          <span class="status">{{ statusText }}</span>
          <div class="controls">
            <button v-if="!busy" class="rec" title="开始录制" @click="start"><Circle :size="18" fill="currentColor" />开始录制</button>
            <template v-else>
              <button class="btn" :disabled="state === 'starting'" @click="pauseOrResume">
                <template v-if="state === 'paused'"><Play :size="14" />继续</template>
                <template v-else><Pause :size="14" />暂停</template>
              </button>
              <button class="btn primary" :disabled="state === 'starting'" @click="stop"><Square :size="13" fill="currentColor" />结束</button>
            </template>
          </div>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-else-if="warning" class="tip warn">{{ warning }}</p>
      </section>

      <section class="card list">
        <div class="card-title">录像<span v-if="recordings.length" class="count">{{ recordings.length }} 段</span></div>
        <ul v-if="recordings.length" class="rows">
          <li v-for="r in recordings" :key="r.id" class="row" :class="{ on: r.id === selectedId && !busy }" @click="selectedId = r.id">
            <Video :size="15" class="icon" />
            <span class="name">{{ r.name }}</span>
            <span class="len">{{ formatTime(r.seconds, false) }} · {{ formatBytes(r.blob.size) }} · {{ r.ext.toUpperCase() }}</span>
            <button class="btn small" :disabled="saving === r.id" @click.stop="save(r)"><Download :size="14" />{{ saving === r.id ? "保存中…" : "保存" }}</button>
            <button class="icon-btn" title="删除" @click.stop="remove(r)"><Trash2 :size="14" /></button>
          </li>
        </ul>
        <p v-else class="empty">录好的视频会出现在这里，点击可以预览</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.video-recorder {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.panel {
  flex: 0 0 280px;
  align-self: flex-start;
}
.tip {
  line-height: 1.6;
}
.warn {
  color: var(--warning);
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
  flex: 1;
  min-height: 260px;
}
/* 视频绝对定位填满区域：按自身尺寸撑开会超出，底部的播放控制条被裁掉 */
.screen {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  margin: 12px 12px 0;
  border-radius: 8px;
  background: #111;
  overflow: hidden;
}
.screen video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}
.clock {
  font-family: var(--font-serif);
  font-size: 26px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.recording .clock {
  color: var(--accent);
}
.status {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-3);
}
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rec {
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border: none;
  border-radius: 18px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
}
.rec:hover {
  background: var(--accent-hover);
}
.deck > .error,
.deck > .warn {
  padding: 0 14px 12px;
}
.list {
  flex-shrink: 0;
  max-height: 40%;
}
.count {
  margin-left: 6px;
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
  cursor: pointer;
}
.row:hover {
  background: var(--hover);
}
.row.on {
  background: var(--active);
}
.icon {
  flex-shrink: 0;
  color: var(--text-3);
}
.name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.len {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.empty {
  margin: 0;
  padding: 16px;
  font-size: 13px;
  color: var(--text-3);
}
</style>
