<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Compartment, EditorState, type ChangeSet } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyField, undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
import type { ViewportAnchor } from "../types";
import { editorTheme } from "@/components/common/codeEditorTheme";

const props = defineProps<{ text: string; firstLine: number; readonly: boolean; canNext?: boolean; canPrevious?: boolean; loading?: boolean; scrollLoading?: boolean; generation?: number; savedState?: Record<string, unknown> }>();
const emit = defineEmits<{ change: [text: string, changes: ChangeSet]; save: []; history: [redo: boolean]; limit: []; cursor: [line: number, column: number]; depths: [undo: number, redo: number]; boundary: [direction: "next" | "previous"]; scrollIntent: [pixels: number]; retain: [generation: number, json: Record<string, unknown>, viewport: ViewportAnchor | undefined] }>();
const host = ref<HTMLDivElement>();
const editable = new Compartment();
let view: EditorView | undefined;
let boundaryPending = false;
let previousTop = 0;
let userScroll = false;
// 由用户的滚动方向触发相邻块读取；选区会随视口一起恢复，不能阻止加载。
const atBoundary = (direction: "next" | "previous", reach = 24, beforeLoad?: () => void) => {
  if (!view || props.loading || boundaryPending) return false;
  const scroller = view.scrollDOM;
  if (direction === "next" ? !props.canNext || scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - reach : !props.canPrevious || scroller.scrollTop > reach) return false;
  boundaryPending = true;
  beforeLoad?.();
  emit("boundary", direction);
  return true;
};
const wheel = (event: WheelEvent) => {
  if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  userScroll = true;
  if (!view) return;
  const pixels = event.deltaY * (event.deltaMode === 1 ? 22 : event.deltaMode === 2 ? view.scrollDOM.clientHeight : 1);
  if (boundaryPending || props.scrollLoading) { emit("scrollIntent", pixels); event.preventDefault(); return; }
  const direction = pixels > 0 ? "next" : "previous";
  if (atBoundary(direction, Math.abs(pixels) + 24, () => emit("scrollIntent", pixels))) event.preventDefault();
};
const markScroll = () => { userScroll = true; };
const keyScroll = (event: KeyboardEvent) => {
  if (!["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) return;
  userScroll = true;
  if ((event.key === "ArrowUp" || event.key === "PageUp") && atBoundary("previous")
    || (event.key === "ArrowDown" || event.key === "PageDown") && atBoundary("next")) event.preventDefault();
};
const scrolled = () => {
  if (!view) return;
  const top = view.scrollDOM.scrollTop;
  if (userScroll && top > previousTop) atBoundary("next");
  if (userScroll && top < previousTop) atBoundary("previous");
  previousTop = top;
};
const localHistory = (forward: boolean) => view && !props.readonly ? (forward ? redo(view) : undo(view)) : false;
const historyKey = (forward: boolean) => { if (props.readonly) return true; if (!localHistory(forward)) emit("history", forward); return true; };
const cancelMeasures = new Set<() => void>();
/** 读取结束后等待实际布局完成，组件销毁时取消旧视图的测量。 */
const measure = <T,>(read: (current: EditorView) => T, write: (value: T, current: EditorView) => void): Promise<void> => {
  const current = view;
  if (!current) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cancel = () => { cancelMeasures.delete(cancel); resolve(); };
    cancelMeasures.add(cancel);
    current.requestMeasure({
      read: (editor) => {
        if (view !== current) return undefined;
        try { return { value: read(editor) }; }
        catch (error) { cancelMeasures.delete(cancel); reject(error); return undefined; }
      },
      write: (result, editor) => {
        try { if (result && view === current) write(result.value, editor); cancel(); }
        catch (error) { cancelMeasures.delete(cancel); reject(error); }
      },
    });
  });
};
const snapshot = (): ViewportAnchor | undefined => {
  if (!view) return undefined;
  const top = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
  const line = view.lineBlockAtHeight(Math.max(0, top));
  return { position: line.from, offset: line.top - top, left: view.scrollDOM.scrollLeft, anchor: view.state.selection.main.anchor, head: view.state.selection.main.head, focused: view.hasFocus };
};
onMounted(() => {
  const extensions = [
    editorTheme,
    lineNumbers({ formatNumber: (n) => String(props.firstLine + n - 1) }), drawSelection(), highlightActiveLine(), history(),
    editable.of([EditorState.readOnly.of(props.readonly), EditorView.editable.of(!props.readonly)]),
    EditorState.transactionFilter.of((transaction) => { if (transaction.docChanged && props.readonly) return []; if (transaction.docChanged && transaction.newDoc.length > 1024 * 1024) { emit("limit"); return []; } return transaction; }),
    keymap.of([
      { key: "Mod-s", run: () => { emit("save"); return true; } },
      { key: "Mod-z", run: () => historyKey(false) }, { key: "Mod-Shift-z", run: () => historyKey(true) }, { key: "Mod-y", run: () => historyKey(true) },
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) emit("change", update.state.doc.toString(), update.changes);
      if (update.docChanged || update.selectionSet) {
        const head = update.state.selection.main.head; const line = update.state.doc.lineAt(head);
        emit("cursor", props.firstLine + line.number - 1, head - line.from + 1);
        emit("depths", undoDepth(update.state), redoDepth(update.state));
      }
    }),
  ];
  const state = props.savedState ? EditorState.fromJSON(props.savedState, { extensions }, { history: historyField }) : EditorState.create({ doc: props.text, extensions });
  view = new EditorView({ parent: host.value!, state });
  // 监听整个滚动容器，包含正文、行号和空白区域；不用只覆盖正文的编辑器事件。
  view.scrollDOM.addEventListener("wheel", wheel, { passive: false });
  view.scrollDOM.addEventListener("pointerdown", markScroll);
  view.scrollDOM.addEventListener("keydown", keyScroll);
  view.scrollDOM.addEventListener("scroll", scrolled);
  emit("depths", undoDepth(view.state), redoDepth(view.state));
  const head = view.state.selection.main.head; const line = view.state.doc.lineAt(head);
  emit("cursor", props.firstLine + line.number - 1, head - line.from + 1);
});
// 编辑块在父组件按文件版本重建；仅只读状态需要原地更新，不能在保存时销毁当前草稿。
watch(() => props.readonly, (value) => view?.dispatch({ effects: editable.reconfigure([EditorState.readOnly.of(value), EditorView.editable.of(!value)]) }));
onBeforeUnmount(() => {
  for (const cancel of [...cancelMeasures]) cancel();
  try {
    if (view) emit("retain", props.generation ?? 0, view.state.toJSON({ history: historyField }), snapshot());
  } finally {
    view?.scrollDOM.removeEventListener("wheel", wheel);
    view?.scrollDOM.removeEventListener("pointerdown", markScroll);
    view?.scrollDOM.removeEventListener("keydown", keyScroll);
    view?.scrollDOM.removeEventListener("scroll", scrolled);
    view?.destroy(); view = undefined;
  }
});

