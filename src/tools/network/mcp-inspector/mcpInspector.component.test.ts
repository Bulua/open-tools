// @vitest-environment jsdom
import { invoke } from "@tauri-apps/api/core";
import { expect, test, vi } from "vitest";
import { createApp, nextTick } from "vue";
import { createI18n, type I18nOptions } from "vue-i18n";
import McpInspector from "./McpInspector.vue";
import locales from "./locales";
import { connections, sessions, type McpConnection } from "./workspace";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

test("通过卡片连接后浏览三个目录，关闭开关则断开连接", async () => {
  const mock = vi.mocked(invoke);
  let persisted: McpConnection[] = [{
    id: "saved", name: "已保存的服务", config: { type: "http", url: "https://example.com/mcp" },
  }];
  mock.mockImplementation(async (command, args) => {
    if (command === "mcp_read_connections") return persisted;
    if (command === "mcp_save_connections" && args && "connections" in args) {
      persisted = args.connections as McpConnection[];
      return undefined;
    }
    if (command === "mcp_connect") return { protocolVersion: "2025-11-25" };
    if (command === "mcp_disconnect") return undefined;
    if (command === "mcp_get_prompt") return { messages: [{ role: "user", content: { type: "text", text: "Hello" } }] };
    if (command === "mcp_read_resource") return { contents: [{ uri: "guide://start", text: "Guide contents" }] };
    if (command === "mcp_active_sessions") return [...sessions.values()].flatMap((session) =>
      session.status === "connected" ? [session.sessionId] : [],
    );
    if (command === "mcp_list_entries" && args && "catalog" in args) {
      switch (args.catalog) {
        case "tools": return [{
          name: "add", description: "Add two\r\nvalues.\r\n\r\nReturns\r\nthe total.", inputSchema: { type: "object" }, outputSchema: { type: "object" },
        }, { name: "subtract", inputSchema: { type: "object" } }];
        case "prompts": return [{ name: "greeting", arguments: [{ name: "name", required: true }] }];
        case "resources": return [{ name: "guide", uri: "guide://start" }];
        case "resourceTemplates": return [{ name: "page", uriTemplate: "guide://{page}" }];
      }
    }
    throw new Error(command);
  });
  const host = document.body.appendChild(document.createElement("div"));
  const app = createApp(McpInspector).use(createI18n({
    legacy: false, locale: "zh-CN", messages: locales.messages as I18nOptions["messages"],
  }));
  app.mount(host);
  const tab = (name: string) => Array.from(host.querySelectorAll<HTMLButtonElement>(".workspace-tabs button"))
    .find((button) => button.textContent?.trim() === name);
  const enter = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  try {
    const dialog = host.querySelector("dialog")!;
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new Event("close")); };
    await vi.waitFor(() => expect(host.querySelector(".connection-name")?.textContent).toBe("已保存的服务"));
    expect(mock.mock.calls.some(([command]) => command === "mcp_connect")).toBe(false);
    host.querySelector<HTMLButtonElement>(".connection-add")!.click();
    await nextTick();
    const save = dialog.querySelector<HTMLButtonElement>(".dialog-footer .primary")!;
    enter(dialog.querySelector('[placeholder="node"]')!, "example");
    await nextTick();
    expect(save.disabled).toBe(true);
    enter(dialog.querySelector('[placeholder="my-mcp-server"]')!, "本地示例");
    await nextTick();
    save.click();
    const toggleNew = () => host.querySelector<HTMLButtonElement>('[role="switch"][aria-label$="本地示例"]');
    await vi.waitFor(() => expect(toggleNew()).not.toBeNull());
    expect(persisted.map((item) => item.name)).toEqual(["已保存的服务", "本地示例"]);
    expect(tab("工具")).toBeUndefined();
    toggleNew()!.click();
    await vi.waitFor(() => expect(host.querySelector(".entry-head h3")?.textContent).toBe("add"));
    expect(host.querySelector(".catalog-list h3")).toBeNull();
    expect(host.querySelector(".catalog-list .entry-number")?.textContent).toBe("1.");
    const search = host.querySelector<HTMLInputElement>('.list-actions input[type="search"]')!;
    expect(host.querySelector('.list-actions [aria-label="刷新列表"]')).not.toBeNull();
    enter(search, "missing");
    await nextTick();
    expect(host.querySelector(".catalog-list .entry")).toBeNull();
    host.querySelector<HTMLButtonElement>(".clear-search")!.click();
    await nextTick();
    expect(search.value).toBe("");
    expect(document.activeElement).toBe(search);
    expect(host.querySelector(".catalog-list .entry-number")?.textContent).toBe("1.");
    const description = host.querySelector<HTMLElement>(".entry-head p")!;
    const disclosure = host.querySelector<HTMLButtonElement>(".description-toggle")!;
    expect(description.textContent).toBe("Add two values.\n\nReturns the total.");
    expect(host.querySelector(".workspace-head [aria-haspopup]")).toBeNull();
    expect(host.querySelector('.entry-head [aria-haspopup="dialog"]')).toBeNull();
    expect(host.querySelector('.argument-head [aria-haspopup="dialog"]')).not.toBeNull();
    expect(host.querySelector('.output-head [aria-haspopup="dialog"]')).not.toBeNull();
    disclosure.click();
    await nextTick();
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(description.style.display).toBe("none");
    disclosure.click();
    await nextTick();
    expect(description.style.display).toBe("");
    const otherTool = host.querySelectorAll<HTMLButtonElement>(".catalog-list .entry")[1];
    Object.defineProperty(otherTool, "offsetTop", { value: 28 });
    const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
    const animation = { onfinish: null as (() => void) | null, oncancel: null as (() => void) | null };
    const animate = vi.fn(() => animation);
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    try {
      otherTool.click();
      await nextTick();
      expect(host.querySelector(".entry-head h3")?.textContent).toBe("subtract");
      expect(host.querySelector(".list-items.gliding > .glide-mcp-entry")).not.toBeNull();
      expect(animate).toHaveBeenCalledWith(
        [expect.objectContaining({ top: "0px" }), expect.objectContaining({ top: "28px" })],
        expect.anything(),
      );
      animation.onfinish?.();
      expect(host.querySelector(".list-items.gliding")).toBeNull();
    } finally {
      if (animateDescriptor) Object.defineProperty(HTMLElement.prototype, "animate", animateDescriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, "animate");
    }
    const session = [...sessions.values()][0];
    expect(session.status).toBe("connected");
    const sessionId = "sessionId" in session ? session.sessionId : undefined;
    tab("提示词")!.click();
    await vi.waitFor(() => expect(host.querySelector(".catalog-list .entry")?.textContent).toContain("greeting"));
    expect(host.querySelector(".catalog-list h3")).toBeNull();
    expect(host.querySelector(".catalog-list .entry-number")?.textContent).toBe("1.");
    expect(mock.mock.calls.some(([command]) => command === "mcp_call_tool" || command === "mcp_get_prompt")).toBe(false);
    host.querySelector<HTMLButtonElement>(".catalog-list .entry")!.click();
    await nextTick();
    enter(host.querySelector(".entry-form input")!, "Example");
    host.querySelector("form.entry-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(mock).toHaveBeenCalledWith("mcp_get_prompt", {
      sessionId, name: "greeting", arguments: { name: "Example" },
    }));
    tab("资源")!.click();
    await vi.waitFor(() => {
      expect(host.querySelector(".catalog-list")?.textContent).toContain("资源 URI (1)");
      expect(host.querySelector(".catalog-list")?.textContent).toContain("URI 模板 (1)");
    });
    expect(host.querySelector(".catalog-list h3")).toBeNull();
    expect(Array.from(host.querySelectorAll(".catalog-list .entry-number"), (item) => item.textContent)).toEqual(["1.", "1."]);
    expect(mock.mock.calls.some(([command]) => command === "mcp_call_tool" || command === "mcp_read_resource")).toBe(false);
    host.querySelector<HTMLButtonElement>(".catalog-list .entry")!.click();
    await nextTick();
    host.querySelector("form.entry-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(host.querySelector<HTMLTextAreaElement>(".catalog-details textarea")?.value).toBe("Guide contents"));
    expect(mock).toHaveBeenCalledWith("mcp_read_resource", { sessionId, uri: "guide://start" });
    tab("服务器")!.click();
    await nextTick();
    const toggle = toggleNew()!;
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    toggle.click();
    await vi.waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(mock).toHaveBeenCalledWith("mcp_disconnect", { sessionId });
    expect(tab("工具")).toBeUndefined();
    toggle.closest(".connection-card")!.querySelector<HTMLButtonElement>(".icon-btn")!.click();
    await nextTick();
    const remove = dialog.querySelector<HTMLButtonElement>(".dialog-footer .remove")!;
    remove.click();
    await nextTick();
    remove.click();
    await vi.waitFor(() => expect(toggleNew()).toBeNull());
    expect(persisted.map((item) => item.id)).toEqual(["saved"]);
  } finally {
    app.unmount();
    host.remove();
    connections.value = [];
    sessions.clear();
    mock.mockReset();
  }
});
