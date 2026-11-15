// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { notifyDesktop } from "./desktopNotification";

const native = vi.hoisted(() => ({ desktop: true, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.desktop, invoke: native.invoke }));
afterEach(() => { vi.restoreAllMocks(); native.invoke.mockReset(); native.desktop = true; });

it("Windows 桌面版通过公共原生命令发送标题和正文", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0");
  native.invoke.mockResolvedValue(undefined);
  await notifyDesktop("时钟提醒", "09:00 · 起床");
  expect(native.invoke).toHaveBeenCalledExactlyOnceWith("desktop_notify", { title: "时钟提醒", body: "09:00 · 起床" });
});

it("网页和非 Windows 环境不调用 Windows 命令", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0");
  native.desktop = false;
  await notifyDesktop("标题", "正文");
  native.desktop = true;
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Linux Android");
  await notifyDesktop("标题", "正文");
  expect(native.invoke).not.toHaveBeenCalled();
});

it("通知失败返回错误，交给调用者提示", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0");
  native.invoke.mockRejectedValue(new Error("Toast unavailable"));
  await expect(notifyDesktop("标题", "正文")).rejects.toThrow("Toast unavailable");
});
