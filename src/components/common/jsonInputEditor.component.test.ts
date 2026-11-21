// @vitest-environment jsdom
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { expect, test } from "vitest";
import { createApp, h, nextTick, ref } from "vue";
import CodeEditor from "./CodeEditor.vue";
import { jsonInputEditor } from "./jsonInputEditor";

test("只给实际的括号配色，并跟随输入更新缩进线", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const editor = new EditorView({
    parent: host,
    doc: '{\n  "literal": "[]",\n  "nested": [\n    {}\n  ]\n}',
    extensions: [json(), jsonInputEditor],
  });
  try {
    const marked = (level: number) => [...host.querySelectorAll(`.cm-json-bracket-${level}`)].map((el) => el.textContent);
    expect(marked(0)).toEqual(["{", "}"]);
    expect(marked(1)).toEqual(["[", "]"]);
    expect(marked(2)).toEqual(["{", "}"]);
    expect(host.querySelectorAll(".cm-json-guided-line")).toHaveLength(4);
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '["{}"]' } });
    expect(marked(0)).toEqual(["[", "]"]);
    expect(marked(1)).toEqual([]);
    expect(host.querySelectorAll(".cm-json-guided-line")).toHaveLength(0);
  } finally {
    editor.destroy();
    host.remove();
  }
});

test("切换预览格式时保留编辑器和光标，并更新折行设置", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const language = ref<"json" | "text">("text");
  const wrap = ref(false);
  const app = createApp({
    setup: () => () => h(CodeEditor, { language: language.value, wrap: wrap.value, modelValue: '{"a": [1]}' }),
  });
  app.mount(host);
  try {
    const editor = EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)!;
    editor.dispatch({ selection: { anchor: 2 } });
    expect(editor.dom.classList.contains("cm-json-input")).toBe(false);
    language.value = "json";
    wrap.value = true;
    await nextTick();
    expect(EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)).toBe(editor);
    expect(editor.state.selection.main.anchor).toBe(2);
    expect(editor.dom.classList.contains("cm-json-input")).toBe(true);
    expect(editor.contentDOM.classList.contains("cm-lineWrapping")).toBe(true);
    expect(host.querySelectorAll(".cm-foldGutter")).toHaveLength(1);
    language.value = "text";
    wrap.value = false;
    await nextTick();
    expect(editor.dom.classList.contains("cm-json-input")).toBe(false);
    expect(editor.contentDOM.classList.contains("cm-lineWrapping")).toBe(false);
  } finally {
    app.unmount();
    host.remove();
  }
});
