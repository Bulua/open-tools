<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { ChevronRight } from "lucide-vue-next";
import type { JsonValue } from "../utils";
import { TREE_CONTEXT, type TreeContext } from "./treeContext";

/** 树形视图中的一个节点，对象/数组会递归渲染子节点 */
const props = defineProps<{
  name?: string | number;
  value: JsonValue;
  path: string;
  depth: number;
}>();

const ctx = inject(TREE_CONTEXT) as TreeContext;

const isArray = computed(() => Array.isArray(props.value));
const isBranch = computed(() => props.value !== null && typeof props.value === "object");
const entries = computed<[string | number, JsonValue][]>(() => {
  const v = props.value;
  if (Array.isArray(v)) return v.map((item, i) => [i, item]);
  if (v && typeof v === "object") return Object.entries(v);
  return [];
});

// 默认展开前两层，响应「全部展开 / 全部折叠」
const open = ref(props.depth < 2);
watch(
  () => ctx.signal.value,
  (s) => (open.value = s.expand),
);

const childPath = (key: string | number) =>
  typeof key === "number"
    ? `${props.path}[${key}]`
    : /^[A-Za-z_$][\w$]*$/.test(key)
      ? `${props.path}.${key}`
      : `${props.path}[${JSON.stringify(key)}]`;

const valueClass = computed(() => {
  const v = props.value;
  if (typeof v === "string") return "string";
  if (typeof v === "number") return "number";
  return "literal";
});

const onClick = () => {
  if (isBranch.value) open.value = !open.value;
  ctx.selected.value = props.path;
};
</script>

<template>
  <div class="node">
    <div class="row" :class="{ selected: ctx.selected.value === path }" :style="{ paddingLeft: `${depth * 18 + 8}px` }" @click="onClick">
      <ChevronRight v-if="isBranch" :size="13" class="caret" :class="{ open }" />
      <span v-else class="caret-space" />
      <span v-if="name !== undefined" class="key" :class="{ index: typeof name === 'number' }">{{ name }}</span>
      <span v-if="name !== undefined" class="colon">:</span>
      <template v-if="isBranch">
        <span class="brace">{{ isArray ? "[" : "{" }}</span>
        <span v-if="!open" class="summary">{{ entries.length }} {{ isArray ? "项" : "个键" }}</span>
        <span v-if="!open" class="brace">{{ isArray ? "]" : "}" }}</span>
      </template>
      <span v-else class="value" :class="valueClass">{{ JSON.stringify(value) }}</span>
    </div>
    <template v-if="isBranch && open">
      <JsonTreeNode
        v-for="[k, v] in entries"
        :key="k"
        :name="k"
        :value="v"
        :path="childPath(k)"
        :depth="depth + 1"
      />
      <div class="row closing" :style="{ paddingLeft: `${depth * 18 + 8}px` }">
        <span class="caret-space" />
        <span class="brace">{{ isArray ? "]" : "}" }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding-right: 8px;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}
.row:hover {
  background: var(--hover);
}
.row.selected {
  background: var(--accent-soft);
}
.row.closing {
  cursor: default;
}
.row.closing:hover {
  background: none;
}
.caret {
  flex-shrink: 0;
  color: var(--text-3);
  transition: transform 0.12s;
}
.caret.open {
  transform: rotate(90deg);
}
.caret-space {
  width: 13px;
  flex-shrink: 0;
}
.key {
  color: var(--syntax-key);
}
.key.index {
  color: var(--text-3);
}
.colon,
.brace {
  color: var(--text-3);
}
.summary {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-3);
  padding: 0 4px;
}
.value {
  overflow: hidden;
  text-overflow: ellipsis;
}
.value.string {
  color: var(--syntax-string);
}
.value.number {
  color: var(--syntax-number);
}
.value.literal {
  color: var(--syntax-literal);
}
</style>
