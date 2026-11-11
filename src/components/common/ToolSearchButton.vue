<script setup lang="ts">
import { Search } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
const { t } = useI18n();
defineEmits<{ search: [] }>();
</script>

<template>
  <button class="tool-search-button" @click="$emit('search')">
    <Search :size="14" /><span>{{ t('header.search') }}</span><kbd>Ctrl K</kbd>
  </button>
</template>

<style scoped>
.tool-search-button {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  width: var(--tool-search-width);
  max-width: 100%;
  height: 32px;
  padding: 0 6px 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-3);
  font-size: 13px;
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.tool-search-button span {
  flex: 1;
  min-width: 0;
  text-align: start;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tool-search-button svg, kbd {
  flex-shrink: 0;
}
.tool-search-button svg {
  transition: transform var(--dur) var(--ease-out);
}
.tool-search-button:hover {
  border-color: var(--border-strong);
  color: var(--text-2);
  background: var(--surface);
}
.tool-search-button:hover svg {
  transform: scale(1.12);
}
.tool-search-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>
