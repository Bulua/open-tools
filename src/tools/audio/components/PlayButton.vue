<script setup lang="ts">
import { Pause, Play } from "lucide-vue-next";

/** 列表里的试听按钮：圆形，播放中显示暂停图标并高亮 */
defineProps<{ playing?: boolean }>();
</script>

<template>
  <button class="play" :class="{ on: playing }" :title="playing ? '停止' : '试听'">
    <Pause v-if="playing" :size="13" />
    <Play v-else :size="13" />
  </button>
</template>

<style scoped>
.play {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}
.play:hover,
.play.on {
  background: var(--accent);
  color: #fff;
}
</style>
