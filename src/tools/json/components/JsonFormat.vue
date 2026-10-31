<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronsDownUp, ChevronsUpDown, CircleAlert, CircleCheck } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import ToolActions from "@/components/tool/ToolActions.vue";
import { describeError, editorErrorOf, formatJson, minifyJson, parseJson, sortKeys, type Indent } from "../utils";
import JsonTreeView from "./JsonTreeView.vue";

// 输入变化时实时校验，并以代码或树形展示结果
const input = ref("");
const view = useStoredRef<"code" | "tree">("json-format.view", "code");
const mode = useStoredRef<"format" | "minify">("json-format.mode", "format");
const indent = useStoredRef<Indent>("json-format.indent", 2);
const sort = useStoredRef("json-format.sort", false);

const inputPane = ref<InstanceType<typeof TextPane>>();
const treeView = ref<InstanceType<typeof JsonTreeView>>();

const result = computed(() => (input.value.trim() ? parseJson(input.value) : null));

const output = computed(() => {
  const r = result.value;
  if (!r?.ok) return "";
  return mode.value === "format" ? formatJson(r.value, indent.value, sort.value) : minifyJson(r.value, sort.value);
});

const treeValue = computed(() => {
  const r = result.value;
  if (!r?.ok) return null;
  return sort.value ? sortKeys(r.value) : r.value;
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
    <!-- 选项放到标题栏右侧；树形视图下格式选项不起作用，隐藏 -->
    <ToolActions>
      <template v-if="view === 'code'">
        <div class="seg">
          <button :class="{ on: mode === 'format' }" @click="mode = 'format'">格式化</button>
          <button :class="{ on: mode === 'minify' }" @click="mode = 'minify'">压缩</button>
        </div>
        <div v-if="mode === 'format'" class="seg">
          <button v-for="o in indentOptions" :key="o.value" :class="{ on: indent === o.value }" @click="indent = o.value">
            {{ o.label }}
          </button>
        </div>
      </template>
      <label class="check"><input v-model="sort" type="checkbox" />按键名排序</label>
    </ToolActions>

    <TextPane
      ref="inputPane"
      v-model="input"
      class="input"
      label="输入"
      language="json"
      :code-error="editorErrorOf(result)"
      placeholder='粘贴 JSON，例如 {"name":"Open Tools"}'
    >
      <template #actions>
        <span v-if="result?.ok" class="status ok"><CircleCheck :size="13" />有效</span>
        <button v-else-if="result" class="status bad" title="跳到出错位置" @click="locate">
          <CircleAlert :size="13" />{{ result.line ? `第 ${result.line} 行有误` : "格式有误" }}
        </button>
      </template>
    </TextPane>

    <TextPane
      :model-value="output"
      class="output"
      label="结果"
      readonly
      nowrap
      language="json"
      placeholder="结果会实时显示在这里"
    >
      <template #actions>
        <div class="seg">
          <button :class="{ on: view === 'code' }" @click="view = 'code'">代码</button>
          <button :class="{ on: view === 'tree' }" @click="view = 'tree'">树形</button>
        </div>
        <template v-if="view === 'tree' && treeValue !== null">
          <button class="icon-btn" title="全部折叠" @click="treeView?.collapseAll()"><ChevronsDownUp :size="14" /></button>
          <button class="icon-btn" title="全部展开" @click="treeView?.expandAll()"><ChevronsUpDown :size="14" /></button>
        </template>
      </template>

      <!-- 输入有误时在结果区说明原因；树形模式下用树形视图替换代码 -->
      <template v-if="result && !result.ok" #body>
        <div class="error">
          <p>{{ describeError(result) }}</p>
          <button v-if="result.position !== undefined" class="btn" @click="locate">定位到出错位置</button>
        </div>
      </template>
      <template v-else-if="view === 'tree'" #body>
        <JsonTreeView v-if="treeValue !== null" ref="treeView" :value="treeValue" />
        <EmptyState v-else title="还没有数据" description="在左侧粘贴 JSON，这里会以树形结构展示，点击节点可以复制它的路径。" />
      </template>
    </TextPane>
  </div>
</template>

<style scoped>
.json-format {
  flex: 1;
  display: flex;
  gap: 14px;
  min-height: 0;
}
/* 输入框固定宽度，长行自动换行；结果占满剩余空间 */
.input {
  flex: 0 0 420px;
}
.output {
  flex: 1;
}
/* 窗口较窄时上下排列，避免结果区被挤得太窄 */
@media (max-width: 1100px) {
  .json-format {
    flex-direction: column;
  }
  .input,
  .output {
    flex: 1 1 0;
  }
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-right: 6px;
  padding: 2px 8px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
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
.output .seg {
  margin-right: 4px;
}
.error {
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.error p {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
  line-height: 1.6;
}
</style>
