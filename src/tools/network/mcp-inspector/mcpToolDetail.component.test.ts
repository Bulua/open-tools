// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { expect, test, vi } from "vitest";
import { createApp, h, nextTick } from "vue";
import { createI18n, type I18nOptions } from "vue-i18n";
import McpToolDetail from "./components/McpToolDetail.vue";
import McpSchemaDetails from "./components/McpSchemaDetails.vue";
import locales from "./locales";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/composables/toolLibrary", () => ({ recordToolUsage: vi.fn() }));

test("左侧校验并提交 JSON 参数，调用成功后右侧显示结果", async () => {
  const invokeMock = vi.mocked(invoke);
  invokeMock.mockResolvedValue({ structuredContent: { total: 3 } });
  const host = document.createElement("div");
  document.body.append(host);
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const config = { type: "stdio" as const, command: "mock-server" };
  const app = createApp({
    render: () => h(McpToolDetail, {
      config,
      tool: {
        name: "calculate",
        inputSchema: {
          type: "object",
          required: ["count"],
          properties: {
            note: { type: ["string", "null"] },
            enabled: { type: "boolean" },
            count: { type: "integer" },
            settings: { anyOf: [{ type: "object" }, { type: "null" }], default: null },
          },
        },
      },
    }),
  }).use(createI18n({ legacy: false, locale: "zh-CN", messages: locales.messages as I18nOptions["messages"] }));
  app.mount(host);
  try {
    const editor = await vi.waitFor(() => {
      const root = host.querySelector<HTMLElement>(".argument-pane .cm-editor");
      expect(root).not.toBeNull();
      return EditorView.findFromDOM(root!)!;
    });
    const setInput = (insert: string) => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert } });
    expect(editor.state.doc.toString()).toBe("{}");
    setInput("{");
    await nextTick();
    const run = host.querySelector<HTMLButtonElement>(".argument-footer .primary")!;
    expect(run.disabled).toBe(true);
    expect(host.querySelector(".argument-footer [role=alert]")?.textContent).toContain("有效的 JSON 对象");
    setInput("[]");
    await nextTick();
    expect(run.disabled).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
    expect(invokeMock).not.toHaveBeenCalled();
    const args = { count: 3, note: null, enabled: false, settings: { mode: "fast" } };
    setInput(JSON.stringify(args));
    await nextTick();
    expect(run.disabled).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
    await vi.waitFor(() => expect(host.querySelector(".output-panel .cm-content")?.textContent).toContain('"total": 3'));
    expect(invokeMock).toHaveBeenCalledWith("mcp_call_tool", {
      config,
      name: "calculate",
      arguments: args,
    });
    expect(host.querySelector(".output-status")?.textContent).toBe("成功");
    expect(host.querySelector(".elapsed")?.textContent).toBeTruthy();
    host.querySelector<HTMLButtonElement>('.output-actions .seg button[aria-pressed="false"]')!.click();
    await nextTick();
    expect(host.querySelector(".raw-output")?.textContent).toBe('{"structuredContent":{"total":3}}');
    host.querySelector<HTMLButtonElement>(".output-actions .icon-btn")!.click();
    expect(writeText).toHaveBeenCalledWith('{"structuredContent":{"total":3}}');
    host.querySelector<HTMLButtonElement>(".argument-footer .subtle")!.click();
    await nextTick();
    expect(editor.state.doc.toString()).toBe("{}");
    expect(host.querySelector(".raw-output")?.textContent).toContain('"total":3');
  } finally {
    app.unmount();
    host.remove();
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

test("从顶部按钮打开 Schema，点击遮罩收回弹窗", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () => h(McpSchemaDetails, { label: "输入参数", buttonLabel: "输入 Schema", schema: { type: "object" } }),
  }).use(createI18n({ legacy: false, locale: "zh-CN" }));
  app.mount(host);
  try {
    const dialog = host.querySelector("dialog")!;
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new Event("close")); };
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 400, 300));
    expect(host.querySelector(".cm-content")).toBeNull();
    host.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!.click();
    await vi.waitFor(() => {
      const editor = host.querySelector(".cm-content");
      expect(editor?.textContent).toContain('"type": "object"');
      expect(editor?.getAttribute("aria-labelledby")).toBe(dialog.querySelector("h3")?.id);
    });
    const press = (x: number) => dialog.dispatchEvent(Object.assign(
      new MouseEvent("pointerdown", { clientX: x, clientY: 150, button: 0 }),
      { isPrimary: true },
    ));
    const click = (x: number) => dialog.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: 150 }));
    press(120);
    click(120);
    expect(dialog.open).toBe(true);
    press(120);
    click(50);
    expect(dialog.open).toBe(true);
    press(50);
    click(50);
    expect(dialog.open).toBe(false);
  } finally {
    app.unmount();
    host.remove();
  }
});
