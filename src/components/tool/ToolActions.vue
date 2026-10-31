<script setup lang="ts">
import { TOOL_ACTIONS, useToolActive } from "./toolActions";

/**
 * 把工具的选项（模式切换、复选框等）放进顶部工具栏右侧。
 * 多会话时只有当前会话的选项会显示。
 *
 * 用法：<ToolActions><label class="check">…</label></ToolActions>
 */
const active = useToolActive();
</script>

<template>
  <Teleport v-if="active" defer :to="TOOL_ACTIONS">
    <slot />
  </Teleport>
</template>
