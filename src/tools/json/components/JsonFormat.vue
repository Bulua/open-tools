<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronsDownUp, ChevronsUpDown, CircleAlert, CircleCheck } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import SplitPane from "@/components/common/SplitPane.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import ToolActions from "@/components/tool/ToolActions.vue";
import { describeError, editorErrorOf, formatJson, minifyJson, parseJson, sortKeys, type Indent } from "../utils";
import JsonTreeView from "./JsonTreeView.vue";

const { t } = useI18n();
/** 输入框提示里的示例，放在文案外面，免得花括号被当成插值 */
const EXAMPLE = '{"name":"Open Tools"}';

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

const indentOptions = computed<{ label: string; value: Indent }[]>(() => [
  { label: t("json.spaces", { n: 2 }), value: 2 },
  { label: t("json.spaces", { n: 4 }), value: 4 },
  { label: "Tab", value: "tab" },
]);

const locate = () => {
  const r = result.value;
  if (r && !r.ok && r.position !== undefined) inputPane.value?.focusAt(r.position);
};

useToolResult(() => output.value ? JSON.stringify([input.value, mode.value, indent.value, sort.value]) : "");
</script>

<template>
  <div class="json-format">
    <!-- 选项放到标题栏右侧；树形视图下格式选项不起作用，隐藏 -->
    <ToolActions>
      <template v-if="view === 'code'">
        <div class="seg">
          <button :class="{ on: mode === 'format' }" @click="mode = 'format'">{{ t("json.format") }}</button>
          <button :class="{ on: mode === 'minify' }" @click="mode = 'minify'">{{ t("json.minify") }}</button>
        </div>
        <div v-if="mode === 'format'" class="seg">
          <button v-for="o in indentOptions" :key="o.value" :class="{ on: indent === o.value }" @click="indent = o.value">
            {{ o.label }}
          </button>
        </div>
      </template>
      <label class="check"><input v-model="sort" type="checkbox" />{{ t("json.sortKeys") }}</label>
    </ToolActions>

    <SplitPane storage-key="json-format" :default-ratio="0.4">
      <template #left>
        <TextPane
          ref="inputPane"
          v-model="input"
          :label="t('json.input')"
          language="json"
          :code-error="editorErrorOf(result)"
          :placeholder="t('json.inputPlaceholder', { example: EXAMPLE })"
        >
          <template #actions>
            <span v-if="result?.ok" class="status ok"><CircleCheck :size="13" />{{ t("json.valid") }}</span>
            <button v-else-if="result" class="status bad" :title="t('json.jumpToError')" @click="locate">
              <CircleAlert :size="13" />{{ result.line ? t("json.errorLine", { line: result.line }) : t("json.invalid") }}
            </button>
          </template>
        </TextPane>
      </template>

      <template #right>
        <TextPane :model-value="output" class="output" :label="t('json.result')" readonly nowrap language="json" :placeholder="t('json.resultPlaceholder')">
          <template #actions>
            <div class="seg">
              <button :class="{ on: view === 'code' }" @click="view = 'code'">{{ t("json.code") }}</button>
              <button :class="{ on: view === 'tree' }" @click="view = 'tree'">{{ t("json.tree") }}</button>
            </div>
            <template v-if="view === 'tree' && treeValue !== null">
              <button class="icon-btn" :title="t('json.collapseAll')" @click="treeView?.collapseAll()"><ChevronsDownUp :size="14" /></button>
              <button class="icon-btn" :title="t('json.expandAll')" @click="treeView?.expandAll()"><ChevronsUpDown :size="14" /></button>
            </template>
          </template>

          <!-- 输入有误时在结果区说明原因；树形模式下用树形视图替换代码 -->
          <template v-if="result && !result.ok" #body>
            <div class="error">
              <p>{{ describeError(result) }}</p>
              <button v-if="result.position !== undefined" class="btn" @click="locate">{{ t("json.locateError") }}</button>
            </div>
          </template>
          <template v-else-if="view === 'tree'" #body>
            <JsonTreeView v-if="treeValue !== null" ref="treeView" :value="treeValue" />
            <EmptyState v-else :title="t('json.treeEmptyTitle')" :description="t('json.treeEmptyDesc')" />
          </template>
        </TextPane>
      </template>
    </SplitPane>
  </div>
</template>

<style scoped>
.json-format {
  flex: 1;
  display: flex;
  min-height: 0;
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

@media (max-width: 720px) {
  .json-format {
    flex: none;
    width: 100%;
    min-width: 0;
  }
}
</style>
