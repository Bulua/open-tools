<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Download, Pause, Play, RefreshCw, Square, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFitFrame } from "@/composables/useFitFrame";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { initialCrop, updateCrop, type CropHandle, type Rect } from "@/tools/image/crop";
import { errorMessage, showError } from "@/utils/errorToast";
import { VIDEO_ACCEPT, formatDuration, probeVideo, trimVideo, type ConcatQuality, type VideoInfo } from "../media";
import { CROP_RATIOS, clampTrim, encodeCrop, formatTime, isFullFrame, parseTime } from "../trim";

/**
 * 视频裁剪：在时间轴上拖动两端选择保留的时间段，也可以在画面上框选保留的区域，导出为 MP4。
 * 只裁时长时可以直接复制（快、无损，开头对齐到关键帧）；裁画面或要求精确到帧时重新编码。
 */
const { t } = useI18n();

const file = ref<File | null>(null);
const info = ref<VideoInfo | null>(null);
const videoUrl = ref("");
const videoEl = ref<HTMLVideoElement>();
const dropZone = ref<InstanceType<typeof FileDropZone>>();

const start = ref(0);
const end = ref(0);
const startText = ref("");
const endText = ref("");
const duration = computed(() => info.value?.duration ?? 0);

const precise = useStoredRef("videoTrim.precise", false);
const quality = useStoredRef<ConcatQuality>("videoTrim.quality", "high");
const QUALITIES = computed<{ value: ConcatQuality; label: string }[]>(() => [
  { value: "medium", label: t("video.qMedium") },
  { value: "high", label: t("video.qHigh") },
  { value: "very-high", label: t("video.qVeryHigh") },
]);

const loadFile = async (f: File) => {
  reset();
  try {
    const probed = await probeVideo(f);
    if (!probed.width) throw new Error(t("video.trimNoVideo"));
    file.value = f;
    info.value = probed;
    setRange(0, probed.duration);
    cropOn.value = false;
    crop.value = { x: 0, y: 0, w: probed.width, h: probed.height };
    videoUrl.value = URL.createObjectURL(f);
  } catch (e) {
    showError(e);
  }
};
const clear = () => {
  reset();
};
function reset() {
  cancel();
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value);
  videoUrl.value = "";
  file.value = null;
  info.value = null;
  clearResult();
}

// ---------- 时间段 ----------
function setRange(s: number, e: number) {
  const r = clampTrim(s, e, duration.value);
  start.value = r.start;
  end.value = r.end;
  startText.value = formatTime(r.start);
  endText.value = formatTime(r.end);
}
/** 输入框改完后解析；格式不对时恢复原值 */
const commitText = (which: "start" | "end") => {
  const value = parseTime(which === "start" ? startText.value : endText.value);
  if (value === null) return setRange(start.value, end.value);
  if (which === "start") setRange(value, end.value);
  else setRange(start.value, value);
  seek(which === "start" ? start.value : end.value);
};
const setFromPlayer = (which: "start" | "end") => {
  if (which === "start") setRange(currentTime.value, end.value);
  else setRange(start.value, currentTime.value);
};
const length = computed(() => end.value - start.value);

// ---------- 播放 ----------
const currentTime = ref(0);
const playing = ref(false);
let frame = 0;
const tick = () => {
  const v = videoEl.value;
  if (!v) return;
  currentTime.value = v.currentTime;
  // 播放到保留段的结尾就停下
  if (!v.paused && v.currentTime >= end.value) {
    v.pause();
    v.currentTime = end.value;
    currentTime.value = end.value;
  }
  if (!v.paused) frame = requestAnimationFrame(tick);
};
const onPlay = () => {
  playing.value = true;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(tick);
};
const onPause = () => {
  playing.value = false;
  cancelAnimationFrame(frame);
  if (videoEl.value) currentTime.value = videoEl.value.currentTime;
};
const togglePlay = () => {
  const v = videoEl.value;
  if (!v) return;
  if (!v.paused) return v.pause();
  // 不在保留段内（或已到结尾）时从开头播放
  if (v.currentTime < start.value || v.currentTime >= end.value - 0.05) v.currentTime = start.value;
  void v.play();
};
function seek(time: number) {
  const v = videoEl.value;
  if (!v) return;
  v.currentTime = Math.min(Math.max(0, time), duration.value);
  currentTime.value = v.currentTime;
}

