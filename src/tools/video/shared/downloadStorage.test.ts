import { beforeEach, expect, it, vi } from "vitest";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { saveFile, saveIntoFolder } from "@/utils/saveFile";
import { downloadBaseName, releaseSavedMedia, saveDownloadedMedia } from "./downloadStorage";

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: vi.fn((path) => `asset:${path}`), invoke: vi.fn(), isTauri: vi.fn(() => true) }));
vi.mock("@/utils/saveFile", () => ({ saveFile: vi.fn(), saveIntoFolder: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ join: vi.fn(async (...parts) => parts.join("/")) }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(isTauri).mockReturnValue(true); });

it.each(["douyin", "bilibili", "xhs"] as const)("%s 从原生端获取 data 子目录并生成本地播放地址", async (platform) => {
  const folder = `D:/OpenTools/data/videos/${platform}`;
  vi.mocked(invoke).mockResolvedValue(folder);
  const data = new Uint8Array([1, 2, 3]);
  const file = await saveDownloadedMedia(platform, "视频.mp4", data, "video");
  expect(invoke).toHaveBeenCalledWith("video_download_dir", { platform });
  expect(saveIntoFolder).toHaveBeenCalledWith(folder, "视频.mp4", data);
  expect(convertFileSrc).toHaveBeenCalledWith(`${folder}/视频.mp4`);
  expect(file.path).toBe(`${folder}/视频.mp4`);
  expect(saveFile).not.toHaveBeenCalled();
});

it("原生目录创建失败时不弹出另存为，也不误报保存成功", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("Can't create folder"));
  await expect(saveDownloadedMedia("xhs", "视频.mp4", new Uint8Array(), "video")).rejects.toThrow("Can't create folder");
  expect(saveIntoFolder).not.toHaveBeenCalled();
  expect(saveFile).not.toHaveBeenCalled();
});

it("同名作品以编号区分，网页预览释放 Blob 地址", () => {
  expect(downloadBaseName("同名视频", "one")).not.toBe(downloadBaseName("同名视频", "two"));
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  releaseSavedMedia([{ name: "a", kind: "video", path: "", url: "blob:test" }, { name: "b", kind: "video", path: "D:/b", url: "asset:local" }]);
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:test");
  revoke.mockRestore();
});
