<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { editorViewCtx } from "@milkdown/core";
import "@milkdown/prose/view/style/prosemirror.css";
import "@milkdown/prose/tables/style/tables.css";
import "katex/dist/katex.min.css";
import { showError } from "@/utils/errorToast";
import { makeNotebookEditor } from "../editor";

const props = defineProps<{ id: string; markdown: string }>();
const emit = defineEmits<{ edit: [id: string, markdown: string]; failed: [id: string] }>();
const { t } = useI18n();
const root = ref<HTMLElement>();
let disposed = false;
let teardown: (() => void) | undefined;
let focusEditor: (() => void) | undefined;
let focusPending = false;

function focus() {
  if (focusEditor) focusEditor();
  else focusPending = true;
}

defineExpose({ focus });

onMounted(async () => {
  const id = props.id;
  const editor = makeNotebookEditor(root.value!, props.markdown, () => t("markdown.notebook.editor"), markdown => {
    if (!disposed) emit("edit", id, markdown);
  }, () => t("markdown.notebook.task"), () => t("markdown.notebook.editFormula"));
  try {
    await editor.create();
    teardown = () => { void editor.destroy().catch(showError); };
    if (disposed) teardown();
    else {
      focusEditor = () => editor.action(ctx => ctx.get(editorViewCtx).focus());
      if (focusPending) focusEditor();
    }
  } catch (error) {
    if (!disposed) {
      showError(error);
      emit("failed", id);
    }
  }
});

onBeforeUnmount(() => {
  disposed = true;
  focusEditor = undefined;
  teardown?.();
});
</script>

<template>
  <div ref="root" class="note-editor" :class="{ empty: !markdown.trim() }" :data-placeholder="t('markdown.notebook.placeholder')" />
</template>

