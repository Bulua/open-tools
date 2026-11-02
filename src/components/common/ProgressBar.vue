<script setup lang="ts">
/** 细进度条，value 为 0 ~ 1。样式在 controls.css 的 .progress，需要时可在外面覆盖（例如盖在封面底部） */
defineProps<{ value: number }>();
</script>

<template>
  <div class="progress"><i :style="{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }" /></div>
</template>
