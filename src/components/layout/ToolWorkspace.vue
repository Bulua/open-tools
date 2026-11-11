<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { Category, Tool } from "@/tools";
import HomePage from "./HomePage.vue";
import ToolView from "@/components/tool/ToolView.vue";

const props = defineProps<{ home: boolean; categories: Category[]; tool?: Tool }>();
const emit = defineEmits<{ select: [categoryId: string, toolId: string]; search: [] }>();
const workspace = ref<HTMLElement>();
let animation: Animation | undefined;

// 动画只作用于稳定的容器，不把离场钩子附着到 KeepAlive 缓存的工具上。
watch(() => props.home, () => {
  animation?.cancel();
  if (!workspace.value?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  animation = workspace.value.animate([
    { transform: "translateY(12px)", clipPath: "inset(0 0 100% 0)" },
    { transform: "translateY(0)", clipPath: "inset(0)" },
  ], { duration: 300, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
}, { flush: "post" });
onBeforeUnmount(() => animation?.cancel());
</script>

<template>
  <div ref="workspace" class="tool-workspace">
    <KeepAlive :max="13">
      <HomePage v-if="home" key="home" :categories="categories" @select="(categoryId, toolId) => emit('select', categoryId, toolId)" @search="emit('search')" />
      <ToolView v-else-if="tool" :key="tool.id" :tool="tool" />
    </KeepAlive>
  </div>
</template>

<style scoped>
.tool-workspace {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
