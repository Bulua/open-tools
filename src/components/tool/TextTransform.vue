<script setup lang="ts">
import { ref } from "vue";
import { ArrowDownUp } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import type { ToolAction } from "@/tools/types";
import TextPane from "@/components/common/TextPane.vue";

/**
 * 通用「输入 → 操作 → 输出」工具界面。
 * 只需在工具定义里提供 actions，就能得到一个完整的文本转换工具。
 */
defineProps<{ actions: ToolAction[]; placeholder?: string }>();

const { t } = useI18n();
const input = ref("");
const output = ref("");
const error = ref("");

const run = async (action: ToolAction) => {
  error.value = "";
  try {
    output.value = await action.run(input.value);
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
    <TextPane v-model="input" :label="t('tool.input')" :placeholder="placeholder ?? t('tool.inputPlaceholder')" />

    <div class="toolbar">
      <button
        v-for="a in actions"
        :key="a.label"
        class="btn"
        :class="{ primary: a.primary }"
        @click="run(a)"
      >
        {{ a.label }}
      </button>
      <span class="spacer" />
      <button class="btn subtle" :title="t('tool.swapTitle')" @click="swap">
        <ArrowDownUp :size="14" />
        {{ t("tool.swap") }}
      </button>
    </div>

    <TextPane v-model="output" :label="t('tool.output')" readonly :placeholder="t('tool.outputPlaceholder')" :error="error" />
  </div>
</template>

<style scoped>
.transform {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}
</style>
