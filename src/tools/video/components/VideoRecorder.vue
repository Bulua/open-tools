<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
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
  if (!format) return (error.value = "当前环境不支持录制视频");
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
  if (capture.mirrorUnsupported) warning.value = "当前环境不支持翻转画面，录下来的是摄像头的原始画面";
  if (capture.missingSystemAudio) warning.value = "没有录到系统声音：选择时请选「整个屏幕」或浏览器标签页，并勾选「分享系统音频」";
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
      ? "请在弹出的窗口中选择要录制的画面…"
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
      <section v-if="source === 'screen' && hdr && !hdrControllable" class="section hdr">
        <h3><TriangleAlert :size="14" />屏幕开着 HDR，录出来会发白</h3>
        <p class="tip">
          录制前请在 Windows <b>设置 → 系统 → 屏幕</b>中关闭<b>「使用 HDR」</b>（没有这一项就关闭「自动管理应用的颜色」），录完再打开。关闭后录出来的颜色和屏幕上一致。
        </p>
      </section>
      <section class="section">
        <h3>清晰度</h3>
        <div class="seg fill">
          <button v-for="q in QUALITY_OPTIONS" :key="q.value" :class="{ on: quality === q.value }" :disabled="busy" @click="quality = q.value">{{ q.label }}</button>
        </div>
        <h3>帧率</h3>
        <div class="seg fill">
          <button v-for="f in FRAME_RATES" :key="f" :class="{ on: frameRate === f }" :disabled="busy" @click="frameRate = f">{{ f }} 帧</button>
        </div>
        <p class="tip">清晰度、帧率越高，画面越清楚、越流畅，文件也越大。录教程、文档选 1080P / 30 帧就够了，录游戏、动画可以选 60 帧。</p>
      </section>
      <section class="section">
        <h3>录制声音</h3>
        <label v-if="source === 'screen'" class="check"><input v-model="systemAudio" type="checkbox" :disabled="busy" />系统声音</label>
        <label class="check"><input v-model="microphone" type="checkbox" :disabled="busy" />麦克风</label>
      </section>
      <section class="section">
        <p class="tip">
          <template v-if="source === 'screen'">点「开始录制」后会弹出系统的选择窗口，选好要录的画面再点「共享」。要录系统声音，请选「整个屏幕」。</template>
          <template v-else>开始后会请求使用摄像头和麦克风的权限，录制时在右侧显示画面。</template>
        </p>
        <p class="tip">录像只保存在本次打开的程序中，关闭后会丢失，需要的请及时保存。</p>
      </section>
    </aside>

    <div class="main">
      <section class="card deck" :class="state">
        <div class="screen">
          <!-- 等待选择画面时的引导：系统的选择窗口样式改不了，在这里说明怎么选 -->
          <div v-if="state === 'starting' && source === 'screen'" class="guide">
            <MousePointerClick :size="28" />
            <h4>请在弹出的窗口里选择要录制的画面</h4>
            <ol>
              <li>点窗口上方的<b>「整个屏幕」</b>（要录系统声音必须选它），或者<b>「窗口」</b>只录某一个程序</li>
              <li>点一下下面要录制的画面，选中后会有边框</li>
              <li>点右下角的<b>「共享」</b>，就开始录制了</li>
            </ol>
            <p>不要选 Open Tools 自己的窗口，否则画面会一层套一层。</p>
          </div>
          <video v-else-if="busy" ref="live" autoplay muted playsinline />
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

    <!-- 屏幕开着 HDR：问用户是否在录制期间临时关闭 -->
    <div v-if="hdrDialog" class="overlay" @mousedown.self="answerHdr(null)" @keydown.esc="answerHdr(null)">
      <div class="dialog" role="dialog" aria-label="屏幕开着 HDR">
        <h2><TriangleAlert :size="18" />屏幕开着 HDR</h2>
        <p>直接录制的话，录出来的画面会<b>整体发白</b>。可以在录制期间临时关闭 HDR，录完自动恢复。</p>
        <p class="tip">切换 HDR 时屏幕会黑一下，属于正常现象。</p>
        <label class="check"><input v-model="rememberHdr" type="checkbox" />记住我的选择，下次不再询问</label>
        <footer>
          <button class="btn subtle" @click="answerHdr(null)">取消</button>
          <button class="btn" @click="answerHdr('keep')">直接录制</button>
          <button class="btn primary" @click="answerHdr('disable')">临时关闭 HDR 并录制</button>
        </footer>
      </div>
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
