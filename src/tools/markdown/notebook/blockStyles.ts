import type { ElementContent } from "hast";
import type { Node } from "@milkdown/prose/model";
import { NodeSelection, Plugin, TextSelection } from "@milkdown/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/prose/view";
import { $nodeSchema, $prose, $remark } from "@milkdown/utils";
import { common, createLowlight } from "lowlight";
import remarkFrontmatter from "remark-frontmatter";

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
  const type = state.schema.nodes[math ? "math" : "code_block"];
  const parent = $from.node(-1);
  if (!parent.canReplaceWith($from.index(-1), $from.indexAfter(-1), type)) return false;
  const start = $from.before();
  const block = type.create(math ? undefined : { language: code?.[1] ?? "" });
  const transaction = state.tr.replaceWith(start, start + $from.parent.nodeSize, block);
  view.dispatch(transaction.setSelection(math
    ? NodeSelection.create(transaction.doc, start)
    : TextSelection.create(transaction.doc, start + 1)).scrollIntoView());
  return true;
}

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

export const blockStyles = [
  ...$remark("notebookFrontmatter", () => remarkFrontmatter, "yaml"),
  ...yaml,
  $prose(() => new Plugin<DecorationSet>({
    state: {
      init: (_, state) => decorations(state.doc),
      apply: (transaction, previous) => transaction.docChanged ? decorations(transaction.doc) : previous,
    },
    props: { decorations(state) { return this.getState(state); } },
  })),
];
