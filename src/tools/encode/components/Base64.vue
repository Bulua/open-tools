<script setup lang="ts">
import { useStoredRef } from "@/composables/useStoredRef";
import { TOOL_ACTIONS } from "@/components/tool/toolActions";
import Base64Text from "./Base64Text.vue";
import Base64File from "./Base64File.vue";

/** Base64 工具入口：在标题栏切换「文本」与「文件 / 图片」两种模式 */
const mode = useStoredRef<"text" | "file">("base64.mode", "text");
</script>

<template>
  <Teleport defer :to="TOOL_ACTIONS">
    <div class="seg">
      <button :class="{ on: mode === 'text' }" @click="mode = 'text'">文本</button>
      <button :class="{ on: mode === 'file' }" @click="mode = 'file'">文件 / 图片</button>
    </div>
  </Teleport>

  <Base64Text v-if="mode === 'text'" />
  <Base64File v-else />
</template>
