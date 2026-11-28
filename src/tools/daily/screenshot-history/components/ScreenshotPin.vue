<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { readScreenshot, base64ToBytes } from "../screenshot";

const props = defineProps<{ screenshotId: string }>();
const { t } = useI18n();
const src = ref("");
const failed = ref(false);
const win = getCurrentWindow();

async function copy() {
  const base64 = src.value.slice(src.value.indexOf(",") + 1);
  const blob = new Blob([base64ToBytes(base64) as BlobPart], { type: "image/png" });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

onMounted(async () => {
  try {
    src.value = `data:image/png;base64,${await readScreenshot(props.screenshotId)}`;
  } catch {
    failed.value = true;
  }
});
</script>

<template>
  <main class="pin-window" @pointerdown.left="win.startDragging()">
    <img v-if="src" :src="src" alt="" draggable="false" />
    <div v-else class="loading">{{ failed ? "×" : "…" }}</div>
    <div class="pin-actions" @pointerdown.stop>
      <button :title="t('image.screenshotPinCopy')" @click="copy"><Copy :size="15" /></button>
      <button :title="t('image.screenshotPinMinimize')" @click="win.minimize()"><Minus :size="16" /></button>
      <button :title="t('image.screenshotPinClose')" @click="win.close()"><X :size="16" /></button>
    </div>
  </main>
</template>

<style scoped>
.pin-window { position: fixed; inset: 0; display: grid; place-items: center; overflow: hidden; background: #181818; border: 1px solid rgba(255,255,255,.22); cursor: move; }
img { width: 100%; height: 100%; object-fit: contain; user-select: none; pointer-events: none; }
.loading { color: #aaa; font-size: 24px; }
.pin-actions { position: fixed; right: 6px; top: 6px; display: flex; padding: 3px; gap: 2px; border-radius: 7px; background: rgba(20,20,20,.78); opacity: 0; transition: opacity var(--dur-fast) var(--ease-out); }
.pin-window:hover .pin-actions { opacity: 1; }
.pin-actions button { width: 27px; height: 27px; display: grid; place-items: center; border: 0; border-radius: 5px; color: #eee; background: transparent; }
.pin-actions button:hover { background: rgba(255,255,255,.14); }
</style>
