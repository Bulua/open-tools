import { InputRule } from "@milkdown/prose/inputrules";
import { NodeSelection } from "@milkdown/prose/state";
import type { NodeViewConstructor } from "@milkdown/prose/view";
import { $inputRule, $nodeSchema, $remark } from "@milkdown/utils";
import katex from "katex";
import remarkMath from "remark-math";

function mathSchema(name: "inlineMath" | "math", inline: boolean) {
  return $nodeSchema(name, () => ({
    group: inline ? "inline" : "block",
    inline,
    atom: true,
    attrs: { value: { default: "", validate: "string" } },
    parseDOM: [{
      tag: `[data-math="${name}"]`,
      getAttrs: element => ({ value: element.getAttribute("data-tex") ?? "" }),
    }],
    // 剪贴板也能读回 LaTeX，编辑区的排版由 NodeView 负责。
    toDOM: node => [inline ? "span" : "div", { "data-math": name, "data-tex": node.attrs.value }, node.attrs.value],
    parseMarkdown: {
      match: node => node.type === name,
      runner: (state, node, type) => { state.addNode(type, { value: node.value ?? "" }); },
    },
    toMarkdown: {
      match: node => node.type.name === name,
      runner: (state, node) => { state.addNode(name, undefined, node.attrs.value); },
    },
  }));
}

const inlineMath = mathSchema("inlineMath", true);
const blockMath = mathSchema("math", false);

export const mathPlugins = [
  ...$remark("notebookMath", () => remarkMath),
  ...inlineMath, ...blockMath,
  $inputRule(ctx => new InputRule(/(?<![\\$])\$(?!\s)([^$\n]+?)(?<![\\\s])\$$/, (state, match, start, end) => {
    return state.tr.replaceWith(start, end, inlineMath.type(ctx).create({ value: match[1] }));
  })),
  $inputRule(ctx => new InputRule(/^\$\$ $/, (state, _match, start) => {
    const position = state.doc.resolve(start).before();
    const paragraph = state.doc.nodeAt(position);
    if (!paragraph || paragraph.type.name !== "paragraph") return null;
    const transaction = state.tr.replaceWith(position, position + paragraph.nodeSize, blockMath.type(ctx).create());
    return transaction.setSelection(NodeSelection.create(transaction.doc, position));
  })),
];

export function mathView(displayMode: boolean, label: () => string): NodeViewConstructor {
  return (initial, view, getPos) => {
    let node = initial;
    const dom = document.createElement(displayMode ? "div" : "span");
    dom.className = displayMode ? "note-math math-block" : "note-math math-inline";
    dom.contentEditable = "false";
    dom.title = label();
    const preview = document.createElement("span");
    const input = document.createElement(displayMode ? "textarea" : "input");
    input.setAttribute("aria-label", label());
    input.spellcheck = false;
    input.hidden = true;
    dom.append(preview, input);
    let editing = false;
    let original = "";

    function render() {
      const value = node.attrs.value as string;
      if (!value.trim()) { preview.textContent = displayMode ? "$$" : "$"; return; }
      try {
        katex.render(value, preview, { displayMode, trust: false, maxExpand: 1000, maxSize: 20 });
      } catch {
        // 公式暂时不完整时仍显示源文字，方便继续修正。
        preview.textContent = value;
      }
    }

    function edit() {
      if (editing || !view.editable) return;
      editing = true;
      original = node.attrs.value;
      input.value = original;
      preview.hidden = true;
      input.hidden = false;
      input.focus();
    }

    function commit(value: string) {
      const position = getPos();
      if (position !== undefined && value !== node.attrs.value) {
        view.dispatch(view.state.tr.setNodeAttribute(position, "value", value));
      }
    }

    function finish(save: boolean) {
      if (!editing) return;
      editing = false;
      commit(save ? input.value : original);
      input.hidden = true;
      preview.hidden = false;
    }

    dom.addEventListener("dblclick", event => { event.preventDefault(); edit(); });
    input.addEventListener("input", () => commit(input.value));
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", rawEvent => {
      const event = rawEvent as KeyboardEvent;
      if (event.isComposing) return;
      if (event.key === "Escape" || (event.key === "Enter" && (!displayMode || event.ctrlKey))) {
        event.preventDefault();
        finish(event.key !== "Escape");
        view.focus();
      }
    });
    render();
    return {
      dom,
      update(updated) {
        if (updated.type !== node.type) return false;
        if (updated.attrs.value !== node.attrs.value) {
          node = updated;
          render();
        }
        return true;
      },
      selectNode() { dom.classList.add("ProseMirror-selectednode"); if (!node.attrs.value) edit(); },
      deselectNode() { dom.classList.remove("ProseMirror-selectednode"); },
      stopEvent(event) { return event.target === input || event.type === "dblclick"; },
      ignoreMutation() { return true; },
    };
  };
}