// ---------- 时间轴 ----------
const timeline = ref<HTMLElement>();
const pct = (time: number) => `${duration.value ? (time / duration.value) * 100 : 0}%`;
const timeAt = (clientX: number) => {
  const rect = timeline.value!.getBoundingClientRect();
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration.value;
};
/** 拖动开始、结束把手，或在时间轴上按下拖动播放位置；拖动把手时画面跟着显示那一帧 */
const onTimelineDown = (e: PointerEvent, target: "start" | "end" | "seek") => {
  if (!timeline.value || !duration.value || working.value) return;
  e.preventDefault();
  videoEl.value?.pause();
  const move = (ev: PointerEvent) => {
    const time = timeAt(ev.clientX);
    if (target === "start") {
      setRange(time, end.value);
      seek(start.value);
    } else if (target === "end") {
      setRange(start.value, time);
      seek(end.value);
    } else seek(time);
  };
  move(e);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
};

// ---------- 画面裁剪 ----------
const videoSize = computed(() => (info.value ? { width: info.value.width, height: info.value.height } : null));
const { observeArea, frameStyle } = useFitFrame(videoSize);
const frameEl = ref<HTMLElement>();
const cropOn = ref(false);
const ratio = ref<number | null>(null);
const crop = ref<Rect>({ x: 0, y: 0, w: 0, h: 0 });

const setCropOn = (on: boolean) => {
  cropOn.value = on;
  if (on && info.value) crop.value = initialCrop(info.value.width, info.value.height, ratio.value);
};
const setRatio = (r: number | null) => {
  ratio.value = r;
  if (cropOn.value && info.value) crop.value = initialCrop(info.value.width, info.value.height, r);
};
/** 实际编码用的裁剪区域；没开或框住整个画面时不裁 */
const encodedCrop = computed(() => {
  const v = info.value;
  if (!v || !cropOn.value || isFullFrame(crop.value, v.width, v.height)) return null;
  return encodeCrop(crop.value, v.width, v.height);
});
const cropStyle = computed(() => {
  const v = info.value;
  if (!v) return {};
  const { x, y, w, h } = crop.value;
  return { left: `${(x / v.width) * 100}%`, top: `${(y / v.height) * 100}%`, width: `${(w / v.width) * 100}%`, height: `${(h / v.height) * 100}%` };
});
// 拖动：屏幕像素换算成视频像素
const onCropPointerDown = (e: PointerEvent, handle: CropHandle) => {
  const v = info.value;
  if (!v || !frameEl.value || working.value) return;
  e.preventDefault();
  const scale = v.width / frameEl.value.getBoundingClientRect().width;
  const begin = { ...crop.value };
  const [sx, sy] = [e.clientX, e.clientY];
  const move = (ev: PointerEvent) => {
    crop.value = updateCrop(begin, handle, (ev.clientX - sx) * scale, (ev.clientY - sy) * scale, v.width, v.height, ratio.value);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
};

/** 是否需要重新编码 */
const reencode = computed(() => !!encodedCrop.value || precise.value);

// ---------- 导出 ----------
const working = ref(false);
const progress = ref(0);
const result = ref<{ data: Uint8Array; copied: boolean } | null>(null);
let controller: AbortController | null = null;

function clearResult() {
  result.value = null;
}
// 改了时间段或设置后，之前的结果作废
watch([start, end, encodedCrop, precise, quality], () => {
  if (!working.value) clearResult();
});

const outputName = computed(() => `${file.value?.name.replace(/\.[^.]+$/, "") || "video"}_${t("video.trimSuffix")}.mp4`);

const exportVideo = async () => {
  if (!file.value || !info.value || working.value) return;
  videoEl.value?.pause();
  clearResult();
  working.value = true;
  progress.value = 0;
  const c = new AbortController();
  controller = c;
  try {
    result.value = await trimVideo(
      file.value,
      { start: start.value, end: end.value, crop: encodedCrop.value, precise: precise.value, quality: quality.value },
      (p) => (progress.value = p),
      c.signal,
    );
    await save();
  } catch (e) {
    if (!c.signal.aborted) showError(t("video.trimFailedWith", { error: errorMessage(e) }));
  } finally {
    if (controller === c) controller = null;
    working.value = false;
  }
};
function cancel() {
  controller?.abort();
}
const save = () => result.value && saveFile(result.value.data, outputName.value);

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  reset();
});
</script>

