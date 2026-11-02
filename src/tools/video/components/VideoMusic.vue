<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { Download, FileVideo, LoaderCircle, Minus, Music, Plus, RefreshCw, Repeat, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import ProgressBar from "@/components/common/ProgressBar.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { decodeFile } from "@/tools/audio/audio";
import { duration as pcmDuration, type Pcm } from "@/tools/audio/pcm";
import { VIDEO_ACCEPT, formatDuration, probeVideo } from "../media";
import { FADE_SECONDS, addMusic, musicSegments, musicTimeAt, type MusicRepeat } from "../music";

/**
 * 视频配乐：选一个视频和一首音乐，调音乐和原声的音量，选择循环播放或播放几次，
 * 右侧预览时音乐跟着视频同步播放，下方时间轴显示音乐在哪些时段播放。画面不重新编码。
 */
const AUDIO_ACCEPT = "audio/*,.mp3,.m4a,.aac,.flac,.ogg,.wav";

// ---------- 文件 ----------
interface VideoFile {
  file: File;
  url: string;
  duration: number;
  hasAudio: boolean;
}
interface MusicFile {
  file: File;
  url: string;
  pcm: Pcm;
}
const video = shallowRef<VideoFile | null>(null);
const music = shallowRef<MusicFile | null>(null);
const loadingVideo = ref(false);
const loadingMusic = ref(false);
const error = ref("");

const videoZone = ref<InstanceType<typeof FileDropZone>>();
const musicZone = ref<InstanceType<typeof FileDropZone>>();

const onVideo = async ([file]: File[]) => {
  if (!file) return;
  error.value = "";
  loadingVideo.value = true;
  try {
    const info = await probeVideo(file);
    if (!info.width) throw new Error("这个文件里没有画面");
    if (video.value) URL.revokeObjectURL(video.value.url);
    video.value = { file, url: URL.createObjectURL(file), duration: info.duration, hasAudio: !!info.audio };
    clearResult();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loadingVideo.value = false;
  }
};

const onMusic = async ([file]: File[]) => {
  if (!file) return;
  error.value = "";
  loadingMusic.value = true;
  try {
    const pcm = await decodeFile(file);
    if (music.value) URL.revokeObjectURL(music.value.url);
    music.value = { file, url: URL.createObjectURL(file), pcm };
    clearResult();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loadingMusic.value = false;
  }
};

const removeMusic = () => {
  if (music.value) URL.revokeObjectURL(music.value.url);
  music.value = null;
  clearResult();
};

const musicDuration = computed(() => (music.value ? pcmDuration(music.value.pcm) : 0));

// ---------- 设置 ----------
const musicVolume = useStoredRef("videoMusic.musicVolume", 80);
const originalVolume = useStoredRef("videoMusic.originalVolume", 100);
const mode = useStoredRef<"loop" | "times">("videoMusic.mode", "loop");
const times = useStoredRef("videoMusic.times", 1);
const fadeOut = useStoredRef("videoMusic.fadeOut", true);
const repeat = computed<MusicRepeat>(() => (mode.value === "loop" ? "loop" : times.value));
const setTimes = (n: number) => (times.value = Math.min(99, Math.max(1, Math.round(n) || 1)));

// 音乐在视频里播放的时段，画在时间轴上
const segments = computed(() => (video.value && music.value ? musicSegments(video.value.duration, musicDuration.value, repeat.value) : []));
const summary = computed(() => {
  if (!video.value || !music.value) return "";
  const v = video.value.duration;
  const m = musicDuration.value;
  if (mode.value === "loop") return m >= v ? "音乐比视频长，只播放到视频结束" : `音乐循环播放约 ${(v / m).toFixed(1)} 遍，直到视频结束`;
  const end = Math.min(v, times.value * m);
  return end >= v ? `播放 ${times.value} 次，到视频结束时还没播完` : `播放 ${times.value} 次，${formatDuration(end)} 之后没有音乐`;
});

// ---------- 预览：音乐跟着视频播放 ----------
const player = ref<HTMLVideoElement>();
const musicEl = ref<HTMLAudioElement>();
const current = ref(0);
let frame = 0;

const sync = () => {
  const v = player.value;
  const a = musicEl.value;
  if (!v) return;
  current.value = v.currentTime;
  v.volume = originalVolume.value / 100;
  if (!a || !music.value) return;
  const t = musicTimeAt(v.currentTime, musicDuration.value, repeat.value);
  if (t === null || v.paused) {
    if (!a.paused) a.pause();
  } else {
    // 偏差超过 0.25 秒才调整，避免声音断断续续
    if (Math.abs(a.currentTime - t) > 0.25) a.currentTime = t;
    if (a.paused) a.play().catch(() => {});
  }
  // 结尾淡出
  let gain = musicVolume.value / 100;
  const end = video.value?.duration ?? 0;
  const lastSegment = segments.value[segments.value.length - 1];
  if (fadeOut.value && lastSegment && lastSegment.end >= end && end - v.currentTime < FADE_SECONDS) gain *= Math.max(0, (end - v.currentTime) / FADE_SECONDS);
  a.volume = Math.min(1, Math.max(0, gain));
};
const loop = () => {
  sync();
  if (player.value && !player.value.paused) frame = requestAnimationFrame(loop);
};
const onPlay = () => {
  cancelAnimationFrame(frame);
  loop();
};
const onPause = () => {
  cancelAnimationFrame(frame);
  sync();
};
watch([musicVolume, originalVolume, repeat, fadeOut, music], sync);
const seek = (e: MouseEvent) => {
  const v = player.value;
  if (!v || !video.value) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  v.currentTime = ((e.clientX - rect.left) / rect.width) * video.value.duration;
  sync();
};
const percent = (t: number) => `${(t / (video.value?.duration || 1)) * 100}%`;

// ---------- 导出 ----------
const working = ref(false);
const progress = ref(0);
const result = shallowRef<{ data: Uint8Array; url: string } | null>(null);
function clearResult() {
  if (result.value) URL.revokeObjectURL(result.value.url);
  result.value = null;
}
watch([musicVolume, originalVolume, repeat, fadeOut], clearResult);

const start = async () => {
  if (!video.value || !music.value) return;
  player.value?.pause();
  error.value = "";
  clearResult();
  working.value = true;
  progress.value = 0;
  try {
    const data = await addMusic(
      video.value.file,
      music.value.pcm,
      { musicVolume: musicVolume.value / 100, originalVolume: originalVolume.value / 100, repeat: repeat.value, fadeOut: fadeOut.value },
      (p) => (progress.value = p),
    );
    result.value = { data, url: URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: "video/mp4" })) };
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    working.value = false;
  }
};
const save = () => result.value && video.value && saveFile(result.value.data, `${video.value.file.name.replace(/\.[^.]+$/, "")}_配乐.mp4`);

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  [video.value?.url, music.value?.url, result.value?.url].forEach((u) => u && URL.revokeObjectURL(u));
});
</script>

