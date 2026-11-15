// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { expect, it, vi } from "vitest";
import ChunkEditor from "./ChunkEditor.vue";

it("切换忙碌或只读状态时禁止文本输入，同时保留保存快捷键", async () => {
  const readonly = ref(true); const saved = vi.fn();
  const root = document.createElement("div"); document.body.append(root);
  const app = createApp({ render: () => h(ChunkEditor, { text: "line one\nline two", firstLine: 42, readonly: readonly.value, onSave: saved }) });
  try {
    app.mount(root); await nextTick();
    const content = root.querySelector<HTMLElement>(".cm-content")!;
    expect(content.getAttribute("contenteditable")).toBe("false");
    readonly.value = false; await nextTick();
    expect(content.getAttribute("contenteditable")).toBe("true");
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "s", code: "KeyS", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(saved).toHaveBeenCalledOnce();
    readonly.value = true; await nextTick(); expect(content.getAttribute("contenteditable")).toBe("false");
  } finally { app.unmount(); root.remove(); }
});

it("滚轮只在边界请求相邻块，忙碌、重复事件和文件末尾不会重复加载", async () => {
  const boundary = vi.fn(); const loading = ref(false); const canNext = ref(true);
  const component = ref<InstanceType<typeof ChunkEditor>>();
  const root = document.createElement("div"); document.body.append(root);
  const app = createApp({ render: () => h(ChunkEditor, { ref: component, text: "one\ntwo\nthree", firstLine: 1, readonly: true, canNext: canNext.value, canPrevious: true, loading: loading.value, onBoundary: boundary }) });
  try {
    app.mount(root); await nextTick();
    const scroller = root.querySelector<HTMLElement>(".cm-scroller")!;
    Object.defineProperties(scroller, { clientHeight: { value: 100 }, scrollHeight: { value: 1000 } });
    const wheel = (deltaY: number, deltaX = 0) => scroller.dispatchEvent(new WheelEvent("wheel", { deltaY, deltaX, bubbles: true, cancelable: true }));
    scroller.scrollTop = 200; wheel(40); expect(boundary).not.toHaveBeenCalled();
    scroller.scrollTop = 900; wheel(1, 30); expect(boundary).not.toHaveBeenCalled();
    wheel(40); wheel(40); expect(boundary.mock.calls).toEqual([["next"]]);
    component.value!.releaseBoundary(); loading.value = true; await nextTick();
    wheel(40); expect(boundary).toHaveBeenCalledOnce();
    loading.value = false; canNext.value = false; await nextTick();
    wheel(40); expect(boundary).toHaveBeenCalledOnce();
    scroller.scrollTop = 0; wheel(-40); expect(boundary.mock.calls).toEqual([["next"], ["previous"]]);
  } finally { app.unmount(); root.remove(); }
});

it("程序恢复滚动位置不会触发加载，已有选区也能滚动接入相邻内容", async () => {
  const { EditorView } = await import("@codemirror/view");
  const boundary = vi.fn(); const component = ref<InstanceType<typeof ChunkEditor>>();
  const root = document.createElement("div"); document.body.append(root);
  const app = createApp({ render: () => h(ChunkEditor, { ref: component, text: "one\ntwo\nthree", firstLine: 1, readonly: false, canNext: true, onBoundary: boundary }) });
  try {
    app.mount(root); await nextTick();
    const content = root.querySelector<HTMLElement>(".cm-content")!;
    const view = EditorView.findFromDOM(content)!; const scroller = view.scrollDOM;
    Object.defineProperties(scroller, { clientHeight: { value: 100 }, scrollHeight: { value: 1000 } });
    scroller.scrollTop = 900; scroller.dispatchEvent(new Event("scroll"));
    expect(boundary).not.toHaveBeenCalled();
    view.dispatch({ selection: { anchor: 0, head: 3 } });
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true }));
    expect(boundary.mock.calls).toEqual([["next"]]);
    component.value!.restore({ position: 0, offset: 0, left: 0, anchor: 3, head: 3 }, 4);
    expect(view.state.selection.main.head).toBe(7);
    scroller.dispatchEvent(new Event("scroll")); expect(boundary).toHaveBeenCalledOnce();
  } finally { app.unmount(); root.remove(); }
});


it("跳转后的窗口顶部有未加载前文时，向上滚轮和方向键触发加载，选区不阻断", async () => {
  const { EditorView } = await import("@codemirror/view");
  const boundary = vi.fn(); const component = ref<InstanceType<typeof ChunkEditor>>();
  const root = document.createElement("div"); document.body.append(root);
  const app = createApp({ render: () => h(ChunkEditor, { ref: component, text: "target\nafter", firstLine: 10000, readonly: false, canPrevious: true, onBoundary: boundary }) });
  try {
    app.mount(root); await nextTick();
    const view = EditorView.findFromDOM(root.querySelector<HTMLElement>(".cm-content")!)!;
    view.dispatch({ selection: { anchor: 0, head: 6 } });
    Object.defineProperties(view.scrollDOM, { clientHeight: { value: 100 }, scrollHeight: { value: 1000 } });
    view.scrollDOM.scrollTop = 12;
    view.scrollDOM.dispatchEvent(new WheelEvent("wheel", { deltaY: -40, bubbles: true, cancelable: true }));
    expect(boundary.mock.calls).toEqual([["previous"]]);
    expect(view.state.selection.main).toMatchObject({ anchor: 0, head: 6 });
    component.value!.releaseBoundary(); view.scrollDOM.scrollTop = 0;
    const key = new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true });
    view.scrollDOM.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(boundary.mock.calls).toEqual([["previous"], ["previous"]]);
  } finally { app.unmount(); root.remove(); }
});