<template>
  <div class="trim">
    <aside class="card panel">
      <section class="section">
        <h3>{{ t("video.trimRange") }}</h3>
        <div class="time-row">
          <span>{{ t("video.trimStart") }}</span>
          <input v-model="startText" class="field" spellcheck="false" :disabled="!info || working" @change="commitText('start')" @keydown.enter="commitText('start')" />
          <button class="btn small subtle" :disabled="!info || working" :title="t('video.trimSetNowHint')" @click="setFromPlayer('start')">{{ t("video.trimSetNow") }}</button>
        </div>
        <div class="time-row">
          <span>{{ t("video.trimEnd") }}</span>
          <input v-model="endText" class="field" spellcheck="false" :disabled="!info || working" @change="commitText('end')" @keydown.enter="commitText('end')" />
          <button class="btn small subtle" :disabled="!info || working" :title="t('video.trimSetNowHint')" @click="setFromPlayer('end')">{{ t("video.trimSetNow") }}</button>
        </div>
        <p class="tip">{{ info ? t("video.trimKeep", { length: formatTime(length) }) : t("video.trimRangeHint") }}</p>
      </section>

      <section class="section">
        <label class="check">
          <input type="checkbox" :checked="cropOn" :disabled="!info || working" @change="setCropOn(($event.target as HTMLInputElement).checked)" />
          {{ t("video.trimCropFrame") }}
        </label>
        <template v-if="cropOn">
          <div class="seg fill">
            <button v-for="r in CROP_RATIOS" :key="r.label" :class="{ on: ratio === r.value }" :disabled="working" @click="setRatio(r.value)">
              {{ r.value === null ? t("video.trimFree") : r.label }}
            </button>
          </div>
          <p class="tip">{{ encodedCrop ? t("video.trimCropSize", { width: encodedCrop.width, height: encodedCrop.height }) : t("video.trimCropFull") }}</p>
        </template>
      </section>

      <section class="section">
        <h3>{{ t("video.trimMode") }}</h3>
        <div class="seg fill">
          <button :class="{ on: !precise }" :disabled="working || !!encodedCrop" @click="precise = false">{{ t("video.trimFast") }}</button>
          <button :class="{ on: precise || !!encodedCrop }" :disabled="working" @click="precise = true">{{ t("video.trimPrecise") }}</button>
        </div>
        <p class="tip">{{ encodedCrop ? t("video.trimCropTip") : precise ? t("video.trimPreciseTip") : t("video.trimFastTip") }}</p>
        <div v-if="reencode" class="opt">
          <span>{{ t("video.videoQuality") }}</span>
          <div class="seg fill">
            <button v-for="q in QUALITIES" :key="q.value" :class="{ on: quality === q.value }" :disabled="working" @click="quality = q.value">{{ q.label }}</button>
          </div>
        </div>
      </section>

      <section class="section">
        <button v-if="!working" class="btn primary full" :disabled="!info" @click="exportVideo"><Download :size="14" />{{ t("video.trimExport") }}</button>
        <button v-else class="btn full" @click="cancel"><Square :size="13" />{{ t("video.trimStop", { percent: Math.round(progress * 100) }) }}</button>
        <span v-if="working" class="progress"><i :style="{ width: `${Math.round(progress * 100)}%` }" /></span>
        <p v-if="result" class="tip done">
          {{ t("video.trimResult", { size: formatBytes(result.data.length) }) }}{{ result.copied ? t("video.trimCopied") : t("video.reencodedNote") }}
          <button class="link" @click="save">{{ t("video.trimSaveAgain") }}</button>
        </p>
        <p class="tip">{{ t("video.trimLocalTip") }}</p>
      </section>
    </aside>

    <section class="card preview-card">
      <div class="card-title">
        <template v-if="file">
          <span class="file-name" :title="file.name">{{ file.name }}</span>
          <span v-if="info" class="count">{{ formatDuration(info.duration) }} · {{ info.width }}×{{ info.height }} · {{ formatBytes(file.size) }}</span>
          <button class="btn small subtle push" :disabled="working" :title="t('video.trimReplace')" @click="dropZone?.open()"><RefreshCw :size="14" />{{ t("video.trimReplaceShort") }}</button>
          <button class="icon-btn" :title="t('video.clear')" :disabled="working" @click="clear"><X :size="14" /></button>
        </template>
        <template v-else>{{ t("video.videoLabel") }}</template>
      </div>

      <!-- 选好视频后隐藏但保留，「更换」仍由它打开文件选择 -->
      <FileDropZone
        v-show="!file"
        ref="dropZone"
        class="drop"
        :accept="VIDEO_ACCEPT"
        :paste="false"
        :title="t('video.trimDrop')"
        :hint="t('video.trimDropHint')"
        @files="loadFile($event[0])"
      />

      <template v-if="file">
        <div :ref="observeArea" class="stage">
          <div ref="frameEl" class="frame" :style="frameStyle">
            <video ref="videoEl" :src="videoUrl" preload="auto" @play="onPlay" @pause="onPause" @click="togglePlay" />
            <div v-if="cropOn" class="crop" :style="cropStyle" @pointerdown="onCropPointerDown($event, 'move')">
              <span v-for="h in ['nw', 'ne', 'sw', 'se'] as const" :key="h" class="handle" :class="h" @pointerdown.stop="onCropPointerDown($event, h)" />
              <span class="crop-size">{{ encodedCrop ? `${encodedCrop.width} × ${encodedCrop.height}` : `${crop.w} × ${crop.h}` }}</span>
            </div>
          </div>
        </div>

        <div class="controls">
          <button class="icon-btn play" :title="playing ? t('video.trimPause') : t('video.trimPlay')" :disabled="working" @click="togglePlay">
            <Pause v-if="playing" :size="15" />
            <Play v-else :size="15" />
          </button>
          <span class="time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
          <div ref="timeline" class="timeline" @pointerdown="onTimelineDown($event, 'seek')">
            <div class="rail" />
            <div class="kept" :style="{ left: pct(start), width: pct(length) }" />
            <span class="bound" :style="{ left: pct(start) }" :title="t('video.trimStart')" @pointerdown.stop="onTimelineDown($event, 'start')" />
            <span class="bound" :style="{ left: pct(end) }" :title="t('video.trimEnd')" @pointerdown.stop="onTimelineDown($event, 'end')" />
            <span class="playhead" :style="{ left: pct(currentTime) }" />
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.trim {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.panel {
  flex: 0 0 300px;
  align-self: flex-start;
}
.time-row,
.opt {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-2);
}
.time-row > span,
.opt > span {
  flex: 0 0 40px;
}
.time-row .field {
  flex: 1;
  min-width: 0;
  font-variant-numeric: tabular-nums;
}
.opt .seg {
  flex: 1;
}
.seg.fill button {
  padding: 0 6px;
}
.seg button:disabled,
.btn:disabled,
.icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.tip {
  line-height: 1.6;
}
.done {
  color: var(--text-2);
}
.link {
  margin-left: 4px;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-size: inherit;
  cursor: pointer;
}
.preview-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.file-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count {
  margin-left: 8px;
  font-weight: 400;
  color: var(--text-3);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.push {
  margin-left: auto;
}
.drop {
  flex: 1;
  margin: 12px;
}

/* 预览区：frame 的大小由脚本按预览区计算，裁剪框按百分比定位在它上面 */
.stage {
  position: relative;
  flex: 1;
  min-height: 200px;
  margin: 12px 12px 0;
  border-radius: 8px;
  background: var(--bg-sunken);
  /* 裁剪框外的暗色遮罩不要盖到别处 */
  overflow: hidden;
}
.frame {
  position: absolute;
  inset: 0;
  margin: auto;
}
.frame video {
  display: block;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.crop {
  position: absolute;
  border: 1.5px solid #fff;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  cursor: move;
  touch-action: none;
}
.handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  background: var(--accent);
  border-radius: 3px;
}
.handle.nw {
  left: -7px;
  top: -7px;
  cursor: nwse-resize;
}
.handle.ne {
  right: -7px;
  top: -7px;
  cursor: nesw-resize;
}
.handle.sw {
  left: -7px;
  bottom: -7px;
  cursor: nesw-resize;
}
.handle.se {
  right: -7px;
  bottom: -7px;
  cursor: nwse-resize;
}
.crop-size {
  position: absolute;
  left: 4px;
  top: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  pointer-events: none;
}

/* 播放按钮、时间和时间轴 */
.controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 12px;
}
.time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.timeline {
  position: relative;
  flex: 1;
  height: 28px;
  cursor: pointer;
  touch-action: none;
}
.rail,
.kept {
  position: absolute;
  top: 50%;
  height: 8px;
  margin-top: -4px;
  border-radius: 4px;
}
.rail {
  left: 0;
  right: 0;
  background: var(--active);
}
.kept {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.bound {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 22px;
  margin: -11px 0 0 -5px;
  border-radius: 3px;
  background: var(--accent);
  cursor: ew-resize;
}
.playhead {
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--text);
  pointer-events: none;
}
</style>
