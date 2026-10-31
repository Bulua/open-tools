<script setup lang="ts">
import type { Tool } from "@/tools/types";
import TextTransform from "./TextTransform.vue";
import EmptyState from "@/components/common/EmptyState.vue";

/**
 * 右侧工具区：顶部一条工具栏 + 下方工作区。
 *
 * 工具栏左边是工具图标、名称和一句说明，右边留给工具放选项。
 * 工具组件里用 <Teleport defer :to="TOOL_ACTIONS"> 把选项放到这里（参考 JsonFormat.vue），
 * TOOL_ACTIONS 定义在 toolActions.ts。
 *
 * 工作区按以下顺序决定内容：
 *   1. 工具定义了 component → 渲染自定义界面
 *   2. 工具定义了 actions   → 渲染通用文本转换界面
 *   3. 都没有               → 显示「即将上线」
 */
defineProps<{ tool: Tool }>();
</script>

<template>
  <div class="tool-view">
    <header class="bar">
      <span class="icon"><component :is="tool.icon" :size="16" :stroke-width="1.75" /></span>
      <div class="title">
        <h1>{{ tool.name }}</h1>
        <p :title="tool.desc">{{ tool.desc }}</p>
      </div>
      <div id="tool-actions" class="actions" />
    </header>

    <div class="workspace">
      <component :is="tool.component" v-if="tool.component" />
      <TextTransform v-else-if="tool.actions" :actions="tool.actions" :placeholder="tool.inputPlaceholder" />
      <EmptyState v-else title="即将上线" :description="`「${tool.name}」还在打磨中，很快就能在这里使用。`" />
    </div>
  </div>
</template>

<style scoped>
.tool-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 工具栏：一行放下名称、说明和选项 */
/* 空间不够时，右侧选项自动换到第二行，不会遮住标题 */
.bar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  min-height: 56px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
}
.title {
  flex: 1 1 200px;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
h1 {
  flex-shrink: 0;
  margin: 0;
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 400;
  letter-spacing: -0.2px;
  white-space: nowrap;
}
.title p {
  min-width: 0;
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px 12px;
  margin-left: auto;
}
.actions:empty {
  display: none;
}

/* 工作区：铺满剩余空间 */
.workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 24px 20px;
  overflow: auto;
}
</style>
