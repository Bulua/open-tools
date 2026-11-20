import { commandsCtx, remarkCtx, serializerCtx } from "@milkdown/core";
import { addRowAfterCommand, addRowBeforeCommand, tableSchema } from "@milkdown/preset-gfm";
import { Selection } from "@milkdown/prose/state";
import type { Node } from "@milkdown/prose/model";
import { TableMap, addColumnAfter, addColumnBefore, deleteColumn, deleteRow, deleteTable, isInTable, moveTableColumn, moveTableRow, selectedRect } from "@milkdown/prose/tables";
import type { EditorView } from "@milkdown/prose/view";
import type { Ctx } from "@milkdown/ctx";
import type { Node as MarkdownNode, Position } from "unist";

// GFM 允许只有表头的表格，也允许先插入表头再逐行添加数据。
export const notebookTableSchema = tableSchema.extendSchema(previous => ctx => ({
  ...previous(ctx),
  content: "table_header_row table_row*",
}));

export const MAX_TABLE_ROWS = 100;
export const MAX_TABLE_COLUMNS = 30;

export function tableMarkdown(rows: number, columns: number) {
  const blank = `|${"  |".repeat(columns)}`;
  const separator = `|${" --- |".repeat(columns)}`;
  return [blank, separator, ...Array<string>(rows - 1).fill(blank)].join("\n");
}

export const tableActionGroups = [
  ["tableRowBefore", "tableRowAfter", "tableColumnBefore", "tableColumnAfter"],
  ["tableMoveUp", "tableMoveDown", "tableMoveLeft", "tableMoveRight"],
  ["tableDeleteRow", "tableDeleteColumn"],
  ["tableCopy", "tableFormat"],
] as const;
export type TableMenuAction = typeof tableActionGroups[number][number];
export type TableAction = Exclude<TableMenuAction, "tableCopy" | "tableFormat"> | "tableAlignLeft" | "tableAlignCenter" | "tableAlignRight" | "tableDelete";
export type TableControl = TableAction | "tableSize" | "tableMenu";

export function selectTableCell(view: EditorView, position: number, row = 0, column = 0, scroll = false) {
  const { state } = view;
  const table = state.doc.nodeAt(position);
  if (table?.type !== state.schema.nodes.table) return false;
  const cell = TableMap.get(table).positionAt(row, column, table) + position + 1;
  const selection = Selection.findFrom(state.doc.resolve(cell + 1), 1, true);
  if (!selection) return false;
  const tr = state.tr.setSelection(selection);
  view.dispatch(scroll ? tr.scrollIntoView() : tr);
  return true;
}

export function selectTable(view: EditorView, position: number) {
  return (isInTable(view.state) && selectedRect(view.state).tableStart === position + 1) || selectTableCell(view, position);
}

export function tableResizeDropsContent(table: Node, rows: number, columns: number) {
  for (let r = 0; r < table.childCount; r++) {
    const row = table.child(r);
    for (let c = 0; c < row.childCount; c++) {
      if ((r >= rows || c >= columns) && row.child(c).firstChild?.content.size) return true;
    }
  }
  return false;
}

export function resizeTable(view: EditorView, position: number, rows: number, columns: number) {
  const { state } = view;
  const table = state.doc.nodeAt(position);
  const nodes = state.schema.nodes;
  if (!table || table.type !== nodes.table || !isInTable(state)) return;
  const { top, left, map } = selectedRect(state);
  if (rows === map.height && columns === map.width) {
    view.focus();
    return;
  }

  const updatedRows = Array.from({ length: rows }, (_, r) => {
    const rowType = r ? nodes.table_row : nodes.table_header_row;
    const cellType = r ? nodes.table_cell : nodes.table_header;
    const previous = table.maybeChild(r);
    const cells = Array.from({ length: columns }, (_, c) => previous?.maybeChild(c)
      ?? cellType.createAndFill({ alignment: table.firstChild?.maybeChild(c)?.attrs.alignment })!);
    return rowType.create(previous?.attrs, cells);
  });
  const updated = table.type.create(table.attrs, updatedRows);
  const tr = state.tr.replaceWith(position, position + table.nodeSize, updated);
  const cell = TableMap.get(updated).positionAt(Math.min(top, rows - 1), Math.min(left, columns - 1), updated);
  const selection = Selection.findFrom(tr.doc.resolve(position + cell + 2), 1, true);
  if (selection) tr.setSelection(selection);
  view.dispatch(tr);
  view.focus();
}

