<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import defaultLogo from "@/assets/app-logo.png";
import { BRANDING_CHANGED } from "@/utils/branding";

/** 应用图标，用于顶栏等处。默认是根目录 app-icon.png 缩小而来的图；换了远程图标时显示远程图标 */
withDefaults(defineProps<{ size?: number }>(), { size: 22 });

const src = ref(defaultLogo);

const load = async () => {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const data = await invoke<ArrayBuffer>("branding_logo").catch(() => new ArrayBuffer(0));
  if (src.value !== defaultLogo) URL.revokeObjectURL(src.value);
  src.value = data.byteLength ? URL.createObjectURL(new Blob([data], { type: "image/png" })) : defaultLogo;
};

onMounted(() => {
  load();
  window.addEventListener(BRANDING_CHANGED, load);
});
onBeforeUnmount(() => {
  window.removeEventListener(BRANDING_CHANGED, load);
  if (src.value !== defaultLogo) URL.revokeObjectURL(src.value);
});
</script>

<template>
  <img :src="src" :width="size" :height="size" alt="" aria-hidden="true" draggable="false" />
</template>
