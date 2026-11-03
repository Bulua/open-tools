<script setup lang="ts">
import { useI18n } from "vue-i18n";
/** 文件列表标题里的全选框：全部勾选、部分勾选（半选）、都没勾选 */
defineProps<{ checked: boolean; partly: boolean; disabled?: boolean }>();
const { t } = useI18n();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <label class="check-all" :title="t('common.checkAll')">
    <input type="checkbox" :checked="checked" :indeterminate="partly" :disabled="disabled" @change="$emit('toggle')" />
    <slot />
  </label>
</template>

<style scoped>
.check-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.check-all input {
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}
</style>
