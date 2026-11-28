<script setup lang="ts">
import { Plus, Trash2 } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

defineProps<{
  label: string;
  addLabel: string;
  keyLabel?: string;
  valueLabel?: string;
  keyExample?: string;
  valueExample?: string;
  keepRow?: boolean;
}>();
const rows = defineModel<string[][]>({ required: true });
const { t } = useI18n();

function add() {
  rows.value = [...rows.value, []];
}

function remove(index: number, keepRow: boolean) {
  rows.value = keepRow && rows.value.length === 1
    ? [[]]
    : rows.value.filter((_, position) => position !== index);
}
</script>

<template>
  <fieldset class="config-rows">
    <legend>{{ label }}</legend>
    <div v-for="(row, index) in rows" :key="index" class="entry">
      <input
        v-if="keyLabel"
        v-model="row[0]"
        class="field line-field small-text"
        :aria-label="keyLabel"
        :placeholder="keyExample || keyLabel"
        spellcheck="false"
        autocomplete="off"
      />
      <input
        v-model="row[keyLabel ? 1 : 0]"
        class="field line-field small-text"
        :aria-label="valueLabel || label"
        :placeholder="valueExample || valueLabel"
        spellcheck="false"
        autocomplete="off"
      />
      <button
        type="button"
        class="icon-btn delete"
        :title="t('network.mcp.removeRow', { index: index + 1 })"
        :aria-label="t('network.mcp.removeRow', { index: index + 1 })"
        @click="remove(index, keepRow ?? false)"
      >
        <Trash2 :size="14" aria-hidden="true" />
      </button>
    </div>
    <button type="button" class="btn add-row" @click="add">
      <Plus :size="14" aria-hidden="true" />{{ addLabel }}
    </button>
  </fieldset>
</template>

<style scoped>
.config-rows { display: grid; gap: 8px; min-inline-size: 0; border: 0; margin: 0; padding: 0; }
legend { padding: 0; margin-bottom: 5px; color: var(--text); font-size: 13px; font-weight: 500; }
.entry { display: flex; align-items: center; gap: 14px; }
.entry .field { flex: 1; min-width: 0; width: 0; }
.delete:hover { color: var(--danger); }
.add-row {
  justify-self: center;
  justify-content: center;
  width: min(100%, 280px);
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: var(--bg-sunken);
}
.add-row:hover { background: var(--active); }
.add-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
