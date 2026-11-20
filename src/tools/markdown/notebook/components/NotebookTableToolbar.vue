<script setup lang="ts">
import { AlignCenter, AlignLeft, AlignRight, Grid2X2, MoreVertical, Trash2 } from "lucide-vue-next";
import { t } from "@/locales";
import type { TableControl } from "../tables";

const emit = defineEmits<{ action: [tool: TableControl, trigger: HTMLElement] }>();
const groups = [
  [
    { key: "tableSize", icon: Grid2X2, popup: "dialog" },
    { key: "tableAlignLeft", icon: AlignLeft },
    { key: "tableAlignCenter", icon: AlignCenter },
    { key: "tableAlignRight", icon: AlignRight },
  ],
  [
    { key: "tableMenu", icon: MoreVertical, popup: "menu" },
    { key: "tableDelete", icon: Trash2 },
  ],
] as const;
</script>

<template>
  <div class="notebook-table-toolbar" role="group" :aria-label="t('markdown.notebook.editTable')">
    <div v-for="group in groups" :key="group[0].key" class="table-tool-group">
      <button v-for="tool in group" :key="tool.key" type="button" class="icon-btn" :data-table-tool="tool.key"
        :aria-label="t(`markdown.notebook.${tool.key}`)" :title="t(`markdown.notebook.${tool.key}`)"
        :aria-haspopup="'popup' in tool ? tool.popup : undefined"
        @mousedown.prevent @click="emit('action', tool.key, $event.currentTarget as HTMLElement)">
        <component :is="tool.icon" :size="15" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.notebook-table-toolbar {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 4px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  pointer-events: none;
}
.table-tool-group { display: flex; gap: 2px; background: var(--surface); pointer-events: auto; }
[data-table-tool="tableDelete"]:hover { color: var(--danger); }
</style>
