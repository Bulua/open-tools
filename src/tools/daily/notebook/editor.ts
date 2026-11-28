import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx, serializerCtx } from "@milkdown/core";
import { clipboard } from "@milkdown/plugin-clipboard";
import { history } from "@milkdown/plugin-history";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm, remarkGFMPlugin } from "@milkdown/preset-gfm";
import type { Node } from "@milkdown/prose/model";
import { NodeSelection, Plugin, PluginKey, Selection, type EditorState } from "@milkdown/prose/state";
import { isInTable, selectedRect } from "@milkdown/prose/tables";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";
import { h, render } from "vue";
import { openExternal } from "@/utils/openExternal";
import { showError } from "@/utils/errorToast";
import { blockStyles, openFencedBlock } from "./blockStyles";
import { inlineStyles } from "./inlineStyles";
import { mathPlugins, mathView } from "./math";
import { contentsPlugins } from "./contents";
import { mermaidPlugins, mermaidView, type MermaidLabel } from "./mermaid";
import { notebookImagePaste, notebookImageView, type ImageSizeTarget } from "./images";
import { imageSizePlugins } from "./imageSize";
import { handleTableKeys, notebookTableSchema, type TableControl } from "./tables";
import NotebookTableToolbar from "./components/NotebookTableToolbar.vue";

const notebookWidgetsKey = new PluginKey<{ tasks: DecorationSet; interacted: boolean }>("notebookWidgets");

