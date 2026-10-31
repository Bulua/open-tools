<script setup lang="ts">
import type { Tool } from "@/tools/types";
import TextTransform from "./TextTransform.vue";
import EmptyState from "@/components/common/EmptyState.vue";

/**
 * 右侧工具区：标题栏 + 工具主体。
 *
 * 标题栏左边是工具名称和说明，右边留给工具放选项。
 * 工具组件里用 <Teleport defer :to="TOOL_ACTIONS"> 把选项放到这里（参考 JsonFormat.vue），
 * TOOL_ACTIONS 定义在 toolActions.ts。
 *
 * 工具主体按以下顺序决定：
 *   1. 工具定义了 component → 渲染自定义界面
 *   2. 工具定义了 actions   → 渲染通用文本转换界面
 *   3. 都没有               → 显示「即将上线」
 */
defineProps<{ tool: Tool }>();
</script>

<template>
  <div class="tool-view">
    <header class="head">
      <div class="title">
        <h1>{{ tool.name }}</h1>
        <p>{{ tool.desc }}</p>
      </div>
      <div id="tool-actions" class="actions" />
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
  min-height: 420px;
}
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 32px;
  padding-bottom: 20px;
}
.title {
  min-width: 0;
}
h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 400;
  letter-spacing: -0.3px;
  line-height: 1.3;
}
.title p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-2);
}
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.actions:empty {
  display: none;
}
</style>