<template>
  <div class="video-music">
    <aside class="card panel">
      <!-- 视频 -->
      <section class="section">
        <h3>视频</h3>
        <div v-if="video" class="file">
          <FileVideo :size="16" class="file-icon" />
          <span class="file-info">
            <span class="file-name" :title="video.file.name">{{ video.file.name }}</span>
            <span class="file-meta">{{ formatDuration(video.duration) }} · {{ video.hasAudio ? "有原声" : "没有原声" }}</span>
          </span>
          <button class="icon-btn" title="更换视频" :disabled="working" @click="videoZone?.open()"><RefreshCw :size="14" /></button>
        </div>
        <FileDropZone
          v-show="!video"
          ref="videoZone"
          compact
          :accept="VIDEO_ACCEPT"
          :paste="false"
          :title="loadingVideo ? '正在读取…' : '选择视频'"
          @files="onVideo"
        />
      </section>

      <!-- 音乐 -->
      <section class="section">
        <h3>音乐</h3>
        <div v-if="music" class="file">
          <Music :size="16" class="file-icon" />
          <span class="file-info">
            <span class="file-name" :title="music.file.name">{{ music.file.name }}</span>
            <span class="file-meta">{{ formatDuration(musicDuration) }}</span>
          </span>
          <button class="icon-btn" title="更换音乐" :disabled="working" @click="musicZone?.open()"><RefreshCw :size="14" /></button>
          <button class="icon-btn" title="去掉音乐" :disabled="working" @click="removeMusic"><X :size="14" /></button>
        </div>
        <FileDropZone
          v-show="!music"
          ref="musicZone"
          compact
          :accept="AUDIO_ACCEPT"
          :paste="false"
          :title="loadingMusic ? '正在读取…' : '选择音乐'"
          @files="onMusic"
        />
      </section>

      <!-- 音量 -->
      <section class="section">
        <h3>音量</h3>
        <label class="slider">
          <span class="label">音乐</span>
          <input v-model.number="musicVolume" type="range" min="0" max="100" step="5" :disabled="working" />
          <em>{{ musicVolume }}%</em>
        </label>
        <label class="slider" :class="{ dim: video && !video.hasAudio }">
          <span class="label">原声</span>
          <input v-model.number="originalVolume" type="range" min="0" max="100" step="5" :disabled="working || (!!video && !video.hasAudio)" />
          <em>{{ originalVolume ? `${originalVolume}%` : "静音" }}</em>
        </label>
      </section>

      <!-- 播放方式 -->
      <section class="section">
        <h3>音乐播放</h3>
        <div class="seg fill">
          <button :class="{ on: mode === 'loop' }" :disabled="working" @click="mode = 'loop'"><Repeat :size="14" />循环播放</button>
          <button :class="{ on: mode === 'times' }" :disabled="working" @click="mode = 'times'">播放几次</button>
        </div>
        <div v-if="mode === 'times'" class="times">
          <button class="icon-btn" title="少一次" :disabled="working || times <= 1" @click="setTimes(times - 1)"><Minus :size="14" /></button>
          <input class="field" type="number" min="1" max="99" :value="times" :disabled="working" @change="setTimes(Number(($event.target as HTMLInputElement).value))" />
          <button class="icon-btn" title="多一次" :disabled="working || times >= 99" @click="setTimes(times + 1)"><Plus :size="14" /></button>
          <span>次</span>
        </div>
        <label class="check"><input v-model="fadeOut" type="checkbox" :disabled="working" />视频结束时音乐逐渐变小</label>
      </section>

      <!-- 导出 -->
      <section class="section">
        <button class="btn primary full" :disabled="!video || !music || working" @click="start">
          <LoaderCircle v-if="working" :size="14" class="spin" />
          {{ working ? `正在合成 ${Math.round(progress * 100)}%` : "合成视频" }}
        </button>
        <ProgressBar v-if="working" :value="progress" />
        <p v-if="error" class="error">{{ error }}</p>
        <template v-if="result">
          <p class="tip">合成完成 · {{ formatBytes(result.data.length) }}，画面没有重新编码</p>
          <button class="btn full" @click="save"><Download :size="14" />保存视频</button>
        </template>
        <p v-else-if="!video || !music" class="tip">选好视频和音乐后，可以先在右侧试听效果，满意了再合成。</p>
      </section>
    </aside>

    <section class="card stage">
      <div class="card-title">
        <span class="grow">{{ result ? "合成结果" : "预览" }}</span>
        <span v-if="!result && summary" class="hint">{{ summary }}</span>
        <button v-if="result" class="btn small subtle" @click="clearResult">返回预览</button>
      </div>

      <div class="screen">
        <video v-if="result" :key="result.url" :src="result.url" controls />
        <template v-else-if="video">
          <video ref="player" :src="video.url" controls @play="onPlay" @pause="onPause" @seeked="sync" @timeupdate="sync" @ended="onPause" />
          <audio v-if="music" ref="musicEl" :src="music.url" preload="auto" />
        </template>
        <div v-else class="placeholder">
          <FileVideo :size="32" />
          <span>选择视频和音乐后，在这里预览效果</span>
        </div>
      </div>

      <!-- 时间轴：音乐在视频里的哪些时段播放 -->
      <div v-if="video && !result" class="timeline">
        <div class="track" title="点击跳到这个位置" @click="seek">
          <span
            v-for="(s, i) in segments"
            :key="i"
            class="segment"
            :style="{ left: percent(s.start), width: percent(s.end - s.start) }"
            :title="`第 ${i + 1} 遍：${formatDuration(s.start)} – ${formatDuration(s.end)}`"
          >
            <span v-if="segments.length > 1" class="no">{{ i + 1 }}</span>
          </span>
          <span class="cursor" :style="{ left: percent(current) }" />
        </div>
        <div class="ticks">
          <span>0:00</span>
          <span>{{ music ? "音乐" : "还没有选择音乐" }}</span>
          <span>{{ formatDuration(video.duration) }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.video-music {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.panel {
  flex: 0 0 300px;
  max-height: 100%;
  overflow: auto;
  align-self: flex-start;
}
.grow {
  flex: 1;
  min-width: 0;
}

/* 已选的文件 */
.file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 6px 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-sunken);
}
.file-icon {
  flex-shrink: 0;
  color: var(--accent);
}
.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.file-meta {
  font-size: 12px;
  color: var(--text-3);
}

.label {
  flex: 0 0 28px;
}
.slider.dim {
  color: var(--text-3);
}
.seg.fill button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.times {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
}
.times .field {
  width: 64px;
  height: 30px;
  text-align: center;
}
.tip {
  line-height: 1.6;
}

/* 预览 */
.stage {
  flex: 1;
  min-width: 0;
}
.card-title .hint {
  font-weight: 400;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 视频绝对定位填满区域，避免按自身尺寸撑开后底部的控制条被裁掉 */
.screen {
  position: relative;
  flex: 1;
  min-height: 240px;
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

/* 时间轴 */
.timeline {
  padding: 12px 14px 14px;
}
.track {
  position: relative;
  height: 28px;
  border-radius: 6px;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  cursor: pointer;
  overflow: hidden;
}
.segment {
  position: absolute;
  top: 3px;
  bottom: 3px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  box-sizing: border-box;
}
.segment + .segment {
  margin-left: 1px;
}
.no {
  font-size: 11px;
  color: var(--accent);
}
.cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--text);
  pointer-events: none;
}
.ticks {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
</style>
