<script setup lang="ts">
import { nextTick, onBeforeUnmount, onDeactivated, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { editorViewCtx, type Editor } from "@milkdown/core";
import { Selection } from "@milkdown/prose/state";
import { isInTable, selectedRect, TableMap } from "@milkdown/prose/tables";
import { showError } from "@/utils/errorToast";
import { closePanelDialog, vPanelDismiss } from "@/utils/panelDialog";
import { usePopover } from "@/composables/usePopover";
import { useClipboard } from "@/composables/useClipboard";
import {
  formatSelectedTable, resizeTable, runTableAction, selectedTableMarkdown, selectTable,
  tableActionEnabled, tableActionGroups, tableResizeDropsContent,
  type TableAction, type TableControl, type TableMenuAction,
} from "../tables";
import NotebookTableGrid from "./NotebookTableGrid.vue";

const props = defineProps<{ editor?: Editor; markdown: string }>();
const emit = defineEmits<{ edit: [markdown: string] }>();
const { t } = useI18n();
let disposed = false;
const tableAnchor = ref<HTMLElement>();
const tablePanel = ref<HTMLElement>();
const tablePosition = ref({ left: "0px", top: "0px" });
const enabledTableActions = shallowRef(new Set<TableMenuAction>());
const { copy } = useClipboard();
const { open: tableMenuOpen, style: tableMenuStyle, show: showTableMenu, close: closeTableMenu } =
  usePopover(tableAnchor, tablePanel, { minWidth: 192, maxHeight: 360, side: "left", ignoreEscape: () => true });
const tableSizeTrigger = shallowRef<HTMLElement>();
const tableSizePanel = ref<HTMLElement>();
const tableGrid = ref<InstanceType<typeof NotebookTableGrid>>();
const tableSize = ref({ rows: 1, columns: 1 });
let tablePositionGetter: (() => number | undefined) | undefined;
const { open: tableSizeOpen, style: tableSizeStyle, show: showTableSize, close: closeTableSize } =
  usePopover(tableSizeTrigger, tableSizePanel, { minWidth: 218, maxHeight: 284, ignoreEscape: () => true });
const resizeConfirm = ref<HTMLDialogElement>();
let pendingResize: (() => void) | undefined;
const tableShortcuts: Partial<Record<TableMenuAction, string>> = {
  tableRowAfter: "Ctrl+Enter", tableMoveUp: "Alt+↑", tableMoveDown: "Alt+↓",
  tableMoveLeft: "Alt+←", tableMoveRight: "Alt+→",
};

async function openTableMenu(x: number, y: number) {
  const actions = props.editor?.action(ctx => {
    const view = ctx.get(editorViewCtx);
    return tableActionGroups.flat().filter(action => tableActionEnabled(view, action));
  });
  if (!actions?.length) return;
  closeTableMenu();
  enabledTableActions.value = new Set(actions);
  tablePosition.value = { left: `${x}px`, top: `${y}px` };
  await nextTick();
  if (disposed) return;
  await showTableMenu();
  tablePanel.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
}

function confirmTableResize() {
  const action = pendingResize;
  closePanelDialog(resizeConfirm.value);
  action?.();
}

function closeResizeConfirmation() {
  pendingResize = undefined;
  focusEditor();
}

function runTableControl(tool: TableControl, trigger: HTMLElement, getPosition: () => number | undefined) {
  if (tool === "tableSize" && tableSizeOpen.value && tableSizeTrigger.value === trigger) {
    closeTableSize();
    return;
  }
  const info = props.editor?.action(ctx => {
    const view = ctx.get(editorViewCtx);
    const pos = getPosition();
    if (pos === undefined || !selectTable(view, pos)) return;
    return selectedRect(view.state).map;
  });
  if (!info) return;

  if (tool === "tableSize") {
    closeTableMenu();
    closeTableSize();
    tableSizeTrigger.value = trigger;
    tableSize.value = { rows: info.height, columns: info.width };
    tablePositionGetter = getPosition;
    void showTableSize().then(() => tableGrid.value?.focusCell());
  } else if (tool === "tableMenu") {
    closeTableSize();
    const { left, top } = trigger.getBoundingClientRect();
    void openTableMenu(left, top);
  } else {
    closeTableSize();
    applyTableAction(tool);
  }
}

function applyTableSize(rows: number, columns: number) {
  const getPosition = tablePositionGetter;
  closeTableSize();
  props.editor?.action(ctx => {
    const view = ctx.get(editorViewCtx);
    const pos = getPosition?.();
    const table = pos !== undefined ? view.state.doc.nodeAt(pos) : null;
    if (table?.type.name !== "table" || pos === undefined) return;
    const { height, width } = TableMap.get(table);
    const apply = () => {
      const currentPos = getPosition?.();
      if (currentPos !== undefined && selectTable(view, currentPos)) resizeTable(view, currentPos, rows, columns);
    };
    if ((rows < height || columns < width) && tableResizeDropsContent(table, rows, columns)) {
      pendingResize = apply;
      resizeConfirm.value?.showModal();
    } else apply();
  });
}

function openCellMenu(event: MouseEvent) {
  if (event.defaultPrevented || !(event.target instanceof Element)) return;
  const cell = event.target.closest("td, th");
  if (!cell) return;
  const selected = props.editor?.action(ctx => {
    const view = ctx.get(editorViewCtx);
    if (!view.editable || !view.dom.contains(cell)) return false;
    const position = view.state.doc.resolve(view.posAtDOM(cell, 0));
    const selection = Selection.findFrom(position, 1, true);
    if (!selection) return false;
    view.dispatch(view.state.tr.setSelection(selection));
    return isInTable(view.state);
  });
  if (!selected) return;
  event.preventDefault();
  void openTableMenu(event.clientX, event.clientY);
}

function applyTableAction(action: TableMenuAction | TableAction) {
  closeTableMenu();
  props.editor?.action(ctx => {
    const view = ctx.get(editorViewCtx);
    if (!isInTable(view.state)) return;
    if (action === "tableCopy") {
      void copy(selectedTableMarkdown(ctx, view)).catch(showError);
      view.focus();
    } else if (action === "tableFormat") {
      const markdown = formatSelectedTable(ctx, view, props.markdown);
      if (markdown !== props.markdown) emit("edit", markdown);
      view.focus();
    } else runTableAction(ctx, view, action);
  });
}

function tableMenuKey(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeTableMenu();
    focusEditor();
  } else if (event.key === "Tab") {
    closeTableMenu();
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    const buttons = [...(tablePanel.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
}

function focusEditor() {
  props.editor?.action(ctx => ctx.get(editorViewCtx).focus());
}

defineExpose({ runTableControl, openCellMenu });
onDeactivated(() => {
  closeTableMenu();
  closeTableSize();
  closePanelDialog(resizeConfirm.value, true);
});
onBeforeUnmount(() => { disposed = true; });
</script>

<template>
  <Teleport to="body">
    <span ref="tableAnchor" class="menu-anchor" :style="tablePosition" aria-hidden="true" />
    <Transition name="pop">
      <div v-if="tableMenuOpen" ref="tablePanel" class="table-menu" :style="tableMenuStyle"
        role="menu" :aria-label="t('markdown.notebook.editTable')" @keydown="tableMenuKey">
        <div v-for="group in tableActionGroups" :key="group[0]" class="table-menu-group" role="group">
          <button v-for="action in group" :key="action" class="btn small subtle" type="button" role="menuitem"
            :disabled="!enabledTableActions.has(action)" @click="applyTableAction(action)">
            <span>{{ t(`markdown.notebook.${action}`) }}</span>
            <kbd v-if="tableShortcuts[action]">{{ tableShortcuts[action] }}</kbd>
          </button>
        </div>
      </div>
    </Transition>
    <Transition name="pop">
      <div v-if="tableSizeOpen" ref="tableSizePanel" class="table-size-panel" :style="tableSizeStyle"
        role="dialog" :aria-label="t('markdown.notebook.tableSize')" @keydown.esc.stop.prevent="closeTableSize(); focusEditor()">
        <NotebookTableGrid ref="tableGrid" :rows="tableSize.rows" :columns="tableSize.columns"
          :action="t('markdown.notebook.imageApply')" @choose="applyTableSize" />
      </div>
    </Transition>
    <dialog v-panel-dismiss ref="resizeConfirm" class="table-resize-confirm panel-dialog" :aria-label="t('markdown.notebook.tableSize')"
      @cancel.prevent="closePanelDialog(resizeConfirm)" @close="closeResizeConfirmation">
      <form @submit.prevent="confirmTableResize">
        <p>{{ t("markdown.notebook.tableResizeConfirm") }}</p>
        <div>
          <button class="btn small" type="button" autofocus @click="closePanelDialog(resizeConfirm)">{{ t("markdown.notebook.cancel") }}</button>
          <button class="btn small primary" type="submit">{{ t("markdown.notebook.confirm") }}</button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.menu-anchor { position: fixed; pointer-events: none; }
.table-menu, .table-size-panel {
  position: fixed;
  z-index: 300;
  display: grid;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lg);
}
.table-menu { gap: 4px; padding: 4px; }
.table-menu-group { display: grid; }
.table-menu-group + .table-menu-group { border-top: 1px solid var(--border); padding-top: 4px; }
.table-menu .btn { justify-content: space-between; text-align: start; }
.table-menu kbd { color: var(--text-3); font: inherit; font-size: 11px; }
.table-size-panel { max-height: calc(100vh - 16px); overflow: auto; }
.table-resize-confirm { width: min(360px, calc(100% - 32px)); padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); box-shadow: var(--shadow-lg); }
.table-resize-confirm::backdrop { background: var(--modal-scrim); }
.table-resize-confirm p { margin: 0 0 14px; }
.table-resize-confirm form > div { display: flex; justify-content: flex-end; gap: 8px; }
</style>
