<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { LoaderCircle, Pause, Play } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { t as i18n } from "@/locales";
import Waveform from "./Waveform.vue";
import { formatTime } from "../pcm";
import { readPeaks, type Peaks } from "../peaks";

/**
 * 音轨播放器：显示波形，点击波形定位，播放 / 暂停。
 * 没有文件时显示一条空的音轨；有多个来源（例如原视频声音、转换结果）时可以切换。
 * 用浏览器自带的播放器播放文件本身，不需要先把整段声音解码到内存。
 */
export interface TrackSource {
  key: string;
  label: string;
  blob: Blob;
}

const props = withDefaults(defineProps<{ sources?: TrackSource[]; title?: string; emptyText?: string }>(), {
  sources: () => [],
  title: "",
  emptyText: undefined,
});
const { t } = useI18n();
// 开始播放时通知外面，用来停掉页面上其他正在播放的声音
const emit = defineEmits<{ play: [] }>();

// 当前播放的来源：默认最后一个（转换完成后自动切到转换结果）
const activeKey = ref("");
watch(
  () => props.sources.map((s) => s.key).join(","),
  () => {
    activeKey.value = props.sources[props.sources.length - 1]?.key ?? "";
  },
  { immediate: true },
);
const active = computed(() => props.sources.find((s) => s.key === activeKey.value) ?? null);

// ---------- 波形 ----------
const peaks = shallowRef<Peaks | null>(null);
const loading = ref(false);
const failed = ref("");
let token = 0;
watch(
  () => active.value?.blob,
  async (blob) => {
    const current = ++token;
    peaks.value = null;
    failed.value = "";
    if (!blob) return;
    loading.value = true;
    try {
      // 每次更新换一个新对象，波形组件才会重画（数组共用，不复制）
      const result = await readPeaks(blob, (p) => current === token && (peaks.value = { ...p }));
      if (current === token) peaks.value = { ...result };
    } catch {
      if (current === token) failed.value = i18n("audio.trackFailed");
    } finally {
      if (current === token) loading.value = false;
    }
  },
  { immediate: true },
);

// ---------- 播放 ----------
const audio = ref<HTMLAudioElement>();
const url = ref("");
const playing = ref(false);
const position = ref(0);
const mediaDuration = ref(0);
const total = computed(() => peaks.value?.duration || mediaDuration.value);
watch(
  () => active.value?.blob,
  (blob) => {
    if (url.value) URL.revokeObjectURL(url.value);
    url.value = blob ? URL.createObjectURL(blob) : "";
    playing.value = false;
    position.value = 0;
    mediaDuration.value = 0;
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  if (url.value) URL.revokeObjectURL(url.value);
});

// 播放时用动画帧更新位置，竖线移动更顺滑
let frame = 0;
const tick = () => {
  if (audio.value) position.value = audio.value.currentTime;
  if (playing.value) frame = requestAnimationFrame(tick);
};
const onPlay = () => {
  playing.value = true;
  emit("play");
  tick();
};
const onPause = () => {
  playing.value = false;
  cancelAnimationFrame(frame);
  if (audio.value) position.value = audio.value.currentTime;
};
const toggle = () => {
  const el = audio.value;
  if (!el || !url.value) return;
  if (el.paused) el.play().catch(() => {});
  else el.pause();
};
const seek = (t: number) => {
  if (!audio.value) return;
  audio.value.currentTime = t;
  position.value = t;
};

/** 从头播放；key 指定来源（不传则用当前的） */
const play = async (key?: string) => {
  if (key && props.sources.some((s) => s.key === key)) activeKey.value = key;
  // 换了来源时等新的地址生效
  await new Promise((r) => setTimeout(r));
  const el = audio.value;
  if (!el || !url.value) return;
  el.currentTime = 0;
  el.play().catch(() => {});
};
const pause = () => audio.value?.pause();
defineExpose({ play, pause, playing });
</script>

<template>
  <div class="track">
    <div class="head">
      <button class="play" :disabled="!active" :title="playing ? t('audio.pause') : t('audio.play')" @click="toggle">
        <Pause v-if="playing" :size="16" />
        <Play v-else :size="16" />
      </button>
      <div class="info">
        <span class="title" :title="title">{{ title || t("audio.track") }}</span>
        <span class="time">{{ formatTime(position, false) }} / {{ formatTime(total, false) }}</span>
      </div>
      <div v-if="sources.length > 1" class="seg">
        <button v-for="s in sources" :key="s.key" :class="{ on: s.key === activeKey }" @click="activeKey = s.key">{{ s.label }}</button>
      </div>
      <span v-else-if="active" class="label">{{ active.label }}</span>
    </div>
    <Waveform class="wave" :peaks="peaks" :position="active ? position : null" :selectable="false" @seek="seek">
      <span v-if="!active" class="overlay">{{ emptyText ?? t("audio.trackEmpty") }}</span>
      <span v-else-if="failed" class="overlay">{{ failed }}</span>
      <span v-else-if="loading && !peaks?.version" class="overlay"><LoaderCircle :size="13" class="spin" />{{ t("audio.readingWave") }}</span>
    </Waveform>
    <audio
      ref="audio"
      :src="url || undefined"
      preload="metadata"
      @play="onPlay"
      @pause="onPause"
      @ended="onPause"
      @loadedmetadata="mediaDuration = audio?.duration || 0"
    />
  </div>
</template>

<style scoped>
.track {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 12px;
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
}
.play {
  flex-shrink: 0;
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
.play:disabled {
  opacity: 0.4;
  cursor: default;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}
.time {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.label {
  font-size: 12px;
  color: var(--text-3);
}
.wave {
  height: 96px;
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
  pointer-events: none;
}
</style>
