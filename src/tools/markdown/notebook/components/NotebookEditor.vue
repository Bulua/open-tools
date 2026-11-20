<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { editorViewCtx, parserCtx, type Editor } from "@milkdown/core";
import "@milkdown/prose/view/style/prosemirror.css";
import "@milkdown/prose/tables/style/tables.css";
import "katex/dist/katex.min.css";
import { showError } from "@/utils/errorToast";
import { prefersReducedMotion } from "@/utils/motion";
import { insertNotebookBlock, makeNotebookEditor } from "../editor";
import NotebookImageControls from "./NotebookImageControls.vue";
import NotebookTableControls from "./NotebookTableControls.vue";

const props = defineProps<{ id: string; markdown: string }>();
const emit = defineEmits<{ edit: [id: string, markdown: string]; failed: [id: string] }>();
const { t } = useI18n();
const root = ref<HTMLElement>();
let disposed = false;
let teardown: (() => void) | undefined;
let focusEditor: (() => void) | undefined;
let afterFocus: (() => void) | undefined;
let insert: ((markdown: string) => void) | undefined;
const activeEditor = shallowRef<Editor>();
const imageControls = ref<InstanceType<typeof NotebookImageControls>>();
const tableControls = ref<InstanceType<typeof NotebookTableControls>>();

function focus(restoreScroll: () => void) {
  if (!focusEditor) {
    afterFocus = restoreScroll;
    return;
  }
  focusEditor();
  restoreScroll();
}

