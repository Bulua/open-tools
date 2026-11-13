<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useTheme } from "@/composables/useTheme";
import ScreenshotOverlay from "./ScreenshotOverlay.vue";
import ScreenshotPin from "./ScreenshotPin.vue";

const params = new URLSearchParams(location.search);
const mode = params.get("window");
const id = params.get("id") ?? "";
const { theme } = useTheme();
// 截图窗口预加载后常驻后台，主窗口切换主题时同步更新。
function syncTheme(event: StorageEvent) {
  if (event.key !== "theme" || !event.newValue) return;
  try {
    const value = JSON.parse(event.newValue);
    if (value === "light" || value === "dark") theme.value = value;
  } catch {
    // 忽略损坏的存储值，保留当前主题。
  }
}
onMounted(() => window.addEventListener("storage", syncTheme));
onBeforeUnmount(() => window.removeEventListener("storage", syncTheme));
</script>

<template>
  <ScreenshotOverlay v-if="mode === 'screenshot-overlay'" :draft-id="id" />
  <ScreenshotPin v-else-if="mode === 'screenshot-pin'" :screenshot-id="id" />
</template>
