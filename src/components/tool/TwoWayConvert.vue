<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { ref, watch } from "vue";
import { CircleAlert } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";

/**
 * 通用双向实时转换界面：左右两个文本框，改哪边，另一边就自动转换。
 * 适合编码 / 解码成对出现的工具，例如 Base64、URL 编码。
 *
 * encode / decode 变化时（例如切换了选项），会按左边的原文重新转换。
 */
const props = defineProps<{
  leftLabel: string;
  rightLabel: string;
  encode: (text: string) => string;
  decode: (text: string) => string;
  leftPlaceholder?: string;
  rightPlaceholder?: string;
}>();

const left = ref("");
const right = ref("");
const error = ref("");

// 只响应用户对某一边的编辑，再更新另一边，不会互相触发
const onLeftInput = (value: string) => {
  left.value = value;
  error.value = "";
  try {
    right.value = props.encode(value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
};

const onRightInput = (value: string) => {
  right.value = value;
  try {
    left.value = value.trim() ? props.decode(value) : "";
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
};

watch(
  () => [props.encode, props.decode],
  () => left.value && onLeftInput(left.value),
);

useToolResult(() => !error.value && (left.value || right.value) ? `${left.value}\0${right.value}` : "");
</script>

<template>
  <div class="two-way">
    <TextPane :model-value="left" :label="leftLabel" :placeholder="leftPlaceholder" @update:model-value="onLeftInput" />
    <TextPane :model-value="right" :label="rightLabel" :placeholder="rightPlaceholder" @update:model-value="onRightInput">
      <template #actions>
        <span v-if="error" class="status" :title="error"><CircleAlert :size="13" />{{ error }}</span>
      </template>
    </TextPane>
  </div>
</template>

<style scoped>
.two-way {
  flex: 1;
  display: flex;
  gap: 14px;
  min-height: 0;
}
@media (max-width: 1100px) {
  .two-way {
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
