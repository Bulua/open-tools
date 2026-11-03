<script setup lang="ts">
import { provide, ref } from "vue";
import { Check, Copy } from "lucide-vue-next";
import { useClipboard } from "@/composables/useClipboard";
import { useI18n } from "vue-i18n";
import type { JsonValue } from "../utils";
import JsonTreeNode from "./JsonTreeNode.vue";
import { TREE_CONTEXT } from "./treeContext";

/** JSON 树形视图：可折叠，点击节点在底部显示并复制它的路径 */
defineProps<{ value: JsonValue }>();
const { t } = useI18n();

const selected = ref("");
const signal = ref({ expand: true });
provide(TREE_CONTEXT, { selected, signal });

const { copied, copy } = useClipboard();

defineExpose({
  collapseAll: () => (signal.value = { expand: false }),
  expandAll: () => (signal.value = { expand: true }),
});
</script>

<template>
  <div class="tree-view">
    <div class="tree">
      <JsonTreeNode :value="value" path="$" :depth="0" />
    </div>

    <footer class="path">
      <span class="path-label">{{ t("json.path") }}</span>
      <code v-if="selected">{{ selected }}</code>
      <span v-else class="path-hint">{{ t("json.pathHint") }}</span>
      <button v-if="selected" class="icon-btn" :class="{ ok: copied }" :title="t('json.copyPath')" @click="copy(selected)">
        <Check v-if="copied" :size="14" />
        <Copy v-else :size="14" />
      </button>
    </footer>
  </div>
</template>

<style scoped>
.tree-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.tree {
  flex: 1;
  overflow: auto;
  padding: 2px 8px 10px;
}
.path {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 0 8px 0 16px;
  border-top: 1px solid var(--border);
  border-radius: 0 0 var(--radius) var(--radius);
}
.path-label {
  font-size: 12px;
  color: var(--text-3);
}
.path-hint {
  font-size: 12px;
  color: var(--text-3);
}
.path code {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}
</style>
