/** CodeEditor 用到的自定义 CodeMirror 扩展 */
import { RangeSet, StateEffect, StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutterLineClass } from "@codemirror/view";
import { foldEffect, foldable } from "@codemirror/language";

// ---------- 错误行：整行浅红底色 + 红色行号 ----------

/** 设置错误所在行（传入该行起始位置，null 表示清除） */
export const setErrorLine = StateEffect.define<number | null>();

class ErrorGutterMarker extends GutterMarker {
  elementClass = "cm-error-gutter";
}
const errorGutterMarker = new ErrorGutterMarker();
const errorLineDecoration = Decoration.line({ class: "cm-error-line" });

export const errorLineField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setErrorLine)) return effect.value;
    return value === null ? null : tr.changes.mapPos(value);
  },
  provide: (field) => [
    EditorView.decorations.from(field, (pos) =>
      pos === null ? Decoration.none : Decoration.set([errorLineDecoration.range(pos)]),
    ),
    gutterLineClass.from(field, (pos) => (pos === null ? RangeSet.empty : RangeSet.of([errorGutterMarker.range(pos)]))),
  ],
});

// ---------- 折叠到第一层 ----------

/**
 * 折叠最外层下面的每一个代码块，最外层保持展开。
 * 例如 {"a": {...}, "b": [...]} 折叠后仍能看到 a、b 两个字段。
 */
export function foldFirstLevel(view: EditorView) {
  const ranges = firstLevelRanges(view.state);
  if (ranges.length) view.dispatch({ effects: ranges.map((r) => foldEffect.of(r)) });
}

function firstLevelRanges(state: EditorState) {
  const doc = state.doc;
  const ranges: { from: number; to: number }[] = [];
  let root: { from: number; to: number } | null = null;
  let skipUntil = -1;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (line.from < skipUntil) continue;
    const range = foldable(state, line.from, line.to);
    if (!range) continue;
    if (!root) {
      root = range;
      continue;
    }
    if (range.from >= root.from && range.to <= root.to) {
      ranges.push(range);
      skipUntil = range.to;
    }
  }
  return ranges;
}