<style scoped>
.note-editor :deep(.ProseMirror) {
  min-height: 45vh;
  outline: none;
  color: var(--text);
  font: 16px/1.72 var(--font-sans);
  overflow-wrap: anywhere;
}
.note-editor.empty::before {
  position: absolute;
  content: attr(data-placeholder);
  color: var(--text-3);
  font: 16px/1.72 var(--font-sans);
  pointer-events: none;
}
.note-editor { position: relative; }
.note-editor :deep(.ProseMirror > :first-child) { margin-block-start: 0; }
.note-editor :deep(p) { margin: 0 0 0.9em; }
.note-editor :deep(h1), .note-editor :deep(h2), .note-editor :deep(h3),
.note-editor :deep(h4), .note-editor :deep(h5), .note-editor :deep(h6) {
  margin: 1.3em 0 0.5em;
  line-height: 1.3;
  font-weight: 600;
}
.note-editor :deep(h1) { font-size: 2em; }
.note-editor :deep(h2) { font-size: 1.5em; padding-bottom: 0.2em; border-bottom: 1px solid var(--border); }
.note-editor :deep(h3) { font-size: 1.25em; }
.note-editor :deep(h4) { font-size: 1.08em; }
.note-editor :deep(h5) { font-size: 1em; }
.note-editor :deep(h6) { color: var(--text-2); font-size: 0.92em; }
.note-editor :deep(a) { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
.note-editor :deep(blockquote) { margin: 0.9em 0; padding-inline-start: 0.95em; border-inline-start: 2px solid var(--border-strong); color: var(--text-2); }
.note-editor :deep(blockquote > :last-child), .note-editor :deep(li > :last-child) { margin-block-end: 0; }
.note-editor :deep(ul), .note-editor :deep(ol) { margin: 0.65em 0 0.9em; padding-inline-start: 1.65em; }
.note-editor :deep(li + li) { margin-block-start: 0.16em; }
.note-editor :deep(li > p), .note-editor :deep(li > ul), .note-editor :deep(li > ol) { margin-block: 0.2em; }
.note-editor :deep(li[data-item-type=task]) { position: relative; list-style: none; }
.note-editor :deep(.note-task) { position: absolute; inset-inline-start: -1.52em; top: 0.45em; margin: 0; accent-color: var(--accent); }
.note-editor :deep(hr) { border: 0; border-top: 1px solid var(--border); margin: 1.65em 0; }
.note-editor :deep(code) { font: 0.88em/1.6 var(--font-mono); background: var(--hover); padding-inline: 0.22em; }
.note-editor :deep(pre) { margin: 1em 0 1.2em; padding: 0.7em 0.95em; overflow: auto; white-space: pre; background: var(--bg-sunken); font: 0.88em/1.6 var(--font-mono); }
.note-editor :deep(pre code) { background: none; padding: 0; font: inherit; }
.note-editor :deep(pre[data-frontmatter]) { background: none; border-block: 1px solid var(--border); color: var(--text-2); padding-inline: 0; }
.note-editor :deep(img) { max-width: 100%; height: auto; }
.note-editor :deep(.tableWrapper) { overflow-x: auto; }
.note-editor :deep(table) { width: 100%; border-collapse: collapse; margin-block: 0.85em 1.1em; }
.note-editor :deep(th), .note-editor :deep(td) { border: 0; border-bottom: 1px solid var(--border); min-width: 5rem; padding: 0.32em 0.65em; vertical-align: top; }
.note-editor :deep(th) { border-bottom-color: var(--border-strong); text-align: start; font-weight: 600; }
.note-editor :deep(td > :last-child), .note-editor :deep(th > :last-child) { margin-block-end: 0; }
.note-editor :deep(.selectedCell::after) { background: var(--accent-soft); }
.note-editor :deep(mark) { color: inherit; background: var(--warning-soft); box-shadow: inset 0 -2px var(--warning-soft); }
.note-editor :deep(sup), .note-editor :deep(sub) { line-height: 0; }
.note-editor :deep(sup[data-type=footnote_reference]) { color: var(--accent); cursor: pointer; padding-inline: 0.15em; }
.note-editor :deep(dl[data-type=footnote_definition]) { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.7em; margin: 0; padding: 0.4em 0; border-top: 1px solid var(--border); color: var(--text-2); font-size: 0.9em; }
.note-editor :deep(dl[data-type=footnote_definition] dd) { margin: 0; }
.note-editor :deep(dl[data-type=footnote_definition] dd > :last-child) { margin-block-end: 0; }
.note-editor :deep(nav[data-notebook-toc]) { margin: 1em 0; padding-inline-start: 0.9em; border-inline-start: 2px solid var(--border); font-size: 0.92em; }
.note-editor :deep(nav[data-notebook-toc] ul) { list-style: none; margin: 0; padding: 0; }
.note-editor :deep(nav[data-notebook-toc] a) { color: var(--text-2); text-decoration: none; }
.note-editor :deep(nav[data-notebook-toc] a:hover) { color: var(--accent); text-decoration: underline; }
.note-editor :deep(.note-math) { cursor: text; }
.note-editor :deep(.math-block) { overflow-x: auto; margin-block: 0.85em; }
.note-editor :deep(.math-block .katex-display) { margin-block: 0.45em; }
.note-editor :deep(.note-math input), .note-editor :deep(.note-math textarea) { max-width: 100%; border: 0; border-bottom: 1px solid var(--accent); border-radius: 0; background: var(--surface); color: var(--text); font: 0.9em/1.6 var(--font-mono); }
.note-editor :deep(.note-math textarea) { display: block; width: 100%; min-height: 4em; }
.note-editor :deep(.note-math [hidden]) { display: none; }
.note-editor :deep(.hljs-comment), .note-editor :deep(.hljs-quote), .note-editor :deep(.hljs-meta) { color: var(--text-3); }
.note-editor :deep(.hljs-keyword), .note-editor :deep(.hljs-built_in), .note-editor :deep(.hljs-selector-tag) { color: var(--syntax-literal); }
.note-editor :deep(.hljs-string), .note-editor :deep(.hljs-regexp), .note-editor :deep(.hljs-addition) { color: var(--syntax-string); }
.note-editor :deep(.hljs-number), .note-editor :deep(.hljs-literal), .note-editor :deep(.hljs-variable), .note-editor :deep(.hljs-type) { color: var(--syntax-number); }
.note-editor :deep(.hljs-title), .note-editor :deep(.hljs-attr), .note-editor :deep(.hljs-property), .note-editor :deep(.hljs-name) { color: var(--syntax-key); }
.note-editor :deep(.hljs-deletion) { color: var(--danger); }
</style>
