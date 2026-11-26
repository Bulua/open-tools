<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  parserCtx,
  rootCtx,
} from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm, remarkGFMPlugin, tableSchema } from "@milkdown/preset-gfm";
import type { Node } from "@milkdown/prose/model";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";
import "@milkdown/prose/view/style/prosemirror.css";
import "@milkdown/prose/tables/style/tables.css";
import "katex/dist/katex.min.css";
import { openExternal } from "@/utils/openExternal";
import { showError } from "@/utils/errorToast";
import { prefersReducedMotion } from "@/utils/motion";
import { blockStyles } from "./markdown/blockStyles";
import { contentsPlugins } from "./markdown/contents";
import { imageSizePlugins } from "./markdown/imageSize";
import { inlineStyles } from "./markdown/inlineStyles";
import { mathPlugins, mathView } from "./markdown/math";
import { mermaidPlugins, mermaidView } from "./markdown/mermaid";

/**
 * 全应用统一的 Markdown 渲染与编辑组件：
 * - 默认只读模式（AI 输出预览、Markdown 转 Word 等）：直接渲染 Markdown（支持表格、高亮代码块、公式、Mermaid、脚注、目录、任务列表）。
 * - 可编辑模式（笔记本）：传入 `editable` 与 `createEditor` 工厂，复用同一套视觉样式。
 * 修改本文件的样式规则即可同步所有使用 Markdown 的界面效果。
 */
const props = defineProps<{
  markdown: string;
  id?: string;
  editable?: boolean;
  compact?: boolean;
  placeholder?: string;
  createEditor?: (root: HTMLElement) => Editor;
  insertBlock?: (view: EditorView, block: Node) => void;
}>();

const emit = defineEmits<{
  ready: [editor: Editor | undefined];
  failed: [id: string];
  openLink: [href: string];
  contextmenu: [event: MouseEvent];
}>();

const { t } = useI18n();
const root = ref<HTMLElement>();
let disposed = false;
let activeEditor: Editor | undefined;
let focusEditor: (() => void) | undefined;
let afterFocus: (() => void) | undefined;
let insertMarkdown: ((markdown: string) => void) | undefined;

const readonlyTableSchema = tableSchema.extendSchema(previous => ctx => ({
  ...previous(ctx),
  content: "table_header_row table_row*",
}));

const readonlyTaskKey = new PluginKey<DecorationSet>("readonlyMarkdownTasks");

function buildTaskDecorations(doc: Parameters<typeof DecorationSet.create>[0], label: () => string) {
  const widgets: Decoration[] = [];
  doc.descendants((node, position) => {
    if (node.type.name !== "list_item" || typeof node.attrs.checked !== "boolean") return;
    const checked = node.attrs.checked;
    widgets.push(
      Decoration.widget(
        position + 1,
        () => {
          const input = document.createElement("input");
          input.type = "checkbox";
          input.className = "note-task";
          input.checked = checked;
          input.disabled = true;
          input.setAttribute("aria-label", label());
          return input;
        },
        { side: -1, key: checked ? "checked" : "unchecked" },
      ),
    );
  });
  return DecorationSet.create(doc, widgets);
}

