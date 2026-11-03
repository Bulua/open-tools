<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { Translation, useI18n } from "vue-i18n";
import { Circle, Download, MousePointerClick, Pause, Play, Square, Trash2, TriangleAlert, Video } from "lucide-vue-next";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { formatTime } from "@/tools/audio/pcm";
import {
  FRAME_RATES,
  QUALITY_OPTIONS,
  disableHdr,
  hdrControllable,
  hdrEnabled,
  openCapture,
  pickFormat,
  recordingFileName,
  recordingName,
  restoreHdr,
  videoBitrate,
  type Capture,
  type RecordFrameRate,
  type RecordQuality,
  type RecordSource,
} from "../recorder";

/**
 * 视频录制，注册为「屏幕录制」和「摄像头录制」两个工具：
 * 录屏幕时可以同时录系统声音和麦克风，录摄像头时可以录麦克风；可以暂停、继续，结束后预览、保存。
 * 录像只保存在本次打开的程序中，需要的请及时保存。
 */
const props = defineProps<{ source: RecordSource }>();
const source = computed(() => props.source);
const { t } = useI18n();
const systemAudio = useStoredRef("screenRecorder.systemAudio", true);
const microphone = useStoredRef(`${props.source}Recorder.microphone`, props.source === "camera");
// 屏幕录制默认原画、60 帧；摄像头默认 1080P、30 帧（大多数摄像头不支持更高）
const quality = useStoredRef<RecordQuality>(`${props.source}Recorder.quality`, props.source === "screen" ? "original" : "1080");
const frameRate = useStoredRef<RecordFrameRate>(`${props.source}Recorder.frameRate`, props.source === "screen" ? 60 : 30);

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

// ---------- HDR：录制期间临时关闭 ----------
type HdrChoice = "disable" | "keep";
/** 记住的选择，空表示每次都问 */
const hdrChoice = useStoredRef<HdrChoice | "">("screenRecorder.hdrChoice", "");
const hdrDialog = ref<((choice: HdrChoice | null) => void) | null>(null);
const rememberHdr = ref(false);
const askHdr = () => new Promise<HdrChoice | null>((resolve) => (hdrDialog.value = resolve));
const answerHdr = (choice: HdrChoice | null) => {
  if (choice && rememberHdr.value) hdrChoice.value = choice;
  hdrDialog.value?.(choice);
  hdrDialog.value = null;
};
/** 这次录制关掉了 HDR，结束后要恢复 */
let hdrOff = false;
const restoreIfNeeded = () => {
  if (hdrOff) restoreHdr();
  hdrOff = false;
};

