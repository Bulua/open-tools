<script lang="ts">
export interface CopyItem {
  label: string;
  value: string;
  /** 结果后面的灰色补充说明 */
  hint?: string;
  /** 没有结果时显示的灰色示例 */
  placeholder?: string;
}
</script>

<script setup lang="ts">
import { ref } from "vue";
import { Check, Copy } from "lucide-vue-next";
import { useClipboard } from "@/composables/useClipboard";

/**
 * 「名称 + 结果 + 复制按钮」列表，用于一次显示多种结果。
 * 例如哈希计算的 MD5 / SHA、时间戳的各种格式。
 */
withDefaults(defineProps<{ items: CopyItem[]; labelWidth?: string }>(), { labelWidth: "72px" });

const { copy } = useClipboard();
const copiedLabel = ref<string | null>(null);

const onCopy = async (item: CopyItem) => {
  if (!item.value) return;
  await copy(item.value);
  copiedLabel.value = item.label;
  setTimeout(() => (copiedLabel.value = null), 1200);
};
</script>

<template>
  <ul class="copy-list">
    <li v-for="item in items" :key="item.label" class="row">
      <span class="label" :style="{ flexBasis: labelWidth }">{{ item.label }}</span>
      <code :class="{ empty: !item.value }">{{ item.value || item.placeholder || "—" }}<em v-if="item.hint && item.value">{{ item.hint }}</em></code>
      <button
        class="icon-btn"
        :class="{ ok: copiedLabel === item.label }"
        :disabled="!item.value"
        title="复制"
        @click="onCopy(item)"
      >
        <Check v-if="copiedLabel === item.label" :size="14" />
        <Copy v-else :size="14" />
      </button>
    </li>
  </ul>
</template>

<style scoped>
.copy-list {
  list-style: none;
  margin: 0;
  padding: 4px 8px 8px;
}
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 36px;
  padding: 4px 8px;
  border-radius: 8px;
}
.row:hover {
  background: var(--hover);
}
.label {
  flex-shrink: 0;
  flex-grow: 0;
  font-size: 12px;
  color: var(--text-3);
}
code {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  word-break: break-all;
  white-space: pre-wrap;
  user-select: text;
}
code.empty {
  color: var(--text-3);
}
em {
  margin-left: 10px;
  font-family: var(--font-sans);
  font-style: normal;
  font-size: 12px;
  color: var(--text-3);
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
