<script lang="ts">
export interface EditorError {
  /** 出错字符在文本中的位置 */
  position: number;
  message: string;
}
</script>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
  unfoldAll,
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { json } from "@codemirror/lang-json";
import { editorTheme, highlightStyle } from "./codeEditorTheme";
import { errorLineField, foldFirstLevel, setErrorLine } from "./codeEditorExtensions";

/**
 * 代码编辑器（基于 CodeMirror 6）：行号、折叠、语法高亮、错误标记。
 * 一般不直接使用，而是通过 <TextPane language="json"> 使用。
 */
const props = withDefaults(
  defineProps<{
    language?: "json" | "text";
    readonly?: boolean;
    placeholder?: string;
    /** 标记错误：所在行变红，出错处显示波浪线，鼠标悬停显示提示 */
    error?: EditorError | null;
    /** 长行自动换行 */
    wrap?: boolean;
  }>(),
  { language: "text", readonly: false, placeholder: "", error: null, wrap: false },
);

const model = defineModel<string>({ default: "" });
const host = ref<HTMLDivElement>();
let view: EditorView | undefined;

const languageExtension = (): Extension => (props.language === "json" ? json() : []);

const foldMarker = (open: boolean) => {
  const el = document.createElement("span");
  el.className = `cm-fold-marker${open ? " open" : ""}`;
  el.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  return el;
};

const showError = () => {
  if (!view) return;
  const err = props.error;
  const doc = view.state.doc;
  let diagnostics: Diagnostic[] = [];
  let lineStart: number | null = null;
  if (err) {
    // 从出错位置标记到行尾，比只标一个字符更醒目
    const from = Math.min(err.position, doc.length);
    const line = doc.lineAt(from);
    const to = from < line.to ? line.to : Math.min(from + 1, doc.length);
    diagnostics = [{ from: to > from ? from : line.from, to, severity: "error", message: err.message }];
    lineStart = line.from;
  }
  view.dispatch(setDiagnostics(view.state, diagnostics));
  view.dispatch({ effects: setErrorLine.of(lineStart) });
};

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: model.value,
      extensions: [
        lineNumbers(),
        foldGutter({ markerDOM: foldMarker }),
        // 只读的结果框不需要高亮当前行
        props.readonly ? [] : [highlightActiveLineGutter(), highlightActiveLine()],
        errorLineField,
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        syntaxHighlighting(highlightStyle),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        languageExtension(),
        props.wrap ? EditorView.lineWrapping : [],
        placeholderExt(props.placeholder),
        EditorState.readOnly.of(props.readonly),
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) model.value = update.state.doc.toString();
        }),
      ],
    }),
  });
  showError();
});

onBeforeUnmount(() => view?.destroy());

// 外部修改内容（粘贴按钮、结果更新）时同步到编辑器
watch(model, (value) => {
  if (!view || value === view.state.doc.toString()) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
});

watch(() => props.error, showError);

/** 光标移到指定位置并滚动到可见区域 */
const focusAt = (position: number) => {
  if (!view) return;
  const pos = Math.min(position, view.state.doc.length);
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  view.focus();
};

defineExpose({
  focusAt,
  foldAll: () => view && foldFirstLevel(view),
  unfoldAll: () => view && unfoldAll(view),
});
</script>

<template>
  <div ref="host" class="code-editor" />
</template>

<style scoped>
.code-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.code-editor :deep(.cm-editor) {
  flex: 1;
  min-height: 0;
}
</style>