export function insertNotebookBlock(view: EditorView, block: Node) {
  const { state } = view;
  const { $from } = state.selection;
  const paragraph = state.schema.nodes.paragraph;
  const replaceEmpty = $from.depth === 1 && $from.parent.type === paragraph && !$from.parent.content.size;
  const position = $from.depth ? $from.after(1) : $from.pos;
  const tr = state.tr;
  // 在当前顶层块后插入，避免在另一个表格或代码块里生成无效结构。
  const start = replaceEmpty ? $from.before(1) : position;
  tr.replaceWith(start, position, block);
  const end = start + block.nodeSize;
  if (block.isAtom && end === tr.doc.content.size) tr.insert(end, paragraph.create());
  const selection = Selection.findFrom(tr.doc.resolve(start), 1, true);
  if (selection) tr.setSelection(selection);
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function makeNotebookEditor(
  root: HTMLElement,
  noteId: string,
  markdown: string,
  label: () => string,
  onChange: (markdown: string) => void,
  taskLabel = label,
  formulaLabel = label,
  mermaidLabel: (key: MermaidLabel) => string = label,
  onImageContext?: (event: MouseEvent, target: ImageSizeTarget) => void,
  onTableControl?: (tool: TableControl, trigger: HTMLElement, getPosition: () => number | undefined) => void,
) {
  return Editor.make()
    .config(ctx => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
      ctx.set(remarkGFMPlugin.options.key, { singleTilde: false });
      ctx.update(editorViewOptionsCtx, options => ({
        ...options,
        handleKeyDown: (view, event) => handleTableKeys(ctx, view, event) || openFencedBlock(view, event),
        attributes: () => ({ "aria-label": label(), role: "textbox", "aria-multiline": "true" }),
        handleDOMEvents: {
          click: (view, event) => {
            const reference = (event.target as Element | null)?.closest?.<HTMLElement>('sup[data-type="footnote_reference"]');
            if (reference) {
              const definitions = view.dom.querySelectorAll<HTMLElement>('dl[data-type="footnote_definition"]');
              const definition = Array.from(definitions).find(item => item.dataset.label?.toLowerCase() === reference.dataset.label?.toLowerCase());
              if (definition) {
                definition.scrollIntoView?.({ block: "nearest" });
                return true;
              }
            }
            const href = (event.target as Element | null)?.closest?.("a")?.getAttribute("href");
            if (href == null) return false;
            event.preventDefault();
            const tocLink = (event.target as Element | null)?.closest?.<HTMLElement>("[data-heading-position]");
            if (tocLink) {
              const target = view.nodeDOM(Number(tocLink.dataset.headingPosition));
              if (target instanceof Element) target.scrollIntoView?.({ block: "nearest" });
            } else if (href.startsWith("#")) {
              const target = Array.from(view.dom.querySelectorAll<HTMLElement>("[id]")).find(item =>
                item.id === href.slice(1) || encodeURIComponent(item.id) === href.slice(1));
              target?.scrollIntoView?.({ block: "nearest" });
            } else if (event.ctrlKey || event.metaKey) {
              void openExternal(href).catch(showError);
            }
            return true;
          },
        },
        nodeViews: {
          inlineMath: mathView(false, formulaLabel),
          math: mathView(true, formulaLabel),
          notebookMermaid: mermaidView(mermaidLabel),
          image: (node, view, getPos) => notebookImageView(noteId, node, view, getPos, onImageContext),
        },
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(notebookTableSchema)
    .use(imageSizePlugins)
    .use(inlineStyles)
    .use(blockStyles)
    .use(mathPlugins)
    .use(mermaidPlugins)
    .use(contentsPlugins)
    .use(history)
    .use($prose(() => notebookImagePaste(noteId)))
    .use(clipboard)
    .use($prose(ctx => {
      const tableToolbar = (state: EditorState) => {
        if (!onTableControl) return;
        const { selection } = state;
        const position = selection instanceof NodeSelection && selection.node.type === state.schema.nodes.table
          ? selection.from
          : isInTable(state) ? selectedRect(state).tableStart - 1 : undefined;
        if (position === undefined) return;
        return Decoration.widget(position, (_, getPosition) => {
          const host = document.createElement("div");
          host.className = "notebook-table-toolbar-anchor";
          host.contentEditable = "false";
          render(h(NotebookTableToolbar, {
            onAction: (tool, trigger) => onTableControl(tool, trigger, getPosition),
          }), host);
          return host;
        }, { side: -1, key: "notebook-table-toolbar", stopEvent: () => true, destroy: dom => render(null, dom as HTMLElement) });
      };
      const taskWidgets = (doc: Parameters<typeof DecorationSet.create>[0]) => {
        const widgets: Decoration[] = [];
        doc.descendants((node, position) => {
          if (node.type.name !== "list_item" || typeof node.attrs.checked !== "boolean") return;
          const checked = node.attrs.checked;
          widgets.push(Decoration.widget(position + 1, (view, getPosition) => {
            const input = document.createElement("input");
            input.type = "checkbox";
            input.className = "note-task";
            input.checked = checked;
            input.setAttribute("aria-label", taskLabel());
            input.addEventListener("change", () => {
              const widgetPosition = getPosition();
              if (widgetPosition === undefined) return;
              view.dispatch(view.state.tr.setNodeAttribute(widgetPosition - 1, "checked", input.checked));
            });
            return input;
          }, { side: -1, key: checked ? "checked" : "unchecked", stopEvent: () => true }));
        });
        return DecorationSet.create(doc, widgets);
      };
      return new Plugin({
        key: notebookWidgetsKey,
        state: {
          init: (_, state) => ({ tasks: taskWidgets(state.doc), interacted: false }),
          apply: (transaction, previous) => ({
            tasks: transaction.docChanged ? taskWidgets(transaction.doc) : previous.tasks,
            // 打开以表格开头的笔记时，编辑器默认光标不算用户选择。
            interacted: previous.interacted || transaction.selectionSet || transaction.getMeta(notebookWidgetsKey) === true,
          }),
        },
        props: {
          handleDOMEvents: {
            focus(view) {
              if (onTableControl && !notebookWidgetsKey.getState(view.state)?.interacted) {
                view.dispatch(view.state.tr.setMeta(notebookWidgetsKey, true));
              }
              return false;
            },
          },
          decorations(state) {
            const widgets = notebookWidgetsKey.getState(state);
            const toolbar = widgets?.interacted ? tableToolbar(state) : undefined;
            return toolbar ? widgets?.tasks.add(state.doc, [toolbar]) : widgets?.tasks;
          },
        },
        view: () => ({
          update(view, previous) {
            if (!view.state.doc.eq(previous.doc)) {
              // 同步读取当前笔记的 Markdown，切换笔记时也不会漏掉最后一次输入。
              onChange(ctx.get(serializerCtx)(view.state.doc));
            }
          },
        }),
      });
    }));
}
