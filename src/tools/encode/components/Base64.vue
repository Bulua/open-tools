<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useStoredRef } from "@/composables/useStoredRef";
import ToolActions from "@/components/tool/ToolActions.vue";
import Base64Text from "./Base64Text.vue";
import Base64File from "./Base64File.vue";

/** Base64 工具入口：在标题栏切换「文本」与「文件 / 图片」两种模式 */
const mode = useStoredRef<"text" | "file">("base64.mode", "text");
const { t } = useI18n();
</script>

<template>
  <ToolActions>
    <div class="seg">
      <button :class="{ on: mode === 'text' }" @click="mode = 'text'">{{ t("encode.text") }}</button>
      <button :class="{ on: mode === 'file' }" @click="mode = 'file'">{{ t("encode.fileImage") }}</button>
    </div>
  </ToolActions>

  <Base64Text v-if="mode === 'text'" />
  <Base64File v-else />
</template>