function makeReadonlyEditor(host: HTMLElement, markdown: string) {
  return Editor.make()
    .config(ctx => {
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, markdown);
      ctx.set(remarkGFMPlugin.options.key, { singleTilde: false });
      ctx.update(editorViewOptionsCtx, options => ({
        ...options,
        editable: () => false,
        handleDOMEvents: {
          click: (view, event) => {
            const targetEl = event.target as Element | null;
            const reference = targetEl?.closest?.<HTMLElement>('sup[data-type="footnote_reference"]');
            if (reference) {
              const definitions = view.dom.querySelectorAll<HTMLElement>('dl[data-type="footnote_definition"]');
              const definition = Array.from(definitions).find(
                item => item.dataset.label?.toLowerCase() === reference.dataset.label?.toLowerCase(),
              );
              if (definition) {
                definition.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
                return true;
              }
            }
            const anchor = targetEl?.closest?.("a");
            if (!anchor) return false;
            const href = anchor.getAttribute("href");
            if (href == null) return false;
            event.preventDefault();

            const tocLink = targetEl?.closest?.<HTMLElement>("[data-heading-position]");
            if (tocLink) {
              const target = view.nodeDOM(Number(tocLink.dataset.headingPosition));
              if (target instanceof Element) target.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
              return true;
            }
            if (href.startsWith("#")) {
              const rawId = href.slice(1);
              let decoded = rawId;
              try {
                decoded = decodeURIComponent(rawId);
              } catch {
                // 保持原值
              }
              const headings = Array.from(view.dom.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,[id]"));
              const target = headings.find(
                item =>
                  item.id === rawId ||
                  item.id === decoded ||
                  encodeURIComponent(item.id) === rawId ||
                  item.textContent?.trim().toLowerCase().replace(/\s+/g, "-") === decoded.toLowerCase(),
              );
              target?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
              return true;
            }
            if (/^https?:\/\//i.test(href)) {
              void openExternal(href).catch(showError);
              return true;
            }
            emit("openLink", href);
            return true;
          },
        },
        nodeViews: {
          inlineMath: mathView(false, () => t("markdown.notebook.editFormula")),
          math: mathView(true, () => t("markdown.notebook.editFormula")),
          notebookMermaid: mermaidView(key => t(`markdown.notebook.${key}`)),
        },
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(readonlyTableSchema)
    .use(imageSizePlugins)
    .use(inlineStyles)
    .use(blockStyles)
    .use(mathPlugins)
    .use(mermaidPlugins)
    .use(contentsPlugins)
    .use(
      $prose(() =>
        new Plugin<DecorationSet>({
          key: readonlyTaskKey,
          state: {
            init: (_, state) => buildTaskDecorations(state.doc, () => t("markdown.notebook.task")),
            apply: (tr, prev) => (tr.docChanged ? buildTaskDecorations(tr.doc, () => t("markdown.notebook.task")) : prev),
          },
          props: {
            decorations(state) {
              return this.getState(state);
            },
          },
        }),
      ),
    );
}

function focus(restoreScroll?: () => void) {
  if (!focusEditor) {
    afterFocus = restoreScroll;
    return;
  }
  focusEditor();
  restoreScroll?.();
}

function scrollToHeading(index: number) {
  root.value?.querySelectorAll(".ProseMirror :is(h1, h2, h3, h4, h5, h6)")[index]
    ?.scrollIntoView?.({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

defineExpose({
  focus,
  scrollToHeading,
  insert: (markdown: string) => insertMarkdown?.(markdown),
});

onMounted(async () => {
  if (!root.value) return;
  const docId = props.id ?? "";
  const editor = props.createEditor
    ? props.createEditor(root.value)
    : makeReadonlyEditor(root.value, props.markdown);
  try {
    await editor.create();
    if (disposed) {
      void editor.destroy().catch(() => undefined);
      return;
    }
    activeEditor = editor;
    emit("ready", editor);
    if (props.editable) {
      focusEditor = () => editor.action(ctx => ctx.get(editorViewCtx).focus());
      if (props.insertBlock) {
        const doInsert = props.insertBlock;
        insertMarkdown = markdown => editor.action(ctx => {
          const block = ctx.get(parserCtx)(markdown).firstChild;
          if (block) doInsert(ctx.get(editorViewCtx), block);
        });
      }
      if (afterFocus) {
        const restoreScroll = afterFocus;
        afterFocus = undefined;
        focus(restoreScroll);
      }
    }
  } catch (error) {
    if (!disposed) {
      showError(error);
      emit("failed", docId);
    }
  }
});

watch(
  () => props.markdown,
  nextMarkdown => {
    if (props.editable || !activeEditor || disposed) return;
    try {
      activeEditor.action(ctx => {
        const view = ctx.get(editorViewCtx);
        const doc = ctx.get(parserCtx)(nextMarkdown);
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
        view.dispatch(tr);
      });
    } catch {
      // 忽略增量解析异常
    }
  },
);

onBeforeUnmount(() => {
  disposed = true;
  const current = activeEditor;
  activeEditor = undefined;
  focusEditor = undefined;
  insertMarkdown = undefined;
  emit("ready", undefined);
  if (current) void current.destroy().catch(() => undefined);
});
</script>

<template>
  <div
    ref="root"
    class="md-view"
    :class="{
      'is-editable': editable,
      'is-readonly': !editable,
      compact,
      empty: editable && !markdown.trim(),
    }"
    :data-placeholder="editable ? placeholder : undefined"
    @contextmenu="emit('contextmenu', $event)"
  />
</template>

<style scoped>
.md-view {
  position: relative;
  --table-toolbar-space: 32px;
}
.md-view :deep(.ProseMirror) {
  outline: none;
  color: var(--text);
  font: 16px/1.72 var(--font-sans);
  overflow-wrap: anywhere;
}
.md-view.is-editable :deep(.ProseMirror) {
  min-height: 45vh;
}
.md-view.compact :deep(.ProseMirror) {
  font: 14.5px/1.7 var(--font-sans);
}
.md-view.is-readonly :deep(.ProseMirror) {
  user-select: text;
}
.md-view.empty::before {
  position: absolute;
  content: attr(data-placeholder);
  color: var(--text-3);
  font: 16px/1.72 var(--font-sans);
  pointer-events: none;
}

.md-view :deep(.ProseMirror > :first-child) { margin-block-start: 0; }
.md-view :deep(.ProseMirror > :last-child) { margin-block-end: 0; }
.md-view :deep(p) { margin: 0 0 0.9em; }
.md-view :deep(h1), .md-view :deep(h2), .md-view :deep(h3),
.md-view :deep(h4), .md-view :deep(h5), .md-view :deep(h6) {
  margin: 1.3em 0 0.5em;
  line-height: 1.3;
  font-weight: 600;
}
.md-view :deep(h1) { font-size: 1.85em; }
.md-view :deep(h2) { font-size: 1.45em; padding-bottom: 0.2em; border-bottom: 1px solid var(--border); }
.md-view :deep(h3) { font-size: 1.2em; }
.md-view :deep(h4) { font-size: 1.06em; }
.md-view :deep(h5) { font-size: 1em; }
.md-view :deep(h6) { color: var(--text-2); font-size: 0.92em; }
.md-view :deep(a) { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.md-view :deep(blockquote) { margin: 0.9em 0; padding-inline-start: 0.95em; border-inline-start: 2px solid var(--border-strong); color: var(--text-2); }
.md-view :deep(blockquote > :last-child), .md-view :deep(li > :last-child) { margin-block-end: 0; }
.md-view :deep(ul), .md-view :deep(ol) { margin: 0.65em 0 0.9em; padding-inline-start: 1.65em; }
.md-view :deep(li + li) { margin-block-start: 0.16em; }
.md-view :deep(li > p), .md-view :deep(li > ul), .md-view :deep(li > ol) { margin-block: 0.2em; }
.md-view :deep(li[data-item-type=task]) { position: relative; list-style: none; }
.md-view :deep(.note-task) { position: absolute; inset-inline-start: -1.52em; top: 0.45em; margin: 0; accent-color: var(--accent); }
.md-view :deep(hr) { border: 0; border-top: 1px solid var(--border); margin: 1.5em 0; }
.md-view :deep(code) { font: 0.88em/1.6 var(--font-mono); background: var(--hover); padding-inline: 0.22em; border-radius: 3px; }
.md-view :deep(pre) { margin: 1em 0 1.2em; padding: 0.7em 0.95em; overflow: auto; white-space: pre; background: var(--bg-sunken); font: 0.88em/1.6 var(--font-mono); }
.md-view :deep(pre code) { background: none; padding: 0; font: inherit; }

/* 代码块（带行号与语法高亮） */
.md-view :deep(.notebook-code) {
  --code-language-height: 25px;
  --code-language-offset: 4px;
  position: relative;
  margin-block: 1em calc(var(--code-language-height) + var(--code-language-offset) + 3px);
}
.md-view.is-readonly :deep(.notebook-code) {
  margin-block: 0.9em 1.05em;
}
.md-view :deep(.notebook-code-body) {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--code-bg);
  font: 0.88em/1.6 var(--font-mono);
}
.md-view :deep(.notebook-code-body pre) {
  margin: 0;
  padding: 0.6em 0.8em;
  background: none;
  font: inherit;
}
.md-view.is-readonly :deep(.notebook-code-body pre[data-language]:not([data-language=""])::after) {
  content: attr(data-language);
  position: absolute;
  top: 5px;
  right: 9px;
  font: 11px/1.2 var(--font-mono);
  color: var(--text-3);
  pointer-events: none;
}
.md-view :deep(.notebook-code-gutter) {
  padding: 0.6em 0.55em 0.6em 0.7em;
  border-inline-end: 1px solid var(--border);
  color: var(--text-3);
  text-align: end;
  white-space: pre;
  user-select: none;
}
.md-view :deep(.notebook-code-actions) {
  position: absolute;
  inset-block-start: calc(100% + var(--code-language-offset));
  inset-inline-end: 0;
  z-index: 1;
  width: clamp(5.5rem, 13%, 8rem);
  max-width: 100%;
  visibility: hidden;
}
.md-view.is-readonly :deep(.notebook-code-actions) {
  display: none;
}
.md-view :deep(.notebook-code:is(.code-focused, :focus-within) .notebook-code-actions) {
  visibility: visible;
  animation: code-language-in var(--dur-fast) var(--ease-out);
}
@keyframes code-language-in {
  from { transform: translateY(-3px); clip-path: inset(0 0 100% 0); }
  to { transform: translateY(0); clip-path: inset(0); }
}
.md-view :deep(.notebook-code-language) {
  display: block;
  width: 100%;
  height: var(--code-language-height);
  padding-inline: 6px;
  border-radius: 4px;
  background: var(--code-bg);
  text-align: center;
  font: 12px/1.4 var(--font-mono);
}
.md-view :deep(.notebook-code-language:focus) { box-shadow: none; }
.md-view :deep(pre[data-frontmatter]) { background: none; border-block: 1px solid var(--border); color: var(--text-2); padding-inline: 0; }
.md-view :deep(img) { max-width: 100%; height: auto; }

/* 表格（完整网格线 + 隔行底色） */
.md-view.is-editable :deep(.ProseMirror :is(table, .notebook-table-toolbar-anchor)) { margin-block-start: var(--table-toolbar-space); }
.md-view.is-editable :deep(.ProseMirror .notebook-table-toolbar-anchor + table) { margin-block-start: 0; }
.md-view :deep(.notebook-table-toolbar-anchor) { position: relative; height: 0; z-index: 3; }
.md-view :deep(.tableWrapper) { overflow-x: auto; }
.md-view :deep(.ProseMirror table) { width: 100%; border-collapse: collapse; margin-block: 0.9em 1.1em; background: var(--surface); }
.md-view :deep(.ProseMirror table :is(th, td)) { height: 36px; padding: 4px 12px; border: 1px solid var(--border); vertical-align: middle; }
.md-view :deep(.ProseMirror table tr:nth-child(odd) > :is(th, td)) { background: var(--hover); }
.md-view :deep(.ProseMirror table th) { font-weight: 600; }
.md-view :deep(td > :last-child), .md-view :deep(th > :last-child) { margin-block-end: 0; }
.md-view :deep(.selectedCell::after) { background: var(--accent-soft); }

/* 高亮、上下标、脚注、目录 */
.md-view :deep(mark) { color: inherit; background: var(--warning-soft); box-shadow: inset 0 -2px var(--warning-soft); }
.md-view :deep(sup), .md-view :deep(sub) { line-height: 0; }
.md-view :deep(sup[data-type=footnote_reference]) { color: var(--accent); cursor: pointer; padding-inline: 0.15em; }
.md-view :deep(dl[data-type=footnote_definition]) { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.7em; margin: 0; padding: 0.4em 0; border-top: 1px solid var(--border); color: var(--text-2); font-size: 0.9em; }
.md-view :deep(dl[data-type=footnote_definition] dd) { margin: 0; }
.md-view :deep(dl[data-type=footnote_definition] dd > :last-child) { margin-block-end: 0; }
.md-view :deep(nav[data-notebook-toc]) { margin: 1em 0; padding-inline-start: 0.9em; border-inline-start: 2px solid var(--border); font-size: 0.92em; }
.md-view :deep(nav[data-notebook-toc] ul) { list-style: none; margin: 0; padding: 0; }
.md-view :deep(nav[data-notebook-toc] a) { color: var(--text-2); text-decoration: none; }
.md-view :deep(nav[data-notebook-toc] a:hover) { color: var(--accent); text-decoration: underline; }

/* Mermaid 图表 */
.md-view :deep(.note-mermaid) { margin: 1em 0; }
.md-view :deep(.mermaid-frame) {
  --mermaid-height-limit: min(50vh, 480px);
  display: flex;
  justify-content: center;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.md-view :deep(.mermaid-preview) {
  inline-size: min(100%, var(--mermaid-width, 100%), calc(var(--mermaid-height-limit) * var(--mermaid-ratio, 1)));
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.md-view.is-readonly :deep(.mermaid-preview) { cursor: default; }
.md-view :deep(.mermaid-preview img) {
  display: block;
  inline-size: 100%;
  max-block-size: var(--mermaid-height-limit);
  aspect-ratio: var(--mermaid-ratio, auto);
  object-fit: contain;
  margin-inline: auto;
}
.md-view :deep(.mermaid-status) { color: var(--text-2); font-size: 13px; margin: 4px 0; }
.md-view :deep(.mermaid-editor) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  margin: 0 0 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  font: 14px/1.6 var(--font-mono);
}
.md-view :deep(.mermaid-gutter) {
  position: relative;
  inline-size: calc(19px + var(--mermaid-line-digits, 1) * 1ch);
  border-inline-end: 1px solid var(--border);
  overflow: hidden;
  color: var(--text-2);
  text-align: end;
  white-space: pre;
  user-select: none;
}
.md-view :deep(.mermaid-gutter > div) { position: absolute; inset: 8px 8px auto 0; }
.md-view :deep(.mermaid-source) {
  width: 100%;
  height: auto;
  padding: 8px 10px;
  border: 0;
  background: none;
  font: inherit;
  resize: none;
}
.md-view :deep(.note-mermaid [hidden]) { display: none; }

/* KaTeX 数学公式 */
.md-view :deep(.note-math) { cursor: text; }
.md-view.is-readonly :deep(.note-math) { cursor: default; }
.md-view :deep(.math-block) { overflow-x: auto; margin-block: 0.85em; }
.md-view :deep(.math-block .katex-display) { margin-block: 0.45em; }
.md-view :deep(.note-math input), .md-view :deep(.note-math textarea) { max-width: 100%; border: 0; border-bottom: 1px solid var(--accent); border-radius: 0; background: var(--surface); color: var(--text); font: 0.9em/1.6 var(--font-mono); }
.md-view :deep(.note-math textarea) { display: block; width: 100%; min-height: 4em; }
.md-view :deep(.note-math [hidden]) { display: none; }

/* 代码高亮配色 */
.md-view :deep(.hljs-comment), .md-view :deep(.hljs-quote), .md-view :deep(.hljs-meta) { color: var(--text-3); }
.md-view :deep(.hljs-keyword), .md-view :deep(.hljs-built_in), .md-view :deep(.hljs-selector-tag) { color: var(--syntax-literal); }
.md-view :deep(.hljs-string), .md-view :deep(.hljs-regexp), .md-view :deep(.hljs-addition) { color: var(--syntax-string); }
.md-view :deep(.hljs-number), .md-view :deep(.hljs-literal), .md-view :deep(.hljs-variable), .md-view :deep(.hljs-type) { color: var(--syntax-number); }
.md-view :deep(.hljs-title), .md-view :deep(.hljs-attr), .md-view :deep(.hljs-property), .md-view :deep(.hljs-name) { color: var(--syntax-key); }
.md-view :deep(.hljs-deletion) { color: var(--danger); }
</style>

<style>
.select-menu.notebook-language-menu {
  gap: 1px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
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