export function tableActionEnabled(view: EditorView, action: TableMenuAction | TableAction): boolean {
  if (view.isDestroyed || !view.editable || !isInTable(view.state)) return false;
  const { top, bottom, left, right, map } = selectedRect(view.state);
  if (action === "tableDeleteRow") return bottom - top < map.height;
  if (action === "tableDeleteColumn") return right - left < map.width;
  if (action === "tableMoveUp") return bottom - top === 1 && top > 1;
  if (action === "tableMoveDown") return bottom - top === 1 && top > 0 && bottom < map.height;
  if (action === "tableMoveLeft") return right - left === 1 && left > 0;
  if (action === "tableMoveRight") return right - left === 1 && right < map.width;
  return true;
}

export function selectedTableMarkdown(ctx: Ctx, view: EditorView) {
  const { table } = selectedRect(view.state);
  const doc = view.state.schema.topNodeType.create(null, table);
  return ctx.get(serializerCtx)(doc).trimEnd();
}

export function formatSelectedTable(ctx: Ctx, view: EditorView, markdown: string): string {
  const { tableStart } = selectedRect(view.state);
  let index = 0;
  view.state.doc.nodesBetween(0, tableStart - 1, node => {
    if (node.type === view.state.schema.nodes.table) index++;
  });
  const positions: Position[] = [];
  function collect(node: MarkdownNode) {
    if (node.type === "table" && node.position) positions.push(node.position);
    if ("children" in node) (node.children as MarkdownNode[]).forEach(collect);
  }
  collect(ctx.get(remarkCtx).parse(markdown));
  const start = positions[index]?.start.offset;
  const end = positions[index]?.end.offset;
  if (start === undefined || end === undefined) return markdown;
  // 保留块引用或列表的续行前缀，只替换这张表的 Markdown。
  const line = markdown.slice(start, end).match(/\r?\n([ \t>]*)/);
  const continuation = line?.[0] ?? "\n";
  return markdown.slice(0, start) + selectedTableMarkdown(ctx, view).replace(/\n/g, continuation) + markdown.slice(end);
}

