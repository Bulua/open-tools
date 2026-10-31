<script setup lang="ts">
import { ref, watch } from "vue";
import { CircleAlert } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { TOOL_ACTIONS } from "@/components/tool/toolActions";
import { base64ToText, textToBase64 } from "../base64";

/**
 * 文本 ↔ Base64，双向实时转换：
 * 改左边的文本，右边自动编码；改右边的 Base64，左边自动解码。
 */
const text = ref("");
const base64 = ref("");
const urlSafe = useStoredRef("base64.urlSafe", false);
const error = ref("");

// 只响应用户对某一边的编辑，再更新另一边，不会互相触发
const onTextInput = (value: string) => {
  text.value = value;
  base64.value = textToBase64(value, urlSafe.value);
  error.value = "";
};

const onBase64Input = (value: string) => {
  base64.value = value;
  try {
    text.value = value.trim() ? base64ToText(value) : "";
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
};

// 切换「URL 安全」时按新写法重新编码
watch(urlSafe, () => text.value && onTextInput(text.value));
</script>

<template>
  <div class="base64-text">
    <Teleport defer :to="TOOL_ACTIONS">
      <label class="check" title="+ / 替换为 - _，并去掉末尾的 =，适合放在 URL 中">
        <input v-model="urlSafe" type="checkbox" />URL 安全
      </label>
    </Teleport>

    <TextPane :model-value="text" label="文本" placeholder="输入文本，右侧实时显示 Base64" @update:model-value="onTextInput" />
    <TextPane
      :model-value="base64"
      label="Base64"
      placeholder="或在这里粘贴 Base64，左侧实时解码"
      @update:model-value="onBase64Input"
    >
      <template #actions>
        <span v-if="error" class="status" :title="error"><CircleAlert :size="13" />{{ error }}</span>
      </template>
    </TextPane>
  </div>
</template>

<style scoped>
.base64-text {
  flex: 1;
  display: flex;
  gap: 14px;
  min-height: 0;
}
@media (max-width: 1100px) {
  .base64-text {
    flex-direction: column;
  }
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  margin-right: 6px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
