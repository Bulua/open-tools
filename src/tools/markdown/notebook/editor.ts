import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx, serializerCtx } from "@milkdown/core";
import { clipboard } from "@milkdown/plugin-clipboard";
import { history } from "@milkdown/plugin-history";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm, remarkGFMPlugin } from "@milkdown/preset-gfm";
import { Plugin } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";
import { openExternal } from "@/utils/openExternal";
import { showError } from "@/utils/errorToast";
import { blockStyles, openFencedBlock } from "./blockStyles";
import { inlineStyles } from "./inlineStyles";
import { mathPlugins, mathView } from "./math";
import { contentsPlugins } from "./contents";
import { mermaidPlugins, mermaidView, type MermaidLabel } from "./mermaid";

export function makeNotebookEditor(
  root: HTMLElement,
  markdown: string,
  label: () => string,
  onChange: (markdown: string) => void,
  taskLabel = label,
  formulaLabel = label,
  mermaidLabel: (key: MermaidLabel) => string = label,
) {
  return Editor.make()
    .config(ctx => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
      ctx.set(remarkGFMPlugin.options.key, { singleTilde: false });
      ctx.update(editorViewOptionsCtx, options => ({
        ...options,
        handleKeyDown: openFencedBlock,
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
          image: (node) => {
            const img = document.createElement("img");
            const src = node.attrs.src as string;
            if (/^https?:\/\/[^/]/i.test(src) || /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(src)) img.src = src;
            img.alt = node.attrs.alt;
            img.title = node.attrs.title;
            img.loading = "lazy";
            img.referrerPolicy = "no-referrer";
            return { dom: img };
          },
        },
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(inlineStyles)
    .use(blockStyles)
    .use(mathPlugins)
    .use(mermaidPlugins)
    .use(contentsPlugins)
    .use(history)
    .use(clipboard)
    .use($prose(ctx => {
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
      return new Plugin<DecorationSet>({
        state: {
          init: (_, state) => taskWidgets(state.doc),
          apply: (transaction, widgets) => transaction.docChanged ? taskWidgets(transaction.doc) : widgets,
        },
        props: { decorations(state) { return this.getState(state); } },
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