// ---------- 录制 ----------
const start = async () => {
  error.value = warning.value = "";
  elapsed.value = 0;
  format = pickFormat();
  if (!format) return (error.value = t("video.noRecorder"));
  if (source.value === "screen" && hdrControllable && (await hdrEnabled())) {
    const choice = hdrChoice.value || (await askHdr());
    if (!choice) return;
    if (choice === "disable") {
      state.value = "starting";
      hdrOff = (await disableHdr()) > 0;
      // 切换 HDR 时屏幕会黑一下，等它恢复后再选择画面
      if (hdrOff) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  state.value = "starting";
  try {
    capture = await openCapture({
      source: source.value,
      systemAudio: systemAudio.value,
      microphone: microphone.value,
      quality: quality.value,
      frameRate: frameRate.value,
      mirror: source.value === "camera",
    });
  } catch (e) {
    state.value = "idle";
    restoreIfNeeded();
    error.value = e instanceof Error ? e.message : String(e);
    return;
  }
  if (capture.mirrorUnsupported) warning.value = t("video.noMirror");
  if (capture.missingSystemAudio) warning.value = t("video.noSystemAudio");
  // 在系统提示条上点「停止共享」时结束录制
  capture.video.addEventListener("ended", stop);

  chunks = [];
  recorder = new MediaRecorder(capture.stream, { mimeType: format.mimeType, videoBitsPerSecond: videoBitrate(quality.value, frameRate.value), audioBitsPerSecond: 192_000 });
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
  restoreIfNeeded();
  state.value = "idle";
};

function finish() {
  const seconds = elapsed.value;
  cleanup();
  const blob = new Blob(chunks, { type: recorder?.mimeType || format?.mimeType || "video/webm" });
  recorder = null;
  chunks = [];
  if (!blob.size) return (error.value = t("video.nothingRecorded"));
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

// 网页版不能开关 HDR：屏幕开着 HDR 时提醒用户录制前自己关掉
const hdrQuery = window.matchMedia("(dynamic-range: high)");
const hdr = ref(hdrQuery.matches);
const onHdrChange = (e: MediaQueryListEvent) => (hdr.value = e.matches);
hdrQuery.addEventListener("change", onHdrChange);
onBeforeUnmount(() => hdrQuery.removeEventListener("change", onHdrChange));

const busy = computed(() => state.value !== "idle");
const statusText = computed(() =>
  state.value === "starting"
    ? source.value === "screen"
      ? t("video.pickScreen")
      : t("video.openingCamera")
    : state.value === "recording"
      ? t("video.recording")
      : state.value === "paused"
        ? t("video.paused")
        : t("video.recordHint"),
);
</script>

<template>
  <div class="video-recorder">
    <div class="side">
      <aside class="card panel">
        <section v-if="source === 'screen' && hdr && !hdrControllable" class="section hdr">
          <h3><TriangleAlert :size="14" />{{ t("video.hdrWarn") }}</h3>
          <Translation keypath="video.hdrSteps" tag="p" class="tip">
            <template #path><b>{{ t("video.hdrPath") }}</b></template>
            <template #option><b>{{ t("video.hdrOption") }}</b></template>
          </Translation>
        </section>
        <section class="section">
          <h3>{{ t("video.quality") }}</h3>
          <div class="seg fill">
            <button v-for="q in QUALITY_OPTIONS" :key="q.value" :class="{ on: quality === q.value }" :disabled="busy" @click="quality = q.value">{{ q.label || t("video.original") }}</button>
          </div>
          <h3>{{ t("video.frameRate") }}</h3>
          <div class="seg fill">
            <button v-for="f in FRAME_RATES" :key="f" :class="{ on: frameRate === f }" :disabled="busy" @click="frameRate = f">{{ t("video.fps", { n: f }) }}</button>
          </div>
          <p class="tip">{{ t("video.fpsTip") }}</p>
        </section>
        <section class="section">
          <h3>{{ t("video.recordAudio") }}</h3>
          <label v-if="source === 'screen'" class="check"><input v-model="systemAudio" type="checkbox" :disabled="busy" />{{ t("video.systemAudio") }}</label>
          <label class="check"><input v-model="microphone" type="checkbox" :disabled="busy" />{{ t("video.microphone") }}</label>
        </section>
        <section class="section">
          <p class="tip">
            <template v-if="source === 'screen'">{{ t("video.screenTip") }}</template>
            <template v-else>{{ t("video.cameraTip") }}</template>
          </p>
          <p class="tip">{{ t("video.keepTip") }}</p>
        </section>
      </aside>

      <section class="card list">
        <div class="card-title">{{ t("video.recordings") }}<span v-if="recordings.length" class="count">{{ t("video.segments", { n: recordings.length }) }}</span></div>
        <ul v-if="recordings.length" class="rows">
          <li v-for="r in recordings" :key="r.id" class="row" :class="{ on: r.id === selectedId && !busy }" @click="selectedId = r.id">
            <Video :size="15" class="icon" />
            <div class="info">
              <span class="name">{{ r.name }}</span>
              <span class="len">{{ formatTime(r.seconds, false) }} · {{ formatBytes(r.blob.size) }} · {{ r.ext.toUpperCase() }}</span>
            </div>
            <button class="icon-btn" :disabled="saving === r.id" :title="saving === r.id ? t('video.saving') : t('video.save')" @click.stop="save(r)"><Download :size="14" /></button>
            <button class="icon-btn" :title="t('video.delete')" @click.stop="remove(r)"><Trash2 :size="14" /></button>
          </li>
        </ul>
        <p v-else class="empty">{{ t("video.recordingsEmpty") }}</p>
      </section>
    </div>

    <div class="main">
      <section class="card deck" :class="state">
        <div class="screen">
          <!-- 等待选择画面时的引导：系统的选择窗口样式改不了，在这里说明怎么选 -->
          <div v-if="state === 'starting' && source === 'screen'" class="guide">
            <MousePointerClick :size="28" />
            <h4>{{ t("video.guideTitle") }}</h4>
            <ol>
              <Translation keypath="video.guide1" tag="li">
                <template #screen><b>{{ t("video.guideScreen") }}</b></template>
                <template #window><b>{{ t("video.guideWindow") }}</b></template>
              </Translation>
              <li>{{ t("video.guide2") }}</li>
              <Translation keypath="video.guide3" tag="li">
                <template #share><b>{{ t("video.guideShare") }}</b></template>
              </Translation>
            </ol>
            <p>{{ t("video.guideNote") }}</p>
          </div>
          <video v-else-if="busy" ref="live" autoplay muted playsinline />
          <video v-else-if="selected" :key="selected.url" :src="selected.url" controls />
          <div v-else class="placeholder">
            <Video :size="32" />
            <span>{{ t("video.liveHint") }}</span>
          </div>
        </div>
        <div class="bar">
          <span class="clock">{{ formatTime(elapsed, false) }}</span>
          <span class="status">{{ statusText }}</span>
          <div class="controls">
            <button v-if="!busy" class="rec" :title="t('video.startRecord')" @click="start"><Circle :size="18" fill="currentColor" />{{ t("video.startRecord") }}</button>
            <template v-else>
              <button class="btn" :disabled="state === 'starting'" @click="pauseOrResume">
                <template v-if="state === 'paused'"><Play :size="14" />{{ t("video.resume") }}</template>
                <template v-else><Pause :size="14" />{{ t("video.pause") }}</template>
              </button>
              <button class="btn primary" :disabled="state === 'starting'" @click="stop"><Square :size="13" fill="currentColor" />{{ t("video.finish") }}</button>
            </template>
          </div>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-else-if="warning" class="tip warn">{{ warning }}</p>
      </section>
    </div>

    <!-- 屏幕开着 HDR：问用户是否在录制期间临时关闭 -->
    <Transition name="modal">
      <div v-if="hdrDialog" class="overlay" @mousedown.self="answerHdr(null)" @keydown.esc="answerHdr(null)">
        <div class="dialog" role="dialog" :aria-label="t('video.hdrOn')">
          <h2><TriangleAlert :size="18" />{{ t("video.hdrOn") }}</h2>
          <Translation keypath="video.hdrDialog" tag="p">
          <template #whitish><b>{{ t("video.whitish") }}</b></template>
        </Translation>
          <p class="tip">{{ t("video.hdrFlash") }}</p>
          <label class="check"><input v-model="rememberHdr" type="checkbox" />{{ t("video.rememberChoice") }}</label>
          <footer>
            <button class="btn subtle" @click="answerHdr(null)">{{ t("video.cancel") }}</button>
            <button class="btn" @click="answerHdr('keep')">{{ t("video.recordAsIs") }}</button>
            <button class="btn primary" @click="answerHdr('disable')">{{ t("video.disableHdr") }}</button>
          </footer>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.video-recorder {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
/* 左侧：设置在上，录好的视频列表在下 */
.side {
  flex: 0 0 280px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.panel {
  flex-shrink: 0;
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
.hdr {
  background: var(--warning-soft);
}
.hdr h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--warning);
}
.hdr b {
  font-weight: 500;
  color: var(--text-2);
}
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(20, 20, 19, 0.28);
}
.dialog {
  width: min(440px, calc(100% - 48px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px 20px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
}
.dialog h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 2px;
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 400;
}
.dialog h2 svg {
  color: var(--warning);
}
.dialog p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
}
.dialog b {
  font-weight: 500;
}
.dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
.guide {
  max-width: 460px;
  padding: 24px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  line-height: 1.7;
  text-align: left;
}
.guide svg {
  color: var(--accent);
}
.guide h4 {
  margin: 8px 0 6px;
  font-size: 16px;
  font-weight: 500;
  color: #fff;
}
.guide ol {
  margin: 0;
  padding-left: 20px;
}
.guide b {
  color: #fff;
}
.guide p {
  margin: 10px 0 0;
  color: rgba(255, 255, 255, 0.55);
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
/* 录像多时列表在左侧剩余空间内滚动 */
.list {
  min-height: 0;
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
  gap: 8px;
  padding: 6px 4px 6px 8px;
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
/* 文件名一行，时长、大小、格式一行 */
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.name {
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
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty {
  margin: 0;
  padding: 16px;
  font-size: 13px;
  color: var(--text-3);
}
</style>
