import type { ElementContent } from "hast";
import type { Node } from "@milkdown/prose/model";
import { NodeSelection, Plugin, TextSelection } from "@milkdown/prose/state";
import { Decoration, DecorationSet, type EditorView, type NodeViewConstructor } from "@milkdown/prose/view";
import { $nodeSchema, $prose, $remark } from "@milkdown/utils";
import { common, createLowlight } from "lowlight";
import remarkFrontmatter from "remark-frontmatter";
import { t } from "@/locales";
import { attachLanguageSuggestions } from "./codeLanguage";
import { isMermaid } from "./mermaid";

const yaml = $nodeSchema("notebookFrontmatter", () => ({
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  parseDOM: [{ tag: "pre[data-frontmatter]", preserveWhitespace: "full" }],
  toDOM: () => ["pre", { "data-frontmatter": "", "data-language": "yaml" }, ["code", 0]],
  parseMarkdown: {
    match: node => node.type === "yaml",
    runner: (state, node, type) => {
      state.openNode(type);
      if (node.value) state.addText(String(node.value));
      state.closeNode();
    },
  },
  toMarkdown: {
    match: node => node.type.name === "notebookFrontmatter",
    runner: (state, node) => { state.addNode("yaml", undefined, node.textContent); },
  },
}));

const highlighter = createLowlight(common);
const languages = [...new Set([...highlighter.listLanguages(), "mermaid", "plaintext"])].sort();
interface ColorSpan { from: number; to: number; classes: string; }
const codeColors = new WeakMap<Node, ColorSpan[]>();

