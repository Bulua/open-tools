/** CodeEditor 的外观，颜色全部取自 styles/theme.css 中的变量，自动适配浅色/深色 */
import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    color: "var(--text)",
    backgroundColor: "transparent",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.7",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "4px 0 14px",
    caretColor: "var(--accent)",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--accent-soft)",
  },
  ".cm-activeLine": { backgroundColor: "var(--hover)" },
  ".cm-selectionMatch": { backgroundColor: "var(--active)" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--accent-soft)",
    outline: "none",
  },
  ".cm-placeholder": { color: "var(--text-3)", fontFamily: "var(--font-sans)" },

  // 左侧：行号、折叠箭头（尽量紧凑，让行号贴近内容）
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--text-3)",
    paddingLeft: "4px",
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "20px", padding: "0 2px 0 6px", fontSize: "12px" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text)" },
  ".cm-foldGutter .cm-gutterElement": { display: "flex", alignItems: "center", padding: "0 2px" },
  ".cm-line": { padding: "0 12px 0 2px" },

  // 错误所在行：浅红底色 + 红色加粗行号
  ".cm-error-line": { backgroundColor: "var(--danger-soft)" },
  ".cm-gutterElement.cm-error-gutter": { color: "var(--danger)", fontWeight: "600" },
  ".cm-fold-marker": {
    display: "inline-flex",
    color: "var(--text-3)",
    cursor: "pointer",
    transition: "transform 0.12s",
  },
  ".cm-fold-marker.open": { transform: "rotate(90deg)", opacity: "0" },
  ".cm-gutters:hover .cm-fold-marker.open": { opacity: "1" },
  ".cm-fold-marker:hover": { color: "var(--text)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--active)",
    border: "none",
    borderRadius: "4px",
    color: "var(--text-2)",
    padding: "0 6px",
    margin: "0 2px",
  },

  // 错误波浪线与提示
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--danger)",
    textUnderlineOffset: "3px",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    boxShadow: "var(--shadow)",
    overflow: "hidden",
  },
  ".cm-diagnostic": { padding: "6px 10px", fontFamily: "var(--font-sans)", fontSize: "12px" },
  ".cm-diagnostic-error": { borderLeft: "3px solid var(--danger)" },

  // Ctrl+F 搜索面板
  ".cm-panels": {
    backgroundColor: "var(--bg-sunken)",
    color: "var(--text)",
    borderColor: "var(--border)",
  },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-textfield": {
    border: "1px solid var(--border)",
    borderRadius: "6px",
    backgroundColor: "var(--surface)",
    color: "var(--text)",
  },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    color: "var(--text)",
  },
  ".cm-searchMatch": { backgroundColor: "var(--warning-soft)" },
  ".cm-searchMatch-selected": { backgroundColor: "var(--accent-soft)" },
});

export const highlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--syntax-key)" },
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: [tags.bool, tags.null], color: "var(--syntax-literal)" },
  { tag: [tags.separator, tags.brace, tags.squareBracket, tags.punctuation], color: "var(--text-3)" },
]);
