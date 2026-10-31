<script setup lang="ts">
/** 应用图标（与 app-icon.svg 相同），用于顶栏等处 */
withDefaults(defineProps<{ size?: number }>(), { size: 22 });
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 512 512" aria-hidden="true">
    <rect width="512" height="512" rx="112" fill="#c96442" />
    <g fill="#faf9f5">
      <rect x="110" y="110" width="128" height="128" rx="30" />
      <rect x="274" y="110" width="128" height="128" rx="30" />
      <rect x="110" y="274" width="128" height="128" rx="30" />
      <rect x="290" y="290" width="96" height="96" rx="20" transform="rotate(45 338 338)" />
    </g>
  </svg>
</template>
