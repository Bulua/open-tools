<script setup lang="ts">
import { computed, provide, ref } from "vue";
import { Check, ChevronsDownUp, ChevronsUpDown, Copy } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { useClipboard } from "@/composables/useClipboard";
import { parseJson } from "../utils";
import JsonTreeNode from "./JsonTreeNode.vue";
import { TREE_CONTEXT } from "./treeContext";

const input = ref("");
const result = computed(() => (input.value.trim() ? parseJson(input.value) : null));

const selected = ref("");
const signal = ref({ expand: true });
provide(TREE_CONTEXT, { selected, signal });

const { copied, copy } = useClipboard();
</script>

<template>
  <div class="json-tree">
    <TextPane v-model="input" class="input" label="输入 JSON" nowrap placeholder="粘贴 JSON，右侧以树形结构查看" />

    <section class="viewer">
      <header class="viewer-head">
        <span>树形视图</span>
        <div class="viewer-actions">
          <button class="icon-btn" title="全部展开" @click="signal = { expand: true }"><ChevronsUpDown :size="14" /></button>
          <button class="icon-btn" title="全部折叠" @click="signal = { expand: false }"><ChevronsDownUp :size="14" /></button>
        </div>
      </header>

      <div class="tree">
        <JsonTreeNode v-if="result?.ok" :value="result.value" path="$" :depth="0" />
        <p v-else-if="result" class="error">
          <template v-if="result.line">第 {{ result.line }} 行第 {{ result.column }} 列：</template>{{ result.message }}
        </p>
        <EmptyState v-else title="还没有数据" description="在左侧粘贴 JSON，点击节点可以查看并复制它的路径。" />
      </div>

      <footer v-if="result?.ok && selected" class="path">
        <span class="path-label">路径</span>
        <code>{{ selected }}</code>
        <button class="icon-btn" :class="{ ok: copied }" title="复制路径" @click="copy(selected)">
          <Check v-if="copied" :size="14" />
          <Copy v-else :size="14" />
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.json-tree {
  flex: 1;
  display: flex;
  gap: 14px;
  min-height: 0;
}
.input {
  flex: 0 0 38%;
}
.viewer {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.viewer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 4px 16px;
  font-size: 12px;
  color: var(--text-3);
}
.viewer-actions {
  display: flex;
  gap: 2px;
}
.tree {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 0 8px 10px;
}
.error {
  margin: 0;
  padding: 6px 8px;
  color: var(--danger);
  font-size: 13px;
}
.path {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 6px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-sunken);
}
.path-label {
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
