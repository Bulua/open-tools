<script lang="ts">
export interface CompressionPreviewSource {
  kind: "image" | "audio" | "video";
  variant: "original" | "compressed";
  name: string;
  blob: Blob;
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { X } from "lucide-vue-next";
import AudioTrack, { type TrackSource } from "@/tools/audio/shared/components/AudioTrack.vue";
import { formatBytes } from "@/utils/format";

const props = defineProps<{ source: CompressionPreviewSource | null }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const dialog = ref<HTMLDialogElement>();
const current = shallowRef<(CompressionPreviewSource & { url?: string }) | null>(null);
const audioTrack = ref<InstanceType<typeof AudioTrack>>();
const audioSources = computed<TrackSource[]>(() => {
  const source = current.value;
  return source?.kind === "audio" ? [{ key: source.variant, label: "", blob: source.blob }] : [];
});
const title = computed(() => {
  const original = current.value?.variant === "original";
  if (current.value?.kind === "audio") return t(original ? "common.listenOriginalAudio" : "common.listenCompressedAudio");
  return t(original ? "common.originalPreview" : "common.compressedPreview");
});
const failed = ref(false);

function release() {
  if (current.value?.url) URL.revokeObjectURL(current.value.url);
  current.value = null;
}

watch(() => props.source, async (source) => {
  if (!source) return;
  release();
  failed.value = false;
  current.value = { ...source, url: source.kind === "audio" ? undefined : URL.createObjectURL(source.blob) };
  await nextTick();
  const element = dialog.value;
  if (props.source !== source || !element?.isConnected) return;
  if (!element.open) element.showModal();
  // 自动播放被设备阻止时，保留播放器的手动播放按钮。
  if (source.kind === "audio") void audioTrack.value?.play();
  else void element.querySelector("video")?.play().catch(() => undefined);
}, { immediate: true });

function pausePlayback(element: Element) {
  const player = element.querySelector<HTMLMediaElement>("audio, video");
  if (player && !player.paused) player.pause();
}

function finishClose() {
  if (props.source) return;
  dialog.value?.close();
  release();
}

onBeforeUnmount(() => {
  if (dialog.value) pausePlayback(dialog.value);
  release();
});
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="preview-dialog" :aria-label="title" @cancel.prevent="emit('close')">
      <Transition name="modal" @before-leave="pausePlayback" @after-leave="finishClose">
        <div v-if="source && current" class="overlay" @click.self="emit('close')">
          <section class="preview-card" :class="{ audio: current.kind === 'audio' }">
            <header class="preview-head">
              <div class="preview-meta">
                <h2>{{ title }}</h2>
                <p :title="current.name">{{ current.name }} · {{ formatBytes(current.blob.size) }}</p>
              </div>
              <button type="button" class="icon-btn" autofocus :aria-label="t('common.closePreview')" @click="emit('close')">
                <X :size="16" />
              </button>
            </header>
            <div class="preview-content">
              <p v-if="failed" class="preview-error" role="alert">{{ t("common.filePreviewFailed") }}</p>
              <img v-else-if="current.kind === 'image'" :key="current.url" :src="current.url" :alt="current.name" @error="failed = true" />
              <AudioTrack v-else-if="current.kind === 'audio'" ref="audioTrack" class="preview-track" :sources="audioSources" @error="failed = true" />
              <video v-else :key="current.url" :src="current.url" controls playsinline preload="metadata" :aria-label="current.name" @error="failed = true" />
            </div>
          </section>
        </div>
      </Transition>
    </dialog>
  </Teleport>
</template>

<style scoped>
.preview-dialog {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--text);
}

.preview-dialog::backdrop {
  background: transparent;
}

.overlay {
  display: grid;
  width: 100%;
  height: 100%;
  padding: 16px;
  place-items: center;
  background: var(--modal-scrim);
}

.preview-card {
  width: min(960px, 100%);
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.preview-card.audio {
  width: min(520px, 100%);
}

.preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.preview-meta {
  min-width: 0;
}

.preview-meta h2 {
  margin: 0;
  font-size: 15px;
}

.preview-meta p {
  margin: 2px 0 0;
  overflow: hidden;
  color: var(--text-2);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-content {
  display: grid;
  min-width: 0;
  padding: 12px;
  place-items: center;
}

.preview-content img,
.preview-content video {
  display: block;
  max-width: 100%;
  max-height: min(72vh, calc(100vh - 110px));
  object-fit: contain;
}

.preview-content video {
  width: 100%;
}

.preview-track {
  width: 100%;
  min-width: 0;
  padding: 0;
}

.preview-error {
  color: var(--danger);
  text-align: center;
}
</style>
