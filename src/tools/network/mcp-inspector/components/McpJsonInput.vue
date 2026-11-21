<script setup lang="ts">
import { defineAsyncComponent, useId } from "vue";

defineProps<{ label: string; placeholder?: string; hideLabel?: boolean }>();
const value = defineModel<string>({ required: true });
const labelId = useId();
const CodeEditor = defineAsyncComponent(() => import("@/components/common/CodeEditor.vue"));
</script>

<template>
  <section class="mcp-json-input">
    <span :id="labelId" :class="hideLabel ? 'json-label-hidden' : 'json-label'">{{ label }}</span>
    <CodeEditor v-model="value" :labelled-by="labelId" :placeholder="placeholder" language="json" hide-fold-gutter wrap />
  </section>
</template>

<style scoped>
.mcp-json-input {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--surface);
}
.json-label {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-height: 38px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
}
.json-label-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
