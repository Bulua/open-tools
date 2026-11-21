import { getIndentUnit, HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { countColumn, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const bracketColors = [
  "var(--syntax-key)",
  "var(--syntax-string)",
  "var(--syntax-number)",
];
const bracketMarks = bracketColors.map((_, index) => Decoration.mark({ class: `cm-json-bracket-${index}` }));

function decorate(view: EditorView) {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  const indentUnit = getIndentUnit(state);
  let lastLine = 0;

  // 只装饰当前可见位置，折叠和滚动时跟随编辑器更新。
  for (const { from, to } of view.visibleRanges) {
    for (let line = state.doc.lineAt(from); ; line = state.doc.line(line.number + 1)) {
      if (line.number > lastLine) {
        const whitespace = /^[\t ]+/.exec(line.text)?.[0];
        const columns = whitespace ? countColumn(whitespace, state.tabSize) : 0;
        if (columns >= indentUnit) {
          ranges.push(Decoration.line({
            class: "cm-json-guided-line",
            attributes: { style: `--json-indent-width:${columns}ch;--json-indent-step:${indentUnit}ch` },
          }).range(line.from));
        }
        lastLine = line.number;
      }
      if (line.to >= to || line.number === state.doc.lines) break;
    }

    syntaxTree(state).iterate({
      from,
      to,
      enter({ name, node, from: start, to: end }) {
        if (!["{", "}", "[", "]"].includes(name) || start < from || end > to || start === end) return;
        let depth = 0;
        for (let ancestor = node.parent?.parent; ancestor; ancestor = ancestor.parent) {
          if (ancestor.name === "Object" || ancestor.name === "Array") depth++;
        }
        ranges.push(bracketMarks[depth % bracketMarks.length].range(start, end));
      },
    });
  }
  return Decoration.set(ranges, true);
}

const jsonDecorations = ViewPlugin.fromClass(class {
  decorations;

  constructor(view: EditorView) {
    this.decorations = decorate(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
      this.decorations = decorate(update.view);
    }
  }
}, { decorations: (view) => view.decorations });

export const jsonInputEditor = [
  jsonDecorations,
  EditorView.editorAttributes.of({ class: "cm-json-input" }),
  syntaxHighlighting(HighlightStyle.define([
    { tag: tags.propertyName, color: "var(--syntax-number)" },
    { tag: tags.string, color: "var(--syntax-key)" },
    { tag: tags.number, color: "var(--syntax-string)" },
    { tag: [tags.bool, tags.null], color: "var(--syntax-literal)" },
  ])),
  EditorView.theme({
    "&.cm-json-input .cm-gutters": { color: "var(--syntax-key)", borderInlineEnd: "1px solid var(--border)" },
    "&.cm-json-input .cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 4px" },
    "&.cm-json-input .cm-line": { padding: "0 10px" },
    ".cm-json-guided-line": {
      backgroundImage: "repeating-linear-gradient(to right, var(--border-strong) 0 1px, transparent 1px var(--json-indent-step))",
      backgroundPosition: "10px 0",
      backgroundRepeat: "no-repeat",
      backgroundSize: "var(--json-indent-width) 100%",
    },
    "&.cm-json-input .cm-placeholder": { fontFamily: "inherit", whiteSpace: "pre-wrap" },
    ...Object.fromEntries(bracketColors.map((color, index) => [`.cm-json-bracket-${index}`, { color }])),
  }),
];
