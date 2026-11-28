<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { ref, watch } from "vue";
import { CircleAlert } from "lucide-vue-next";
import SplitPane from "@/components/common/SplitPane.vue";
import TextPane from "@/components/common/TextPane.vue";

/**
 * 通用双向实时转换界面：左右两个可拖拽分栏的文本框，改哪边，另一边就自动转换。
 * 适合编码 / 解码成对出现的工具，例如 Base64、URL 编码。
 *
 * encode / decode 变化时（例如切换了选项），会按左边的原文重新转换。
 */
const props = withDefaults(
  defineProps<{
    leftLabel: string;
    rightLabel: string;
    encode: (text: string) => string;
    decode: (text: string) => string;
    leftPlaceholder?: string;
    rightPlaceholder?: string;
    storageKey?: string;
  }>(),
  { leftPlaceholder: undefined, rightPlaceholder: undefined, storageKey: "two-way" },
);

const left = ref("");
const right = ref("");
const error = ref("");
const activeSide = ref<"left" | "right" | null>(null);

// 只响应用户对某一边的编辑，再更新另一边，不会互相触发
const onLeftInput = (value: string) => {
  left.value = value;
  activeSide.value = value ? "left" : null;
  error.value = "";
  try {
    right.value = props.encode(value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
};

const onRightInput = (value: string) => {
  right.value = value;
  activeSide.value = value ? "right" : null;
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
    <SplitPane :storage-key="storageKey" :default-ratio="0.5" :min="260">
      <template #left>
        <TextPane
          :model-value="left"
          :class="{ 'is-source': activeSide === 'left' }"
          :label="leftLabel"
          :placeholder="leftPlaceholder"
          copyable
          @update:model-value="onLeftInput"
        />
      </template>

      <template #right>
        <TextPane
          :model-value="right"
          :class="{ 'is-source': activeSide === 'right' }"
          :label="rightLabel"
          :placeholder="rightPlaceholder"
          copyable
          @update:model-value="onRightInput"
        >
          <template #actions>
            <span v-if="error" class="status" :title="error"><CircleAlert :size="13" />{{ error }}</span>
          </template>
        </TextPane>
      </template>
    </SplitPane>
  </div>
</template>

<style scoped>
.two-way {
  flex: 1;
  display: flex;
  min-height: 0;
}
.is-source :deep(.pane-label) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}
.is-source :deep(.pane-label::before) {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 260px;
  margin-right: 4px;
  padding: 2px 9px;
  border: 1px solid color-mix(in srgb, var(--danger) 26%, transparent);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--danger);
  background: var(--danger-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 720px) {
  .two-way {
    flex: none;
    width: 100%;
    min-width: 0;
  }
}
</style>
