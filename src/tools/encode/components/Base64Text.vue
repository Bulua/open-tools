<script setup lang="ts">
import { computed } from "vue";
import TwoWayConvert from "@/components/tool/TwoWayConvert.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { TOOL_ACTIONS } from "@/components/tool/toolActions";
import { base64ToText, textToBase64 } from "../base64";

/** 文本 ↔ Base64，双向实时转换 */
const urlSafe = useStoredRef("base64.urlSafe", false);
const encode = computed(() => (text: string) => textToBase64(text, urlSafe.value));
</script>

<template>
  <Teleport defer :to="TOOL_ACTIONS">
    <label class="check" title="+ / 替换为 - _，并去掉末尾的 =，适合放在 URL 中">
      <input v-model="urlSafe" type="checkbox" />URL 安全
    </label>
  </Teleport>

  <TwoWayConvert
    left-label="文本"
    right-label="Base64"
    :encode="encode"
    :decode="base64ToText"
    left-placeholder="输入文本，右侧实时显示 Base64"
    right-placeholder="或在这里粘贴 Base64，左侧实时解码"
  />
</template>
