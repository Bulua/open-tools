import { beforeEach, describe, expect, it, vi } from "vitest";

const { platform, getVersion, check } = vi.hoisted(() => ({
  platform: vi.fn<() => "desktop" | "android" | "web">(),
  getVersion: vi.fn().mockResolvedValue("0.11.1"),
  check: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/platform", () => ({ getAppPlatform: platform }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("在线更新的平台限制", () => {
  it.each(["android", "web"] as const)("%s 不启动更新检查", async (target) => {
    platform.mockReturnValue(target);
    const { useUpdater } = await import("./useUpdater");
    const updater = useUpdater();
    expect(updater.supported).toBe(false);

    vi.useFakeTimers();
    try {
      updater.startAutoCheck();
      expect(vi.getTimerCount()).toBe(0);
      await updater.checkForUpdate();
      expect(updater.status.value).toBe("idle");
      expect(getVersion).not.toHaveBeenCalled();
      expect(check).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("桌面版仍能手动检查更新", async () => {
    platform.mockReturnValue("desktop");
    const { useUpdater } = await import("./useUpdater");
    const updater = useUpdater();
    expect(updater.supported).toBe(true);

    await updater.checkForUpdate();
    expect(updater.currentVersion.value).toBe("0.11.1");
    expect(check).toHaveBeenCalledOnce();
    expect(updater.status.value).toBe("latest");
  });
});
