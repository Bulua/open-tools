<script setup lang="ts">
import { recordToolUsage } from "@/composables/toolLibrary";
import { ref } from "vue";
import { ArrowLeftRight } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import type { ToolAction } from "@/tools/types";
import SplitPane from "@/components/common/SplitPane.vue";
import TextPane from "@/components/common/TextPane.vue";

/**
 * 通用「操作栏 + 左右分栏（输入 / 输出）」文本转换工具界面。
 * 只需在工具定义里提供 actions，就能得到一个完整的文本转换工具。
 */
const props = withDefaults(
  defineProps<{ actions: ToolAction[]; placeholder?: string; highlightJson?: boolean; storageKey?: string }>(),
  { placeholder: undefined, highlightJson: false, storageKey: "text-transform" },
);

const { t } = useI18n();
const input = ref("");
const output = ref("");
const error = ref("");
const lastAction = ref("");

// JSON 转换工具也接受 YAML 和转义文本。保留同一个编辑器，只切换语法样式。
function editorLanguage(text: string): "json" | "text" | undefined {
  if (!props.highlightJson) return undefined;
  const value = text.trimStart();
  if (value.startsWith("{") || value.startsWith("[")) return "json";
  if (/^(?:"|-?\d|true|false|null)/.test(value)) {
    try {
      JSON.parse(value);
      return "json";
    } catch {
      // 不是完整的 JSON 值，按文本显示。
    }
  }
  return "text";
}

const run = async (action: ToolAction) => {
  error.value = "";
  lastAction.value = action.label;
  try {
    output.value = await action.run(input.value);
    if (input.value.trim() && output.value) recordToolUsage();
  } catch (e) {
    output.value = "";
    error.value = t("tool.actionFailed", { action: action.label, error: e instanceof Error ? e.message : String(e) });
  }
};

const swap = () => {
  [input.value, output.value] = [output.value, input.value];
  error.value = "";
};
</script>

<template>
  <div class="transform">
    <div class="action-bar">
      <div class="actions">
        <button
          v-for="a in actions"
          :key="a.label"
          class="btn"
          :class="{ primary: a.primary, active: !a.primary && lastAction === a.label }"
          @click="run(a)"
        >
          {{ a.label }}
        </button>
      </div>
      <span class="spacer" />
      <button class="btn small subtle" :disabled="!input && !output" :title="t('tool.swapTitle')" @click="swap">
        <ArrowLeftRight :size="14" />
        {{ t("tool.swap") }}
      </button>
    </div>

    <SplitPane :storage-key="storageKey" :default-ratio="0.48" :min="260">
      <template #left>
        <TextPane
          v-model="input"
          :label="t('tool.input')"
          :language="editorLanguage(input)"
          :placeholder="placeholder ?? t('tool.inputPlaceholder')"
        />
      </template>

      <template #right>
        <TextPane
          v-model="output"
          :label="t('tool.output')"
          :language="editorLanguage(output)"
          readonly
          :placeholder="t('tool.outputPlaceholder')"
          :error="error"
        />
      </template>
    </SplitPane>
  </div>
</template>

<style scoped>
.transform {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.action-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.spacer {
  flex: 1;
}
.btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
@media (max-width: 720px) {
  .transform {
    flex: none;
    width: 100%;
  }
}
</style>
