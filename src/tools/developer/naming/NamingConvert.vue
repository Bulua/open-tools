<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { locale, translationIn } from "@/locales";
import TextPane from "@/components/common/TextPane.vue";
import CopyList from "@/components/common/CopyList.vue";
import { NAMING_STYLES, convertLines } from "./transforms";
import { NAMING_NAMES } from "./names";

/** 变量名命名风格转换：输入任意写法，一次显示驼峰、下划线、短横线等所有风格；多行逐行转换 */
const { t } = useI18n();
const input = ref("");

const items = computed(() =>
  NAMING_STYLES.map((s) => ({
    label: translationIn(NAMING_NAMES, locale.value, s.example) ?? s.label,
    value: input.value.trim() ? convertLines(input.value, s.convert) : "",
    placeholder: s.example,
  })),
);

useToolResult(() => input.value.trim());
</script>

<template>
  <div class="naming">
    <TextPane v-model="input" class="input" :label="t('convert.original')" :placeholder="t('convert.namingPlaceholder')" />
    <section class="card result">
      <div class="card-title">{{ t("convert.result") }}</div>
      <CopyList :items="items" />
    </section>
  </div>
</template>

<style scoped>
.naming {
  flex: 1;
  display: flex;
  gap: 14px;
  min-height: 0;
}
.input {
  flex: 0 0 420px;
}
.result {
  flex: 1;
  min-width: 0;
  overflow: auto;
}
@media (max-width: 1100px) {
  .naming {
    flex-direction: column;
  }
  .input {
    flex: 0 0 160px;
  }
}
</style>
