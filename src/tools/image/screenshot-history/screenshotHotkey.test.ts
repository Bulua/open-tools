import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  native: new Map<string, (event: { state: string }) => void>(),
  stored: "Ctrl+Shift+A",
  conflict: "",
  invoke: vi.fn(async () => undefined),
  focused: true,
  write: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: state.invoke }));
vi.mock("@/utils/platform", () => ({ isAndroidApp: () => false }));
vi.mock("@/utils/errorToast", () => ({ showError: vi.fn() }));
vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  isRegistered: async (shortcut: string) => state.native.has(shortcut),
  unregister: async (shortcut: string) => { state.native.delete(shortcut); },
  register: async (shortcut: string, callback: (event: { state: string }) => void) => {
    if (state.conflict === shortcut) throw new Error("Shortcut occupied by another app");
    state.native.set(shortcut, callback);
  },
}));

beforeEach(() => {
  vi.resetModules();
  state.native.clear();
  state.stored = "Ctrl+Shift+A";
  state.conflict = "";
  state.focused = true;
  state.invoke.mockClear();
  state.write.mockClear();
  vi.stubGlobal("document", { hasFocus: () => state.focused });
  vi.stubGlobal("localStorage", {
    getItem: () => state.stored,
    setItem: (key: string, value: string) => { state.stored = value; state.write(key, value); },
  });
});

describe("截图全局快捷键与录入框协作", () => {
  it("已注册组合键通过全局回调录入，不启动截图或保存设置", async () => {
    const api = await import("./screenshot");
    await api.registerScreenshotShortcut();
    const recorded = vi.fn();
    api.setScreenshotShortcutRecording(true, recorded);
    state.invoke.mockClear();
    state.native.get("Ctrl+Shift+A")!({ state: "Pressed" });
    expect(recorded).toHaveBeenCalledWith("Ctrl+Shift+A");
    expect(state.invoke).not.toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
    api.setScreenshotShortcutRecording(false);
    state.native.get("Ctrl+Shift+A")!({ state: "Pressed" });
    expect(state.invoke).toHaveBeenCalledWith("screenshot_begin");
  });

  it("热更新遗留的本程序快捷键重新绑定，不误报为外部占用", async () => {
    const old = vi.fn();
    state.native.set("Ctrl+Shift+A", old);
    const api = await import("./screenshot");
    await api.registerScreenshotShortcut();
    state.native.get("Ctrl+Shift+A")!({ state: "Pressed" });
    expect(old).not.toHaveBeenCalled();
    expect(state.invoke).toHaveBeenCalledWith("screenshot_begin");
  });

  it("真正被外部占用时保存失败，原快捷键和持久化设置都保留", async () => {
    const api = await import("./screenshot");
    await api.registerScreenshotShortcut();
    state.conflict = "Ctrl+Alt+S";
    await expect(api.updateScreenshotShortcut("Ctrl+Alt+S")).rejects.toThrow("occupied");
    expect(state.native.has("Ctrl+Shift+A")).toBe(true);
    expect(state.stored).toBe("Ctrl+Shift+A");
    expect(state.write).not.toHaveBeenCalled();
  });

  it("主窗口在后台时，即使编辑状态未收到失焦事件也继续响应截图", async () => {
    const api = await import("./screenshot");
    await api.registerScreenshotShortcut();
    const recorded = vi.fn();
    api.setScreenshotShortcutRecording(true, recorded);
    state.focused = false;
    state.native.get("Ctrl+Shift+A")!({ state: "Pressed" });
    expect(recorded).not.toHaveBeenCalled();
    expect(state.invoke).toHaveBeenCalledWith("screenshot_begin");
  });
});
