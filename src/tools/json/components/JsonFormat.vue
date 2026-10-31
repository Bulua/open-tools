<script setup lang="ts">
import { computed, ref } from "vue";
import { CircleAlert, CircleCheck } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { formatJson, minifyJson, parseJson, type Indent } from "../utils";

// 输入变化时实时校验并输出结果
const input = ref("");
const mode = useStoredRef<"format" | "minify">("json-format.mode", "format");
const indent = useStoredRef<Indent>("json-format.indent", 2);
const sort = useStoredRef("json-format.sort", false);
const inputPane = ref<InstanceType<typeof TextPane>>();

const result = computed(() => (input.value.trim() ? parseJson(input.value) : null));

const output = computed(() => {
  const r = result.value;
  if (!r?.ok) return "";
  return mode.value === "format" ? formatJson(r.value, indent.value, sort.value) : minifyJson(r.value, sort.value);
});

const indentOptions: { label: string; value: Indent }[] = [
  { label: "2 空格", value: 2 },
  { label: "4 空格", value: 4 },
  { label: "Tab", value: "tab" },
];

const locate = () => {
  const r = result.value;
  if (r && !r.ok && r.position !== undefined) inputPane.value?.focusAt(r.position);
};
</script>

<template>
  <div class="json-format">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ on: mode === 'format' }" @click="mode = 'format'">格式化</button>
        <button :class="{ on: mode === 'minify' }" @click="mode = 'minify'">压缩</button>
      </div>
      <div v-if="mode === 'format'" class="seg">
        <button v-for="o in indentOptions" :key="o.value" :class="{ on: indent === o.value }" @click="indent = o.value">
          {{ o.label }}
        </button>
      </div>
      <label class="check"><input v-model="sort" type="checkbox" />按键名排序</label>

      <span class="spacer" />

      <span v-if="result?.ok" class="status ok"><CircleCheck :size="14" />JSON 有效</span>
      <button v-else-if="result" class="status bad" title="点击定位到错误位置" @click="locate">
        <CircleAlert :size="14" />
        <template v-if="result.line">第 {{ result.line }} 行第 {{ result.column }} 列：</template>{{ result.message }}
      </button>
    </div>

    <div class="panes">
      <TextPane ref="inputPane" v-model="input" label="输入 JSON" nowrap placeholder='粘贴 JSON，例如 {"name":"Open Tools"}' />
      <TextPane :model-value="output" label="结果" readonly nowrap placeholder="结果会实时显示在这里" />
    </div>
  </div>
</template>

<style scoped>
.json-format {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}
.panes {
  flex: 1;
  display: flex;
  gap: 14px;
  min-height: 0;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 10px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status.ok {
  color: var(--success);
  background: var(--success-soft);
}
.status.bad {
  color: var(--danger);
  background: var(--danger-soft);
}
</style>
