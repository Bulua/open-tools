<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { renderAsync } from "docx-preview";

/**
 * Word 文档预览（docx-preview 在浏览器里排版，与 Word 的分页可能略有差异）。
 * 页面按区域宽度缩放；decorate 会在每一页渲染完成后调用，用于叠加水印预览等。
 */
const { t } = useI18n();
const props = defineProps<{
  data: Uint8Array | null;
  decorate?: (page: HTMLElement) => void;
}>();
const emit = defineEmits<{ error: [message: string] }>();

const area = ref<HTMLDivElement>();
const host = ref<HTMLDivElement>();
const rendering = ref(false);
const failed = ref("");
let token = 0;

const pagesOf = () => [...(host.value?.querySelectorAll<HTMLElement>("section.docx") ?? [])];

const applyDecorations = () => {
  for (const page of pagesOf()) {
    page.querySelectorAll(".decoration").forEach((el) => el.remove());
    props.decorate?.(page);
  }
};

/** 按可用宽度缩放页面，最大 100% */
const fit = () => {
  const page = pagesOf()[0];
  if (!page || !area.value || !host.value) return;
  const zoom = Math.min(1, (area.value.clientWidth - 40) / page.offsetWidth);
  host.value.style.zoom = String(Math.max(zoom, 0.2));
};

const render = async () => {
  const current = ++token;
  failed.value = "";
  if (!host.value) return;
  host.value.innerHTML = "";
  if (!props.data) return;
  rendering.value = true;
  try {
    await renderAsync(props.data.slice(), host.value, host.value, {
      inWrapper: false,
      breakPages: true,
      experimental: true,
      renderHeaders: true,
      renderFooters: true,
      useBase64URL: true,
    });
    if (current !== token) return;
    fit();
    applyDecorations();
  } catch {
    if (current !== token) return;
    failed.value = t("document.previewFailed");
    emit("error", failed.value);
  } finally {
    if (current === token) rendering.value = false;
  }
};

watch(() => props.data, render);
watch(() => props.decorate, applyDecorations);

let observer: ResizeObserver | undefined;
onMounted(() => {
  render();
  observer = new ResizeObserver(fit);
  if (area.value) observer.observe(area.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="area" class="docx-area">
    <div ref="host" class="docx-host" />
    <p v-if="rendering" class="state">{{ t("document.rendering") }}</p>
    <p v-else-if="failed" class="state">{{ failed }}</p>
    <slot v-else-if="!data" />
  </div>
</template>

<style scoped>
.docx-area {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
  background: var(--bg-sunken);
}
.docx-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
/* 页面是白纸：不设置时页面透明，深色主题下黑字压在深色背景上看不清（文档自己设了背景色时以文档为准） */
.docx-host :deep(section.docx) {
  background: #fff;
  position: relative;
  flex-shrink: 0;
  margin: 0;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
  pointer-events: none;
}
</style>
