<script setup lang="ts">
import { QUALITIES } from "../audio";
import { useOutputFormat } from "../useOutputFormat";

/** 导出格式：MP3（选音质）或 WAV。各音频工具共用同一个设置 */
const { format, quality } = useOutputFormat();
</script>

<template>
  <div class="output">
    <div class="seg fill">
      <button :class="{ on: format === 'mp3' }" @click="format = 'mp3'">MP3</button>
      <button :class="{ on: format === 'wav' }" @click="format = 'wav'">WAV</button>
    </div>
    <div v-if="format === 'mp3'" class="row">
      <span>音质</span>
      <div class="seg fill">
        <button v-for="q in QUALITIES" :key="q.value" :class="{ on: quality === q.value }" :title="`${q.value} kbps`" @click="quality = q.value">
          {{ q.label }}
        </button>
      </div>
    </div>
    <p v-else class="tip">无损格式，文件较大</p>
  </div>
</template>

<style scoped>
.output {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.seg.fill {
  display: flex;
}
.seg.fill button {
  flex: 1;
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
.tip {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
</style>
