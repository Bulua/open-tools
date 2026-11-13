<script setup lang="ts">
import { recordToolUsage } from "@/composables/toolLibrary";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Download, RefreshCw, Square, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import ProcessingMascot from "@/components/common/ProcessingMascot.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { showError } from "@/utils/errorToast";
import { VIDEO_ACCEPT, formatDuration, probeVideo, type VideoInfo } from "../shared/media";
import { COLOR_OPTIONS, FPS_OPTIONS, WIDTH_OPTIONS, effectiveFps, frameCount, outputSize } from "./gif";
import type { GifRequest, GifResponse } from "./gif.worker";

/**
 * 视频转 GIF：把整段视频转成 GIF，可设定帧率、宽度、颜色数和是否循环，在后台线程逐帧解码并编码。
 * 视频太长、帧数超过上限时自动降低帧率。右侧可以在原视频和转换结果之间切换预览。
 */
const { t } = useI18n();

const file = ref<File | null>(null);
const info = ref<VideoInfo | null>(null);
const videoUrl = ref("");
const videoEl = ref<HTMLVideoElement>();
const dropZone = ref<InstanceType<typeof FileDropZone>>();

const fps = useStoredRef("videoToGif.fps", 10);
const width = useStoredRef("videoToGif.width", 480);
const colors = useStoredRef("videoToGif.colors", 256);
const loop = useStoredRef("videoToGif.loop", true);

