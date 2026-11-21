// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { expect, test, vi } from "vitest";
import { createApp, h, nextTick } from "vue";
import { createI18n, type I18nOptions } from "vue-i18n";
import McpToolDetail from "./components/McpToolDetail.vue";
import locales from "./locales";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/composables/toolLibrary", () => ({ recordToolUsage: vi.fn() }));

test("表单校验、JSON 切换和结果返回保留参数", async () => {
  const invokeMock = vi.mocked(invoke);
  invokeMock.mockResolvedValue({ structuredContent: { total: 3 } });
  const host = document.createElement("div");
  document.body.append(host);
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const originalRangeRects = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [new DOMRect()] });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const sessionId = "test-session";
  const app = createApp({
    render: () => h(McpToolDetail, {
      sessionId,
      tool: {
        name: "calculate",
        outputSchema: { type: "object" },
        inputSchema: {
          type: "object",
          required: ["count"],
          properties: {
            note: { type: ["string", "null"] },
            enabled: { type: "boolean" },
            mode: { enum: ["fast", "precise"], type: "string" },
            count: { type: "integer" },
            settings: { anyOf: [{ type: "object" }, { type: "null" }], default: null },
          },
        },
      },
    }),
  }).use(createI18n({
    legacy: false,
    locale: "zh-CN",
    messages: { "zh-CN": { ...locales.messages?.["zh-CN"], common: { close: "关闭", copy: "复制", clear: "清空" } } } as I18nOptions["messages"],
  }));
  app.mount(host);
  try {
    const getEditor = () => vi.waitFor(() => {
      const root = host.querySelector<HTMLElement>(".argument-pane .cm-editor");
      expect(root).not.toBeNull();
      return EditorView.findFromDOM(root!)!;
    });
    const toggle = () => host.querySelector<HTMLButtonElement>(".argument-head [role=switch]")!.click();
    const run = host.querySelector<HTMLButtonElement>(".argument-footer .primary")!;
    expect(host.querySelector(".field-label")?.textContent).toContain("count");
    run.click();
    await nextTick();
    const count = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    const warning = count.closest(".field-control")?.nextElementSibling;
    expect(warning?.textContent).toBe("请填写此必填参数。");
    expect(count.getAttribute("aria-describedby")?.split(" ")).toContain(warning?.id);
    expect(invokeMock).not.toHaveBeenCalled();
    count.value = "3";
    count.dispatchEvent(new Event("input"));
    await nextTick();
    const note = host.querySelector<HTMLInputElement>('.argument-form input[type="text"]')!;
    note.value = "sample";
    note.dispatchEvent(new Event("input"));
    await nextTick();
    host.querySelector<HTMLButtonElement>(".text .field-clear")!.click();
    await nextTick();
    expect(note.value).toBe("");
    expect(document.activeElement).toBe(note);
    const select = host.querySelector<HTMLButtonElement>(".argument-form .app-select")!;
    select.click();
    await nextTick();
    document.body.querySelector<HTMLElement>('.select-menu [data-index="2"]')!.click();
    await nextTick();
    expect(select.textContent).toContain("precise");
    expect(host.querySelector(".argument-form .field-clear")).toBeNull();
    select.click();
    await nextTick();
    document.body.querySelector<HTMLElement>('.select-menu [data-index="0"]')!.click();
    await nextTick();
    expect(select.textContent).toContain("未设置");
    expect(document.activeElement).toBe(select);
    expect(host.querySelector(".argument-scroll .primary")).toBeNull();
    toggle();
    const editor = await getEditor();
    expect(host.querySelector(".mode-changed > .argument-editor")).not.toBeNull();
    const setInput = (insert: string) => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert } });
    expect(JSON.parse(editor.state.doc.toString())).toEqual({ count: 3, settings: null });
    setInput("{");
    await nextTick();
    expect(run.disabled).toBe(true);
    expect(host.querySelector(".argument-footer [role=alert]")?.textContent).toContain("有效的 JSON 对象");
    for (const invalid of ["[]", '{"settings":{"limit":1e400}}']) {
      setInput(invalid);
      await nextTick();
      expect(run.disabled).toBe(true);
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
    expect(invokeMock).not.toHaveBeenCalled();
    for (const jsonOnly of ['{"extra": true}', JSON.stringify({ note: "第一行\n第二行" })]) {
      setInput(jsonOnly);
      await nextTick();
      toggle();
      await nextTick();
      expect(host.querySelector(".argument-pane > [role=alert]")?.textContent).toContain("无法完整填入表单");
      expect(editor.state.doc.toString()).toBe(jsonOnly);
    }
    const args = { count: 3, note: null, enabled: false, settings: { mode: "fast" } };
    setInput(JSON.stringify(args));
    await nextTick();
    toggle();
    await nextTick();
    expect(host.querySelector<HTMLTextAreaElement>(".argument-form textarea")?.value).toContain('"mode": "fast"');
    expect(host.querySelector(".mode-changed > .argument-fields")).not.toBeNull();
    toggle();
    const switchedEditor = await getEditor();
    expect(JSON.parse(switchedEditor.state.doc.toString())).toEqual(args);
    expect(run.disabled).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
    await vi.waitFor(() => expect(host.querySelector(".output-panel .cm-content")?.textContent).toContain('"total": 3'));
    expect(invokeMock).toHaveBeenCalledWith("mcp_call_tool", {
      sessionId,
      name: "calculate",
      arguments: args,
    });
    expect(host.querySelector(".output-status")?.textContent).toBe("成功");
    expect(host.querySelector(".elapsed")?.textContent).toBeTruthy();
    expect(host.querySelector(".argument-pane")).toBeNull();
    expect(host.querySelector('.output-head [aria-haspopup="dialog"]')).toBeNull();
    expect(host.querySelector(".structured-result .cm-content")?.textContent).toContain('"total": 3');
    expect(host.querySelector(".output-panel .cm-lineWrapping")).toBeNull();
    host.querySelector<HTMLButtonElement>('.output-actions .seg button[aria-pressed="false"]')!.click();
    await nextTick();
    expect(host.querySelector(".raw-output")?.textContent).toBe('{"structuredContent":{"total":3}}');
    host.querySelector<HTMLButtonElement>(".copy-output")!.click();
    expect(writeText).toHaveBeenCalledWith('{"structuredContent":{"total":3}}');
    host.querySelector<HTMLButtonElement>(".result-back")!.click();
    const restoredEditor = await getEditor();
    expect(JSON.parse(restoredEditor.state.doc.toString())).toEqual(args);
    host.querySelector<HTMLButtonElement>(".argument-footer .subtle")!.click();
    await nextTick();
    expect(JSON.parse(restoredEditor.state.doc.toString())).toEqual({ settings: null });
  } finally {
    app.unmount();
    host.remove();
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
    if (originalRangeRects) Object.defineProperty(Range.prototype, "getClientRects", originalRangeRects);
    else Reflect.deleteProperty(Range.prototype, "getClientRects");
  }
});
