<script setup lang="ts">
import { computed, ref } from "vue";
import TextPane from "@/components/common/TextPane.vue";
import CopyList from "@/components/common/CopyList.vue";
import { NAMING_STYLES, convertLines } from "../transforms";

/** 变量名命名风格转换：输入任意写法，一次显示驼峰、下划线、短横线等所有风格；多行逐行转换 */
const input = ref("");

const items = computed(() =>
  NAMING_STYLES.map((s) => ({
    label: s.label,
    value: input.value.trim() ? convertLines(input.value, s.convert) : "",
    placeholder: s.example,
  })),
);
</script>

<template>
  <div class="naming">
    <TextPane v-model="input" class="input" label="原文" placeholder="输入变量名，例如 user_name 或 userName；多行会逐行转换" />
    <section class="card sunken result">
      <div class="card-title">结果</div>
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
