<script setup lang="ts">
import type { Tool } from "@/tools/types";
import TextTransform from "./TextTransform.vue";
import EmptyState from "@/components/common/EmptyState.vue";

/**
 * 右侧工具区：标题 + 工具主体。
 * 工具主体按以下顺序决定：
 *   1. 工具定义了 component → 渲染自定义界面
 *   2. 工具定义了 actions   → 渲染通用文本转换界面
 *   3. 都没有               → 显示「即将上线」
 */
defineProps<{ tool: Tool; categoryName: string }>();
</script>

<template>
  <div class="tool-view">
    <header class="head">
      <div class="crumb">{{ categoryName }}</div>
      <h1>{{ tool.name }}</h1>
      <p>{{ tool.desc }}</p>
    </header>

    <component :is="tool.component" v-if="tool.component" />
    <TextTransform v-else-if="tool.actions" :actions="tool.actions" :placeholder="tool.inputPlaceholder" />
    <EmptyState v-else title="即将上线" :description="`「${tool.name}」还在打磨中，很快就能在这里使用。`" />
  </div>
</template>

<style scoped>
.tool-view {
  flex: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 480px;
}
.head {
  padding: 8px 0 24px;
}
.crumb {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 6px;
}
h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 400;
  letter-spacing: -0.3px;
}
.head p {
  margin: 6px 0 0;
  color: var(--text-2);
}
</style>
