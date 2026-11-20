<script setup lang="ts">
import { ref, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS } from "../tables";

const props = defineProps<{ rows: number; columns: number; action: string }>();
const emit = defineEmits<{ choose: [rows: number, columns: number] }>();
const { t } = useI18n();
const rows = ref<number | string>(props.rows);
const columns = ref<number | string>(props.columns);
const grid = ref<HTMLElement>();
const visualRows = 8;
const visualColumns = 8;
const cursor = ref({ row: Math.min(props.rows, visualRows), column: Math.min(props.columns, visualColumns) });

function preview(row: number, column: number) {
  cursor.value = { row, column };
  rows.value = row;
  columns.value = column;
}

function submit() {
  const row = Number(rows.value);
  const col = Number(columns.value);
  if (Number.isInteger(row) && row >= 1 && row <= MAX_TABLE_ROWS && Number.isInteger(col) && col >= 1 && col <= MAX_TABLE_COLUMNS) emit("choose", row, col);
}

function focusCell() {
  void nextTick(() => grid.value?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus({ preventScroll: true }));
}

function move(event: KeyboardEvent, row: number, column: number) {
  const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
  if (!delta) return;
  event.preventDefault();
  preview(Math.max(1, Math.min(visualRows, row + delta[0])), Math.max(1, Math.min(visualColumns, column + delta[1])));
  focusCell();
}

defineExpose({ focusCell });
</script>

<template>
  <form class="table-size-controls" @submit.prevent="submit">
    <div ref="grid" class="table-size-grid" role="group" :aria-label="t('markdown.notebook.tableDimensions')">
      <template v-for="row in visualRows" :key="row">
        <button v-for="column in visualColumns" :key="column" type="button" class="table-size-cell"
          :class="{ preview: row <= Number(rows) && column <= Number(columns) }"
          :tabindex="row === cursor.row && column === cursor.column ? 0 : -1"
          :data-rows="row" :data-columns="column" :aria-label="t('markdown.notebook.tableGridCell', { row, column })"
          @pointerenter="preview(row, column)" @keydown="move($event, row, column)" @click="emit('choose', row, column)" />
      </template>
    </div>
    <div class="table-size-fields">
      <label>{{ t("markdown.notebook.tableRows") }}
        <input v-model.number="rows" class="field" type="number" min="1" :max="MAX_TABLE_ROWS" step="1" required />
      </label>
      <label>{{ t("markdown.notebook.tableColumns") }}
        <input v-model.number="columns" class="field" type="number" min="1" :max="MAX_TABLE_COLUMNS" step="1" required />
      </label>
    </div>
    <button type="submit" class="btn small primary">{{ action }}</button>
  </form>
</template>

<style scoped>
.table-size-controls { display: grid; gap: 9px; }
.table-size-grid { display: grid; grid-template-columns: repeat(8, 20px); justify-content: center; gap: 3px; }
.table-size-cell { width: 20px; height: 20px; padding: 0; border: 1px solid var(--border-strong); border-radius: 3px; background: var(--surface); }
.table-size-cell.preview { border-color: var(--accent); background: var(--accent-soft); }
.table-size-fields { display: flex; justify-content: space-between; gap: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
.table-size-fields label { display: grid; justify-items: start; gap: 4px; font-size: 12px; }
.table-size-fields input { width: 4rem; height: 28px; }
.table-size-controls > .btn { justify-self: end; }
</style>
