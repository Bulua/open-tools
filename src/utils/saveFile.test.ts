import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveToFolder } from "./saveFile";
import { recordToolUsage } from "@/composables/toolLibrary";
vi.mock("@/composables/toolLibrary", () => ({ recordToolUsage: vi.fn() }));

const { open, mkdir, writeFile, join } = vi.hoisted(() => ({
  open: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  join: vi.fn((...parts: string[]) => parts.join("/")),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
vi.mock("@tauri-apps/plugin-fs", () => ({ mkdir, writeFile }));
vi.mock("@tauri-apps/api/path", () => ({ join }));

describe("saveToFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    open.mockResolvedValue("C:/output");
  });

  it("选择目录时授权子目录，并按包内结构写入文件", async () => {
    const data = new Uint8Array([1, 2, 3]);

    expect(await saveToFolder([{ parts: ["motion-showreel", "README.md"], data }])).toBe("C:/output");
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ directory: true, recursive: true }));
    expect(mkdir).toHaveBeenCalledWith("C:/output/motion-showreel", { recursive: true });
    expect(writeFile).toHaveBeenCalledWith("C:/output/motion-showreel/README.md", data);
    expect(recordToolUsage).toHaveBeenCalledTimes(1);
  });

  it("取消选择时不写入文件", async () => {
    open.mockResolvedValue(null);

    expect(await saveToFolder([{ parts: ["a.txt"], data: new Uint8Array() }])).toBeNull();
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(recordToolUsage).not.toHaveBeenCalled();
  });

  it("写入失败时不记录使用次数", async () => {
    writeFile.mockRejectedValueOnce(new Error("写入失败"));
    await expect(saveToFolder([{ parts: ["a.txt"], data: new Uint8Array() }])).rejects.toThrow("写入失败");
    expect(recordToolUsage).not.toHaveBeenCalled();
  });
});