export function runTableAction(ctx: Ctx, view: EditorView, action: TableAction) {
  if (!tableActionEnabled(view, action)) return;
  const { state, dispatch } = view;
  const rect = selectedRect(state);
  const { table, tableStart, map, top, bottom, left, right } = rect;
  switch (action) {
    case "tableRowBefore": {
      if (top > 0) {
        ctx.get(commandsCtx).call(addRowBeforeCommand.key);
        break;
      }
      // 新的第一行接任表头，原表头内容作为普通行保留。
      const { table_header, table_header_row, table_cell, table_row } = state.schema.nodes;
      const header = table.firstChild!;
      const names: Node[] = [];
      const cells: Node[] = [];
      header.forEach(cell => {
        names.push(table_header.createAndFill({ alignment: cell.attrs.alignment })!);
        cells.push(table_cell.create(cell.attrs, cell.content));
      });
      const tr = state.tr.replaceWith(tableStart, tableStart + header.nodeSize,
        [table_header_row.create(header.attrs, names), table_row.create(null, cells)]);
      dispatch(tr);
      selectTableCell(view, tableStart - 1, 1, left);
      break;
    }
    case "tableRowAfter":
      ctx.get(commandsCtx).call(addRowAfterCommand.key);
      break;
    case "tableColumnBefore":
      addColumnBefore(state, dispatch);
      break;
    case "tableColumnAfter":
      addColumnAfter(state, dispatch);
      break;
    case "tableMoveUp":
    case "tableMoveDown": {
      const row = top + (action === "tableMoveUp" ? -1 : 1);
      if (moveTableRow({ from: top, to: row, select: false })(state, dispatch)) {
        selectTableCell(view, tableStart - 1, row, left);
      }
      break;
    }
    case "tableMoveLeft":
    case "tableMoveRight": {
      const column = left + (action === "tableMoveLeft" ? -1 : 1);
      if (moveTableColumn({ from: left, to: column, select: false })(state, dispatch)) {
        selectTableCell(view, tableStart - 1, top, column);
      }
      break;
    }
    case "tableDeleteRow": {
      if (top > 0) {
        deleteRow(state, dispatch);
        break;
      }
      const { table_header, table_header_row } = state.schema.nodes;
      const cells = [];
      const nextHeader = table.child(bottom);
      for (let index = 0; index < nextHeader.childCount; index++) {
        const cell = nextHeader.child(index);
        cells.push(table_header.create({ ...cell.attrs, alignment: table.firstChild?.child(index).attrs.alignment }, cell.content));
      }
      const rows = [table_header_row.create(null, cells)];
      for (let i = bottom + 1; i < table.childCount; i++) rows.push(table.child(i));
      const updated = table.type.create(table.attrs, rows);
      const tr = state.tr.replaceWith(tableStart - 1, tableStart - 1 + table.nodeSize, updated);
      dispatch(tr.setSelection(Selection.near(tr.doc.resolve(tableStart), 1)));
      break;
    }
    case "tableDeleteColumn":
      deleteColumn(state, dispatch);
      break;
    case "tableDelete":
      deleteTable(state, dispatch);
      break;
    case "tableAlignLeft":
    case "tableAlignCenter":
    case "tableAlignRight": {
      // GFM 使用表头定义整列对齐，编辑器同步应用到该列的所有单元格。
      const alignment = { tableAlignLeft: "left", tableAlignCenter: "center", tableAlignRight: "right" }[action];
      const tr = state.tr;
      for (const position of map.cellsInRect({ top: 0, bottom: map.height, left, right })) {
        if (table.nodeAt(position)?.attrs.alignment !== alignment) tr.setNodeAttribute(tableStart + position, "alignment", alignment);
      }
      if (tr.docChanged) dispatch(tr);
      break;
    }
  }
  view.focus();
}

const moveKeys: Partial<Record<string, TableAction>> = {
  ArrowUp: "tableMoveUp", ArrowDown: "tableMoveDown", ArrowLeft: "tableMoveLeft", ArrowRight: "tableMoveRight",
};

export function handleTableKeys(ctx: Ctx, view: EditorView, event: KeyboardEvent): boolean {
  if (event.isComposing || !view.editable || !isInTable(view.state)) return false;
  const move = event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey && moveKeys[event.key];
  if (move) {
    runTableAction(ctx, view, move);
    return true;
  }
  if (event.key !== "Enter" || event.shiftKey || event.altKey || event.metaKey) return false;
  const { state } = view;
  const { tableStart, table, map, bottom, left, right } = selectedRect(state);
  if (event.ctrlKey) {
    if (ctx.get(commandsCtx).call(addRowAfterCommand.key)) selectTableCell(view, tableStart - 1, bottom, 0, true);
  } else if (right < map.width && bottom < map.height) {
    selectTableCell(view, tableStart - 1, bottom, left, true);
  } else {
    const end = tableStart - 1 + table.nodeSize;
    const paragraph = state.schema.nodes.paragraph;
    const tr = state.tr;
    if (state.doc.resolve(end).nodeAfter?.type !== paragraph) tr.insert(end, paragraph.create());
    const selection = Selection.findFrom(tr.doc.resolve(end), 1, true);
    if (selection) view.dispatch(tr.setSelection(selection).scrollIntoView());
  }
  return true;
}
