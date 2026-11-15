<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { QUALITIES } from "../audio";
import { useOutputFormat } from "../useOutputFormat";

/** 导出格式：MP3（选音质）或 WAV。各音频工具共用同一个设置 */
const { format, quality } = useOutputFormat();
const { t } = useI18n();
</script>

<template>
  <div class="output">
    <div class="seg fill">
      <button :class="{ on: format === 'mp3' }" @click="format = 'mp3'">MP3</button>
      <button :class="{ on: format === 'wav' }" @click="format = 'wav'">WAV</button>
    </div>
    <div v-if="format === 'mp3'" class="row">
      <span>{{ t("audio.quality") }}</span>
      <div class="seg fill">
        <button v-for="q in QUALITIES" :key="q" :class="{ on: quality === q }" :title="`${q} kbps`" @click="quality = q">
          {{ t(`audio.q${q}`) }}
        </button>
      </div>
    </div>
    <p v-else class="tip">{{ t("audio.lossless") }}</p>
  </div>
</template>

<style scoped>
.output {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-2);
}
.row .seg {
  flex: 1;
}
</style>
