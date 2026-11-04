import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveToFolder } from "./saveFile";

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
  });

  it("取消选择时不写入文件", async () => {
    open.mockResolvedValue(null);

    expect(await saveToFolder([{ parts: ["a.txt"], data: new Uint8Array() }])).toBeNull();
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
});
