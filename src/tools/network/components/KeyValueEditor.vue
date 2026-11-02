<script setup lang="ts">
import { Paperclip, X } from "lucide-vue-next";
import { emptyRow, type KeyValue } from "../http";

/**
 * 键值对表格：查询参数、请求头、表单字段共用。
 * 最后一行始终是空行，填写后自动再加一行；每行可以单独停用。
 * allowFiles 为 true 时（multipart 表单）每行可以选择文件代替文字。
 */
const props = withDefaults(defineProps<{ keyPlaceholder?: string; valuePlaceholder?: string; allowFiles?: boolean; suggestions?: string[] }>(), {
  keyPlaceholder: "名称",
  valuePlaceholder: "值",
  allowFiles: false,
  suggestions: () => [],
});
const rows = defineModel<KeyValue[]>({ required: true });
const listId = `kv-${Math.random().toString(36).slice(2)}`;

const update = (i: number, patch: Partial<KeyValue>) => {
  const next = rows.value.map((r, k) => (k === i ? { ...r, ...patch } : r));
  const last = next[next.length - 1];
  if (!last || last.key || last.value || last.file) next.push(emptyRow());
  rows.value = next;
};
const remove = (i: number) => {
  const next = rows.value.filter((_, k) => k !== i);
  if (!next.length || next[next.length - 1].key || next[next.length - 1].value) next.push(emptyRow());
  rows.value = next;
};
const pickFile = (i: number, e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) update(i, { file, value: "" });
};
const isEmpty = (r: KeyValue, i: number) => i === rows.value.length - 1 && !r.key && !r.value && !r.file;
</script>

<template>
  <div class="kv">
    <div v-for="(row, i) in rows" :key="i" class="kv-row" :class="{ off: !row.enabled, empty: isEmpty(row, i) }">
      <input
        type="checkbox"
        class="file-check"
        :checked="row.enabled"
        :disabled="isEmpty(row, i)"
        title="停用后不发送这一项"
        @change="update(i, { enabled: !row.enabled })"
      />
      <input class="field cell" :value="row.key" :placeholder="keyPlaceholder" :list="suggestions.length ? listId : undefined" spellcheck="false" @input="update(i, { key: ($event.target as HTMLInputElement).value })" />
      <div v-if="row.file" class="field cell file" :title="row.file.name">
        <Paperclip :size="13" />
        <span>{{ row.file.name }}</span>
        <button class="icon-btn" title="改回文字" @click="update(i, { file: null })"><X :size="12" /></button>
      </div>
      <input v-else class="field cell" :value="row.value" :placeholder="valuePlaceholder" spellcheck="false" @input="update(i, { value: ($event.target as HTMLInputElement).value })" />
      <label v-if="props.allowFiles" class="icon-btn attach" title="选择文件">
        <Paperclip :size="14" />
        <input type="file" hidden @change="pickFile(i, $event)" />
      </label>
      <button class="icon-btn" title="删除" :disabled="isEmpty(row, i)" @click="remove(i)"><X :size="14" /></button>
    </div>
    <datalist v-if="suggestions.length" :id="listId">
      <option v-for="s in suggestions" :key="s" :value="s" />
    </datalist>
  </div>
</template>

<style scoped>
.kv {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.kv-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cell {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.file {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
}
.file span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file .icon-btn {
  width: 20px;
  height: 20px;
}
.off .cell {
  opacity: 0.5;
  text-decoration: line-through;
}
.empty .cell {
  border-style: dashed;
}
.attach {
  cursor: pointer;
}
.icon-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
</style>
