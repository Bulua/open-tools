<script setup lang="ts">
import { ref } from "vue";
import { useClipboard } from "@/composables/useClipboard";
import { openExternal } from "@/utils/openExternal";
import { MARKDOWN_CSS } from "../markdownStyle";

/**
 * 显示渲染好的 Markdown（HTML 需已用 DOMPurify 清理）。
 * 页内锚点在预览区内滚动；网址用系统浏览器打开；相对路径等无法打开的链接改为复制。
 */
defineProps<{ html: string }>();

const root = ref<HTMLElement>();
const toast = ref("");
const { copy } = useClipboard();
let timer = 0;

const onClick = (e: MouseEvent) => {
  const a = (e.target as HTMLElement).closest("a");
  if (!a) return;
  const href = a.getAttribute("href") ?? "";
  e.preventDefault();
  if (href.startsWith("#")) {
    root.value?.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`)?.scrollIntoView({ behavior: "smooth" });
  } else if (/^https?:\/\//i.test(href)) {
    openExternal(href);
  } else {
    copy(href);
    toast.value = "已复制链接";
    clearTimeout(timer);
    timer = window.setTimeout(() => (toast.value = ""), 1500);
  }
};

defineExpose({ root });
</script>

<template>
  <div class="md-wrap">
    <component :is="'style'">{{ MARKDOWN_CSS }}</component>
    <article ref="root" class="md-body" v-html="html" @click="onClick" />
    <Transition name="fade"><span v-if="toast" class="toast">{{ toast }}</span></Transition>
  </div>
</template>

<style scoped>
.md-wrap {
  position: relative;
}
.toast {
  position: sticky;
  bottom: 12px;
  float: right;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--text);
  color: var(--bg);
  font-size: 12px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