defineExpose({
  history: localHistory,
  remeasure() { view?.requestMeasure(); },
  releaseBoundary() { boundaryPending = false; },
  snapshot,
  restore(anchor: { position: number; offset: number; left: number; anchor: number; head: number; focused?: boolean }, shift: number) {
    if (!view) return;
    userScroll = false;
    const clamp = (position: number) => Math.max(0, Math.min(view!.state.doc.length, position + shift));
    const position = clamp(anchor.position);
    view.dispatch({ selection: { anchor: clamp(anchor.anchor), head: clamp(anchor.head) } });
    if (anchor.focused) view.focus();
    return measure((current) => {
      const top = current.scrollDOM.getBoundingClientRect().top - current.documentTop;
      return current.lineBlockAt(position).top - top - anchor.offset;
    }, (delta, current) => {
      current.scrollDOM.scrollTop += delta;
      current.scrollDOM.scrollLeft = anchor.left;
      previousTop = current.scrollDOM.scrollTop;
    });
  },
  async scrollBy(pixels: number): Promise<number> {
    if (!view || !pixels) return 0;
    let remaining = 0;
    userScroll = false;
    await measure((current) => {
      const scroller = current.scrollDOM, before = scroller.scrollTop;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const target = Math.max(0, Math.min(max, before + pixels));
      // 超长单行没有纵向滚动空间，不因同一次手势读完整个文件。
      remaining = max > 0 ? pixels - (target - before) : 0;
      return target;
    }, (top, current) => {
      current.scrollDOM.scrollTop = top; previousTop = top;
    });
    return remaining;
  },
  select(length: number, focus = true) { if (!view) return; const end = Math.min(length, view.state.doc.length); view.dispatch({ selection: { anchor: 0, head: end }, effects: EditorView.scrollIntoView(0) }); if (focus) view.focus(); },
});
</script>

<template><div ref="host" class="chunk-editor" /></template>

<style scoped>
.chunk-editor { flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.chunk-editor :deep(.cm-editor) { height: 100%; }
.chunk-editor :deep(.cm-lineNumbers .cm-gutterElement) { padding-right: 8px; }
.chunk-editor :deep(.cm-line) { padding-left: 12px; }
.chunk-editor :deep(.cm-scroller) { overflow: auto; font-family: var(--font-mono); }
</style>
