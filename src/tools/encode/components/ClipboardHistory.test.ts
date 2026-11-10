// @vitest-environment jsdom
import { createApp } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import ClipboardHistory from "./ClipboardHistory.vue";

const native = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke, isTauri: () => false }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ listen: native.listen }),
}));

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  vi.resetAllMocks();
});

it.each([true, false])("删除后只查询一次历史（事件订阅成功：%s）", async (subscribed) => {
  const entry = { id: 1, preview: "文本", copiedAt: new Date(2026, 10, 10, 12).getTime() };
  let entries = [entry];
  let changed: (() => void) | undefined;
  native.listen.mockImplementation(async (_event: string, callback: () => void) => {
    if (!subscribed) throw new Error("Subscription unavailable");
    changed = callback;
    return () => { changed = undefined; };
  });
  native.invoke.mockImplementation(async (command: string) => {
    if (command === "clipboard_history_list") return { entries, enabled: true, maxItems: 200, error: null };
    if (command === "clipboard_history_update") {
      entries = [];
      changed?.();
    }
  });

  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp(ClipboardHistory).use(i18n);
  app.mount(root);
  unmount = () => { app.unmount(); root.remove(); };
  await vi.waitFor(() => expect(root.querySelectorAll(".history-card")).toHaveLength(1));

  root.querySelector<HTMLButtonElement>(".delete-button")!.click();
  await vi.waitFor(() => expect(root.querySelectorAll(".history-card")).toHaveLength(0));
  expect(native.invoke.mock.calls.map(([command]) => command)).toEqual([
    "clipboard_history_list",
    "clipboard_history_update",
    "clipboard_history_list",
  ]);
});