export function openFencedBlock(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== "Enter" || event.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
  const { state } = view;
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== "paragraph" || $from.parentOffset !== $from.parent.content.size) return false;
  const text = $from.parent.textContent;
  const math = text === "$$";
  const code = /^(?:\x60{3,}|~{3,})([\w.+#-]*)$/.exec(text);
  if (!math && !code) return false;
  const language = code?.[1] ?? "";
  const mermaid = isMermaid(language);
  const type = state.schema.nodes[math ? "math" : mermaid ? "notebookMermaid" : "code_block"];
  const parent = $from.node(-1);
  if (!parent.canReplaceWith($from.index(-1), $from.indexAfter(-1), type)) return false;
  const start = $from.before();
  const block = type.create(math ? undefined : mermaid ? { lang: language } : { language });
  const transaction = state.tr.replaceWith(start, start + $from.parent.nodeSize, block);
  view.dispatch(transaction.setSelection(math || mermaid
    ? NodeSelection.create(transaction.doc, start)
    : TextSelection.create(transaction.doc, start + 1)).scrollIntoView());
  return true;
}

const codeBlockView: NodeViewConstructor = (initial, view, getPos) => {
  let node = initial;
  const document = view.dom.ownerDocument;
  const dom = document.createElement("div");
  dom.className = "notebook-code";
  const body = document.createElement("div");
  body.className = "notebook-code-body";
  const gutter = document.createElement("div");
  gutter.className = "notebook-code-gutter";
  gutter.contentEditable = "false";
  gutter.setAttribute("aria-hidden", "true");
  const pre = document.createElement("pre");
  const code = pre.appendChild(document.createElement("code"));
  body.append(gutter, pre);
  const actions = document.createElement("div");
  actions.className = "notebook-code-actions";
  actions.contentEditable = "false";
  const input = actions.appendChild(document.createElement("input"));
  input.className = "field notebook-code-language";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("aria-label", t("markdown.notebook.codeLanguage"));
  input.placeholder = t("markdown.notebook.codeLanguage");
  dom.append(body, actions);

  let lineCount = 0;
  function updateLines() {
    const lines = node.textContent.split("\n").length;
    if (lines === lineCount) return;
    lineCount = lines;
    gutter.textContent = Array.from({ length: lines }, (_, index) => index + 1).join("\n");
  }

  function commit() {
    const language = input.value.trim();
    if (/\s/.test(language)) {
      input.value = node.attrs.language;
      return;
    }
    input.value = language;
    const pos = getPos();
    if (pos === undefined || !view.editable || language === node.attrs.language) return;
    const transaction = view.state.tr;
    if (isMermaid(language)) {
      const diagram = view.state.schema.nodes.notebookMermaid.create({ value: node.textContent, lang: language });
      transaction.replaceWith(pos, pos + node.nodeSize, diagram);
    } else {
      transaction.setNodeAttribute(pos, "language", language);
    }
    view.dispatch(transaction);
  }

  const closeSuggestions = attachLanguageSuggestions(input, languages, commit);
  input.addEventListener("mousedown", event => {
    if (event.button !== 0 || document.activeElement === input) return;
    // 先把焦点交给浮动输入框，避免编辑器失焦时把它提前隐藏。
    event.preventDefault();
    input.focus({ preventScroll: true });
    input.select();
  });
  input.value = pre.dataset.language = node.attrs.language;
  updateLines();
  return {
    dom,
    contentDOM: code,
    update(updated) {
      if (updated.type !== node.type) return false;
      if (updated.attrs.language !== node.attrs.language) {
        input.value = pre.dataset.language = updated.attrs.language;
      }
      node = updated;
      updateLines();
      return true;
    },
    stopEvent(event) { return actions.contains(event.target as globalThis.Node) || gutter.contains(event.target as globalThis.Node); },
    ignoreMutation(mutation) {
      return mutation.type === "selection" ? actions.contains(mutation.target) : !code.contains(mutation.target);
    },
    destroy: closeSuggestions,
  };
};

function colors(node: Node, language: string): ColorSpan[] {
  const previous = codeColors.get(node);
  if (previous) return previous;
  const spans: ColorSpan[] = [];
  const text = node.textContent;
  if (highlighter.registered(language) && text.length <= 40_000) {
    let offset = 0;
    const walk = (token: ElementContent, classes: string[]) => {
      if (token.type === "text") {
        const to = offset + token.value.length;
        if (classes.length && to > offset) spans.push({ from: offset, to, classes: classes.join(" ") });
        offset = to;
      } else if (token.type === "element") {
        const name = token.properties.className;
        const combined = Array.isArray(name) ? [...classes, ...name.map(String)] : classes;
        token.children.forEach(child => walk(child, combined));
      }
    };
    try {
      highlighter.highlight(language, text).children.forEach(token => {
        if (token.type === "text" || token.type === "element") walk(token, []);
      });
    } catch {
      // 个别语法无法着色时保留可编辑的原始代码。
      spans.length = 0;
    }
  }
  codeColors.set(node, spans);
  return spans;
}

function decorations(doc: Node) {
  const marks: Decoration[] = [];
  doc.descendants((node, position) => {
    if (node.type.name !== "code_block" && node.type.name !== "notebookFrontmatter") return;
    const language = node.type.name === "notebookFrontmatter" ? "yaml" : String(node.attrs.language ?? "").toLowerCase();
    for (const span of colors(node, language)) {
      marks.push(Decoration.inline(position + 1 + span.from, position + 1 + span.to, { class: span.classes }));
    }
    return false;
  });
  return DecorationSet.create(doc, marks);
}

function trackFocusedCode(view: EditorView) {
  let focused: Element | null = null;
  let disposed = false;

  function update() {
    if (disposed) return;
    const active = view.dom.ownerDocument.activeElement;
    let next: Element | null = active && view.dom.contains(active)
      ? active.closest(".notebook-code-actions")?.parentElement ?? null
      : null;
    if (view.hasFocus()) {
      const selection = view.state.selection;
      const { $head } = selection;
      const pos = selection instanceof NodeSelection && selection.node.type.name === "code_block"
        ? selection.from
        : $head.parent.type.name === "code_block" ? $head.before() : undefined;
      if (pos !== undefined) {
        const dom = view.nodeDOM(pos);
        if (dom instanceof Element) next = dom;
      }
    }
    if (focused === next) return;
    focused?.classList.remove("code-focused");
    next?.classList.add("code-focused");
    focused = next;
  }

  // 编辑器失焦和语言框聚焦之间也可能触发视图更新，等焦点交接完成再检查。
  const afterFocusChange = () => queueMicrotask(update);
  view.dom.addEventListener("focusin", update);
  view.dom.addEventListener("focusout", afterFocusChange);
  update();
  return {
    update: afterFocusChange,
    destroy() {
      disposed = true;
      view.dom.removeEventListener("focusin", update);
      view.dom.removeEventListener("focusout", afterFocusChange);
    },
  };
}

export const blockStyles = [
  ...$remark("notebookFrontmatter", () => remarkFrontmatter, "yaml"),
  ...yaml,
  $prose(() => new Plugin<DecorationSet>({
    state: {
      init: (_, state) => decorations(state.doc),
      apply: (transaction, previous) => transaction.docChanged ? decorations(transaction.doc) : previous,
    },
    props: {
      nodeViews: { code_block: codeBlockView },
      decorations(state) { return this.getState(state); },
    },
    view: trackFocusedCode,
  })),
];
