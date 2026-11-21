<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { SocialDownloadAdapter } from "../socialDownload";

const props = defineProps<{ src?: string; loadCover?: SocialDownloadAdapter["loadCover"] }>();
const cover = ref("");
const src = computed(() => props.loadCover ? cover.value : props.src);

watch(() => [props.src, props.loadCover] as const, ([url, loadCover], _, onCleanup) => {
  if (!url || !loadCover) return;
  const controller = new AbortController();
  onCleanup(() => {
    controller.abort();
    if (cover.value) URL.revokeObjectURL(cover.value);
    cover.value = "";
  });
  void loadCover(url, controller.signal).then(blob => {
    if (!controller.signal.aborted) cover.value = URL.createObjectURL(blob);
  }).catch(() => {
    // 封面读取失败时保留卡片上的播放入口。
  });
}, { immediate: true });
</script>

<template>
  <img v-if="src" :src="src" alt="" referrerpolicy="no-referrer" loading="lazy" />
</template>
