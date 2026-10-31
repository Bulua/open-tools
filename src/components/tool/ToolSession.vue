<script setup lang="ts">
import { provide, toRef } from "vue";
import type { Tool } from "@/tools/types";
import TextTransform from "./TextTransform.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { TOOL_ACTIVE } from "./toolActions";

/**
 * 工具主体的一个实例（一个会话）。
 * 多会话时每个会话各有一个实例，互不影响；通过 TOOL_ACTIVE 告诉内部组件自己是否在前台。
 *
 * 主体按以下顺序决定：
 *   1. 工具定义了 component → 渲染自定义界面
 *   2. 工具定义了 actions   → 渲染通用文本转换界面
 *   3. 都没有               → 显示「即将上线」
 */
const props = withDefaults(defineProps<{ tool: Tool; active?: boolean }>(), { active: true });

provide(TOOL_ACTIVE, toRef(props, "active"));
</script>

<template>
  <component :is="tool.component" v-if="tool.component" />
  <TextTransform v-else-if="tool.actions" :actions="tool.actions" :placeholder="tool.inputPlaceholder" />
  <EmptyState v-else title="即将上线" :description="`「${tool.name}」还在打磨中，很快就能在这里使用。`" />
</template>
