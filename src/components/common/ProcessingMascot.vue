<script setup lang="ts">
import animatedCat from "@/assets/mascot/cat-thinking.webp";
import stillCat from "@/assets/mascot/cat-thinking.png";

defineProps<{ title: string; detail?: string }>();
</script>

<template>
  <div class="processing-mascot" role="status">
    <picture>
      <source media="(prefers-reduced-motion: reduce)" :srcset="stillCat" />
      <img :src="animatedCat" alt="" width="160" height="152" />
    </picture>
    <div class="message">
      <span class="title">{{ title }}</span>
      <span v-if="detail" class="detail">{{ detail }}</span>
    </div>
  </div>
</template>

<style scoped>
.processing-mascot {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  padding: 24px;
  background: var(--bg-sunken);
}
picture,
img {
  display: block;
  flex: 0 0 152px;
  width: 160px;
  height: 152px;
  image-rendering: pixelated;
}
.message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  text-align: center;
  font-size: 12px;
}
.title {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}
.detail {
  color: var(--text-2);
  overflow-wrap: anywhere;
}
</style>
