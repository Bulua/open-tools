<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { X } from "lucide-vue-next";
import { formatFileSize, type AiOutputFile } from "../outputs";
import { iconForOutputFile } from "./outputFileIcon";

defineProps<{
  files: AiOutputFile[];
}>();

const emit = defineEmits<{
  select: [fileId: string];
  close: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="outputs-card">
    <header class="outputs-card-head">
      <div class="outputs-title-row">
        <h3 class="outputs-card-title">{{ t("ai.outputs.title") }}</h3>
        <span v-if="files.length" class="count-pill">{{ t("ai.outputs.filesCount", { n: files.length }) }}</span>
      </div>
      <button
        type="button"
        class="icon-btn"
        :title="t('ai.outputs.closePanel')"
        :aria-label="t('ai.outputs.closePanel')"
        @click="emit('close')"
      >
        <X :size="15" />
      </button>
    </header>

    <div v-if="files.length" class="outputs-list">
      <button
        v-for="item in files"
        :key="item.id"
        type="button"
        class="output-item"
        :title="item.filePath"
        @click="emit('select', item.id)"
      >
        <span class="output-icon-box">
          <component :is="iconForOutputFile(item)" :size="14" />
        </span>
        <span class="output-name">{{ item.fileName }}</span>
        <span class="output-size">{{ formatFileSize(item.sizeBytes) }}</span>
      </button>
    </div>

    <div v-else class="outputs-empty">
      <p class="empty-hint">{{ t("ai.outputs.emptyHint") }}</p>
    </div>
  </div>
</template>

<style scoped>
.outputs-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
  pointer-events: auto;
}

.outputs-card-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 8px 8px 14px;
}
.outputs-title-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.outputs-card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--text);
}
.count-pill {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.outputs-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scrollbar-width: thin;
}

.output-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.output-item:hover,
.output-item:focus-visible {
  background: var(--hover);
  outline: none;
}

.output-icon-box {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--bg-sunken);
  color: var(--text-2);
  display: grid;
  place-items: center;
}

.output-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.output-size {
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.outputs-empty {
  padding: 4px 14px 14px;
}
.empty-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}
</style>