function scrollToHeading(index: number) {
  root.value?.querySelectorAll(".ProseMirror :is(h1, h2, h3, h4, h5, h6)")[index]
    ?.scrollIntoView?.({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

defineExpose({ focus, scrollToHeading, insert: (markdown: string) => insert?.(markdown) });

onMounted(async () => {
  const id = props.id;
  const editor = makeNotebookEditor(root.value!, id, props.markdown, () => t("markdown.notebook.editor"), markdown => {
    if (!disposed) emit("edit", id, markdown);
  }, () => t("markdown.notebook.task"), () => t("markdown.notebook.editFormula"), key => t(`markdown.notebook.${key}`),
  (event, target) => { void imageControls.value?.open(event, target); },
  (tool, trigger, getPosition) => tableControls.value?.runTableControl(tool, trigger, getPosition));
  try {
    await editor.create();
    teardown = () => { void editor.destroy().catch(showError); };
    if (disposed) teardown();
    else {
      activeEditor.value = editor;
      focusEditor = () => editor.action(ctx => ctx.get(editorViewCtx).focus());
      insert = markdown => editor.action(ctx => {
        const block = ctx.get(parserCtx)(markdown).firstChild;
        if (block) insertNotebookBlock(ctx.get(editorViewCtx), block);
      });
      if (afterFocus) {
        const restoreScroll = afterFocus;
        afterFocus = undefined;
        focus(restoreScroll);
      }
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
  activeEditor.value = undefined;
  focusEditor = undefined;
  teardown?.();
});
</script>

<template>
  <div ref="root" class="note-editor" :class="{ empty: !markdown.trim() }" :data-placeholder="t('markdown.notebook.placeholder')"
    @contextmenu="tableControls?.openCellMenu($event)" />
  <NotebookTableControls ref="tableControls" :editor="activeEditor" :markdown="markdown" @edit="emit('edit', props.id, $event)" />
  <NotebookImageControls ref="imageControls" :focus-editor="() => focusEditor?.()" />
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
.note-editor { position: relative; --table-toolbar-space: 32px; }
.note-editor :deep(.note-mermaid) { margin: 1em 0; }
.note-editor :deep(.mermaid-frame) {
  --mermaid-height-limit: min(50vh, 480px);
  display: flex;
  justify-content: center;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.note-editor :deep(.mermaid-preview) {
  inline-size: min(100%, var(--mermaid-width, 100%), calc(var(--mermaid-height-limit) * var(--mermaid-ratio, 1)));
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.note-editor :deep(.mermaid-preview img) {
  display: block;
  inline-size: 100%;
  max-block-size: var(--mermaid-height-limit);
  aspect-ratio: var(--mermaid-ratio, auto);
  object-fit: contain;
  margin-inline: auto;
}
.note-editor :deep(.mermaid-status) { color: var(--text-2); font-size: 13px; margin: 4px 0; }
.note-editor :deep(.mermaid-editor) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  margin: 0 0 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  font: 14px/1.6 var(--font-mono);
}
.note-editor :deep(.mermaid-gutter) {
  position: relative;
  inline-size: calc(19px + var(--mermaid-line-digits, 1) * 1ch);
  border-inline-end: 1px solid var(--border);
  overflow: hidden;
  color: var(--text-2);
  text-align: end;
  white-space: pre;
  user-select: none;
}
.note-editor :deep(.mermaid-gutter > div) { position: absolute; inset: 8px 8px auto 0; }
.note-editor :deep(.mermaid-source) {
  width: 100%;
  height: auto;
  padding: 8px 10px;
  border: 0;
  background: none;
  font: inherit;
  resize: none;
}
.note-editor :deep(.note-mermaid [hidden]) { display: none; }
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
.note-editor :deep(.notebook-code) {
  --code-language-height: 25px;
  --code-language-offset: 4px;
  position: relative;
  margin-block: 1em calc(var(--code-language-height) + var(--code-language-offset) + 3px);
}
.note-editor :deep(.notebook-code-body) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--code-bg);
  font: 0.88em/1.6 var(--font-mono);
}
.note-editor :deep(.notebook-code-body pre) {
  margin: 0;
  padding: 0.6em 0.8em;
  background: none;
  font: inherit;
}
.note-editor :deep(.notebook-code-gutter) {
  padding: 0.6em 0.55em 0.6em 0.7em;
  border-inline-end: 1px solid var(--border);
  color: var(--text-3);
  text-align: end;
  white-space: pre;
  user-select: none;
}
.note-editor :deep(.notebook-code-actions) {
  position: absolute;
  inset-block-start: calc(100% + var(--code-language-offset));
  inset-inline-end: 0;
  z-index: 1;
  width: clamp(5.5rem, 13%, 8rem);
  max-width: 100%;
  visibility: hidden;
}
.note-editor :deep(.notebook-code:is(.code-focused, :focus-within) .notebook-code-actions) {
  visibility: visible;
  animation: code-language-in var(--dur-fast) var(--ease-out);
}
@keyframes code-language-in {
  from { transform: translateY(-3px); clip-path: inset(0 0 100% 0); }
  to { transform: translateY(0); clip-path: inset(0); }
}
.note-editor :deep(.notebook-code-language) {
  display: block;
  width: 100%;
  height: var(--code-language-height);
  padding-inline: 6px;
  border-radius: 4px;
  background: var(--code-bg);
  text-align: center;
  font: 12px/1.4 var(--font-mono);
}
.note-editor :deep(.notebook-code-language:focus) { box-shadow: none; }
.note-editor :deep(pre[data-frontmatter]) { background: none; border-block: 1px solid var(--border); color: var(--text-2); padding-inline: 0; }
.note-editor :deep(img) { max-width: 100%; height: auto; }
.note-editor :deep(.ProseMirror :is(table, .notebook-table-toolbar-anchor)) { margin-block-start: var(--table-toolbar-space); }
/* 工具栏出现时由零高度锚点承接同一段留白，表格上边线留在原位。 */
.note-editor :deep(.ProseMirror .notebook-table-toolbar-anchor + table) { margin-block-start: 0; }
.note-editor :deep(.notebook-table-toolbar-anchor) { position: relative; height: 0; z-index: 3; }
.note-editor :deep(.tableWrapper) { overflow-x: auto; }
.note-editor :deep(.ProseMirror table) { width: 100%; border-collapse: collapse; margin-block-end: 1.1em; background: var(--surface); }
.note-editor :deep(.ProseMirror table :is(th, td)) { height: 38px; padding: 4px 12px; border: 1px solid var(--border); vertical-align: middle; }
.note-editor :deep(.ProseMirror table tr:nth-child(odd) > :is(th, td)) { background: var(--hover); }
.note-editor :deep(.ProseMirror table th) { font-weight: 600; }
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

<style>
.select-menu.notebook-language-menu {
  gap: 1px;
  overflow: auto;
  padding: 3px;
  border-radius: 6px;
  box-shadow: var(--shadow);
  font: 12px/1.4 var(--font-sans);
}
.notebook-language-menu[aria-hidden="true"] { pointer-events: none; }
.notebook-language-menu [role="option"] {
  flex-shrink: 0;
  padding: 4px 8px;
  overflow: hidden;
  border-radius: 4px;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.notebook-language-menu [role="option"]:hover,
.notebook-language-menu [aria-selected="true"] { background: var(--hover); }
</style>