const loadFile = async (f: File) => {
  reset();
  try {
    const probed = await probeVideo(f);
    if (!probed.width) throw new Error(t("video.gifNoVideo"));
    file.value = f;
    info.value = probed;
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

const duration = computed(() => info.value?.duration ?? 0);
/** 实际使用的帧率：视频太长时比所选的低 */
const actualFps = computed(() => effectiveFps(duration.value, fps.value));
const lowered = computed(() => actualFps.value < fps.value);
const frames = computed(() => frameCount(0, duration.value, actualFps.value));
const size = computed(() => (info.value ? outputSize(info.value.width, info.value.height, width.value) : null));

const WIDTHS = computed(() => WIDTH_OPTIONS.map((value) => ({ value, label: value ? `${value}` : t("video.gifOriginal") })));

// ---------- 转换 ----------
const working = ref(false);
const progress = ref(0);
const result = ref<{ data: Uint8Array; url: string } | null>(null);
const view = ref<"video" | "gif">("video");
let worker: Worker | null = null;

function clearResult() {
  if (result.value) URL.revokeObjectURL(result.value.url);
  result.value = null;
  view.value = "video";
}
// 换了设置后，之前的结果作废
watch([fps, width, colors, loop], () => {
  if (!working.value) clearResult();
});

const ERRORS: Record<string, string> = { unsupported: "video.unsupported", noVideo: "video.gifNoVideo", failed: "video.gifFailed" };

const convert = () => {
  if (!file.value || !info.value || !size.value || working.value) return;
  clearResult();
  working.value = true;
  progress.value = 0;
  videoEl.value?.pause();
  const w = new Worker(new URL("./gif.worker.ts", import.meta.url), { type: "module" });
  worker = w;
  const finish = () => {
    w.terminate();
    if (worker === w) worker = null;
    working.value = false;
  };
  w.onmessage = (e: MessageEvent<GifResponse>) => {
    const msg = e.data;
    if (msg.type === "progress") progress.value = msg.value;
    else if (msg.type === "done") {
      const blob = new Blob([msg.data as Uint8Array<ArrayBuffer>], { type: "image/gif" });
      result.value = { data: msg.data, url: URL.createObjectURL(blob) };
      recordToolUsage();
      view.value = "gif";
      finish();
    } else {
      showError(msg.message ? t("video.gifFailedWith", { error: msg.message }) : t(ERRORS[msg.code]));
      finish();
    }
  };
  w.onerror = (e) => {
    showError(t("video.gifFailedWith", { error: e.message }));
    finish();
  };
  const req: GifRequest = {
    file: file.value,
    start: info.value.start,
    end: info.value.start + info.value.duration,
    fps: actualFps.value,
    width: size.value.width,
    height: size.value.height,
    colors: colors.value,
    loop: loop.value,
  };
  w.postMessage(req);
};
function cancel() {
  if (!worker) return;
  worker.terminate();
  worker = null;
  working.value = false;
}

const outputName = computed(() => `${file.value?.name.replace(/\.[^.]+$/, "") || "video"}.gif`);
const save = () => result.value && saveFile(result.value.data, outputName.value);

onBeforeUnmount(reset);
</script>

<template>
  <div class="v2g">
    <aside class="card panel">
      <section class="section">
        <div class="opt">
          <span>{{ t("video.gifFps") }}</span>
          <div class="seg fill">
            <button v-for="f in FPS_OPTIONS" :key="f" :class="{ on: fps === f }" :disabled="working" @click="fps = f">{{ f }}</button>
          </div>
        </div>
        <div class="opt">
          <span>{{ t("video.gifWidth") }}</span>
          <div class="seg fill">
            <button v-for="w in WIDTHS" :key="w.value" :class="{ on: width === w.value }" :disabled="working" @click="width = w.value">{{ w.label }}</button>
          </div>
        </div>
        <div class="opt">
          <span>{{ t("video.gifColors") }}</span>
          <div class="seg fill">
            <button v-for="c in COLOR_OPTIONS" :key="c" :class="{ on: colors === c }" :disabled="working" @click="colors = c">{{ c }}</button>
          </div>
        </div>
        <div class="opt">
          <span>{{ t("video.gifPlayback") }}</span>
          <div class="seg fill">
            <button :class="{ on: loop }" :disabled="working" @click="loop = true">{{ t("video.gifLoop") }}</button>
            <button :class="{ on: !loop }" :disabled="working" @click="loop = false">{{ t("video.gifOnce") }}</button>
          </div>
        </div>
        <p class="tip">
          <template v-if="size">{{ t("video.gifOutput", { width: size.width, height: size.height, frames }) }}</template>
          {{ t("video.gifSizeTip") }}
        </p>
        <p v-if="info && lowered" class="tip warn">{{ t("video.gifFpsLowered", { fps: actualFps.toFixed(1) }) }}</p>
      </section>

      <section class="section">
        <button v-if="!working" class="btn primary full" :disabled="!info" @click="convert"><Download :size="14" />{{ t("video.gifConvert") }}</button>
        <button v-else class="btn full" @click="cancel"><Square :size="13" />{{ t("video.gifCancel", { percent: Math.round(progress * 100) }) }}</button>
        <span v-if="working" class="progress"><i :style="{ width: `${Math.round(progress * 100)}%` }" /></span>
        <p class="tip">{{ t("video.gifLocalTip") }}</p>
      </section>
    </aside>

    <section class="card preview-card">
      <div class="card-title">
        <template v-if="file">
          <span class="file-name" :title="file.name">{{ file.name }}</span>
          <span v-if="info" class="count">{{ formatDuration(info.duration) }} · {{ info.width }}×{{ info.height }} · {{ formatBytes(file.size) }}</span>
          <div v-if="result" class="seg push">
            <button :class="{ on: view === 'video' }" @click="view = 'video'">{{ t("video.gifSourceVideo") }}</button>
            <button :class="{ on: view === 'gif' }" @click="view = 'gif'">GIF</button>
          </div>
          <button class="btn small subtle" :class="{ push: !result }" :disabled="working" :title="t('video.gifReplace')" @click="dropZone?.open()"><RefreshCw :size="14" />{{ t("video.gifReplaceShort") }}</button>
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
        :title="t('video.gifDrop')"
        :hint="t('video.gifDropHint')"
        @files="loadFile($event[0])"
      />

      <div v-if="file" class="stage">
        <ProcessingMascot v-if="working" :title="file.name" :detail="t('video.gifProcessing', { percent: Math.round(progress * 100) })" />
        <video v-show="!working && view === 'video'" ref="videoEl" :src="videoUrl" controls preload="metadata" />
        <div v-if="result && view === 'gif'" class="gif">
          <img :src="result.url" alt="GIF" />
        </div>
      </div>

      <footer v-if="result" class="save">
        <span class="count">{{ t("video.gifResultInfo", { size: formatBytes(result.data.length), frames }) }}</span>
        <button class="btn primary push" @click="save"><Download :size="14" />{{ t("video.gifSave") }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.v2g {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.panel {
  flex: 0 0 300px;
  align-self: flex-start;
}
.opt {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-2);
}
.opt > span {
  flex: 0 0 56px;
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
.warn {
  color: var(--warning);
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
.stage {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 12px;
}
.stage video,
.gif {
  flex: 1;
  min-width: 0;
  min-height: 0;
  border-radius: 8px;
  background: var(--bg-sunken);
}
.stage video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.gif {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.gif img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.save {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-top: 1px solid var(--border);
}
.save .count {
  margin-left: 0;
}
</style>
