// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import { downloadXiaohongshu, getXiaohongshuItem, type XiaohongshuItem } from "../../xiaohongshu-download/xiaohongshu";
import { downloadFirst, getDouyinItem } from "../../douyin-download/douyin";
import { revealDownloadedMedia, saveDownloadedMedia } from "../downloadStorage";
import type { VideoQuality } from "../videoQuality";
import DouyinDownload from "../../douyin-download/DouyinDownload.vue";
import XiaohongshuDownload from "../../xiaohongshu-download/XiaohongshuDownload.vue";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("../../xiaohongshu-download/xiaohongshu", () => ({ getXiaohongshuItem: vi.fn(), downloadXiaohongshu: vi.fn(), xiaohongshuBaseName: () => "测试作品", xiaohongshuCoverExt: () => "jpg" }));
vi.mock("../../douyin-download/douyin", () => ({ getDouyinItem: vi.fn(), downloadFirst: vi.fn(), douyinBaseName: () => "测试作品", imageExt: () => "jpg" }));
vi.mock("../downloadStorage", () => ({ downloadBaseName: (name: string, id: string) => `${name}_${id}`, saveDownloadedMedia: vi.fn(), revealDownloadedMedia: vi.fn(), releaseSavedMedia: vi.fn() }));
vi.mock("@/utils/errorToast", () => ({ showError: vi.fn() }));

let dispose: (() => void) | undefined;
const data = new Uint8Array([1, 2, 3]);
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:preview"), configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
  vi.mocked(downloadXiaohongshu).mockResolvedValue(data);
  vi.mocked(downloadFirst).mockResolvedValue({ data, url: "https://cdn.test/video.mp4" });
  vi.mocked(saveDownloadedMedia).mockImplementation(async (platform, name, _data, kind) => ({ name, kind, path: `D:/App/data/videos/${platform}/${name}`, url: `https://asset.localhost/${platform}/${name}` }));
});
afterEach(() => { dispose?.(); dispose = undefined; });
function mount(platform: "douyin" | "xhs") {
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp(() => h(platform === "douyin" ? DouyinDownload : XiaohongshuDownload)).use(i18n);
  app.mount(root);
  dispose = () => { app.unmount(); root.remove(); };
  return root;
}
function button(root: Element, label: string) {
  return [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
}
async function parse(root: HTMLElement, id: string, images = false, videoQualities?: VideoQuality[]) {
  const item: XiaohongshuItem = { id, type: images ? "images" : "video", desc: "测试作品", author: "作者", createTime: 0, cover: "https://cdn.test/cover.jpg", duration: 10, resolution: "1080×1920", videoUrls: ["https://cdn.test/video.mp4"], images: images ? [{ urls: ["https://cdn.test/1.jpg"], live: [] }, { urls: ["https://cdn.test/2.jpg"], live: [] }] : [] };
  item.videoQualities = videoQualities;
  vi.mocked(getXiaohongshuItem).mockResolvedValueOnce(item);
  vi.mocked(getDouyinItem).mockResolvedValueOnce({ ...item, music: { title: "", urls: [] } });
  const input = root.querySelector<HTMLInputElement>(".link")!;
  input.value = id;
  input.dispatchEvent(new Event("input"));
  await nextTick();
  button(root, "解析").click();
  await vi.waitFor(() => expect(button(root, "解析").disabled).toBe(true));
}

it.each(["douyin", "xhs"] as const)("%s 无需选择内容和目录，视频下载后从本地播放并可定位文件", async (platform) => {
  const root = mount(platform);
  await parse(root, "note1");
  await parse(root, "note1");
  expect(root.querySelectorAll("article")).toHaveLength(1);
  expect(root.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  expect(root.querySelector("aside")?.textContent).toContain("清晰度");
  expect(root.querySelector("aside")?.textContent).toContain("编码");
  button(root, "下载").click();
  await vi.waitFor(() => expect(root.querySelector("article.done")).not.toBeNull());
  expect(saveDownloadedMedia).toHaveBeenCalledExactlyOnceWith(platform, "测试作品_note1.mp4", data, "video");
  button(root, "播放").click();
  await nextTick();
  expect(root.querySelector("video")?.getAttribute("src")).toContain("asset.localhost");
  button(root, "打开文件夹").click();
  expect(revealDownloadedMedia).toHaveBeenCalledWith(expect.objectContaining({ path: `D:/App/data/videos/${platform}/测试作品_note1.mp4` }));
});

it.each(["douyin", "xhs"] as const)("%s 左侧画质和编码设置影响实际下载地址，不混入其他画质", async (platform) => {
  const root = mount(platform);
  const qualities: VideoQuality[] = [
    { id: "1080-avc", width: 1080, height: 1920, resolution: "1080×1920", codec: "avc", urls: ["https://cdn.test/1080-avc.mp4"] },
    { id: "1080-hevc", width: 1080, height: 1920, resolution: "1080×1920", codec: "hevc", urls: ["https://cdn.test/1080-hevc.mp4"] },
    { id: "720-avc", width: 720, height: 1280, resolution: "720×1280", codec: "avc", urls: ["https://cdn.test/720-avc.mp4"] },
  ];
  await parse(root, "quality", false, qualities);
  const selectors = root.querySelectorAll<HTMLButtonElement>("aside .app-select");
  selectors[1].click(); await nextTick();
  const hevc = [...document.querySelectorAll<HTMLElement>(".select-menu .option")].find((o) => o.textContent?.includes("H.265"))!;
  hevc.click(); await nextTick();
  button(root, "下载").click();
  await vi.waitFor(() => expect(root.querySelector("article.done")).not.toBeNull());
  const download = platform === "douyin" ? downloadFirst : downloadXiaohongshu;
  expect(vi.mocked(download).mock.calls[0][0]).toEqual(["https://cdn.test/1080-hevc.mp4"]);
  selectors[0].click(); await nextTick();
  const lower = [...document.querySelectorAll<HTMLElement>(".select-menu .option")].find((o) => o.textContent?.trim() === "720P")!;
  lower.click(); await nextTick();
  button(root, "重新下载").click();
  await vi.waitFor(() => expect(vi.mocked(download).mock.calls).toHaveLength(2));
  expect(vi.mocked(download).mock.calls[1][0]).toEqual(["https://cdn.test/720-avc.mp4"]);
});

it.each(["douyin", "xhs"] as const)("%s 自动下载图集的全部图片，完成后浏览本地原图", async (platform) => {
  const root = mount(platform);
  await parse(root, "photos", true);
  button(root, "下载").click();
  await vi.waitFor(() => expect(root.querySelector("article.done")).not.toBeNull());
  expect(saveDownloadedMedia).toHaveBeenCalledTimes(2);
  expect(saveDownloadedMedia).toHaveBeenNthCalledWith(1, platform, "测试作品_photos_01.jpg", data, "image");
  expect(saveDownloadedMedia).toHaveBeenNthCalledWith(2, platform, "测试作品_photos_02.jpg", data, "image");
  button(root, "浏览").click();
  await nextTick();
  expect(root.querySelector(".screen img")?.getAttribute("src")).toContain("_01.jpg");
  root.querySelector<HTMLButtonElement>(".next")!.click();
  await nextTick();
  expect(root.querySelector(".screen img")?.getAttribute("src")).toContain("_02.jpg");
});

it("每张卡片单独显示下载进度，取消不保存文件", async () => {
  const root = mount("xhs");
  await parse(root, "one");
  await parse(root, "two");
  const signals: AbortSignal[] = [];
  vi.mocked(downloadXiaohongshu).mockImplementation((_urls, _kind, progress, signal) => {
    signals.push(signal!);
    progress?.(5, 10);
    return new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(new Error("取消"))));
  });
  const cards = [...root.querySelectorAll("article")];
  button(cards[0], "下载").click();
  button(cards[1], "下载").click();
  await nextTick();
  expect(root.querySelectorAll(".download-progress")).toHaveLength(2);
  expect(root.querySelector(".results-overlay")).toBeNull();
  button(cards[0], "取消").click();
  await vi.waitFor(() => expect(cards[0].querySelector(".status.bad")?.textContent).toContain("取消"));
  expect(signals[0].aborted).toBe(true);
  expect(signals[1].aborted).toBe(false);
  expect(saveDownloadedMedia).not.toHaveBeenCalled();
});

it("小红书视频预览经程序 HTTP 通道读取，重复打开使用缓存，关闭时取消加载", async () => {
  const root = mount("xhs");
  await parse(root, "preview");
  button(root, "播放").click();
  await vi.waitFor(() => expect(root.querySelector("video")?.getAttribute("src")).toBe("blob:preview"));
  expect(downloadXiaohongshu).toHaveBeenCalledTimes(1);
  root.querySelector<HTMLButtonElement>(".viewer-head .icon-btn")!.click(); await nextTick();
  button(root, "播放").click(); await nextTick();
  expect(root.querySelector("video")?.getAttribute("src")).toBe("blob:preview");
  expect(downloadXiaohongshu).toHaveBeenCalledTimes(1);
  root.querySelector<HTMLButtonElement>(".viewer-head .icon-btn")!.click(); await nextTick();
  await parse(root, "pending-preview");
  let signal: AbortSignal | undefined;
  vi.mocked(downloadXiaohongshu).mockImplementation((_urls, _kind, _progress, value) => {
    signal = value;
    return new Promise((_resolve, reject) => value!.addEventListener("abort", () => reject(new Error("取消"))));
  });
  button(root.querySelector("article")!, "播放").click(); await nextTick();
  expect(root.querySelector(".screen-state")?.textContent).toContain("加载预览");
  root.querySelector<HTMLButtonElement>(".viewer-head .icon-btn")!.click(); await nextTick();
  expect(signal?.aborted).toBe(true);
  expect(root.querySelector(".viewer")).toBeNull();
});

it("小红书图集预览使用轻量地址，下载仍使用源图地址", async () => {
  const root = mount("xhs");
  const item: XiaohongshuItem = { id: "photo-preview", type: "images", desc: "测试", author: "作者", createTime: 0, cover: "https://cdn.test/thumb.webp", duration: 0, resolution: "", videoUrls: [], images: [{ urls: ["https://cdn.test/source.jpg"], previewUrls: ["https://cdn.test/preview.webp"], live: [] }] };
  vi.mocked(getXiaohongshuItem).mockResolvedValueOnce(item);
  const input = root.querySelector<HTMLInputElement>(".link")!;
  input.value = "photo-preview"; input.dispatchEvent(new Event("input")); await nextTick(); button(root, "解析").click();
  await vi.waitFor(() => expect(root.querySelector("article")).not.toBeNull());
  expect(root.querySelector(".thumb img")?.getAttribute("src")).toBe("https://cdn.test/thumb.webp");
  button(root, "浏览").click();
  await vi.waitFor(() => expect(root.querySelector(".screen img")?.getAttribute("src")).toBe("blob:preview"));
  expect(vi.mocked(downloadXiaohongshu).mock.calls[0][0]).toEqual(["https://cdn.test/preview.webp"]);
  root.querySelector<HTMLButtonElement>(".viewer-head .icon-btn")!.click(); await nextTick();
  button(root, "下载").click();
  await vi.waitFor(() => expect(root.querySelector("article.done")).not.toBeNull());
  expect(vi.mocked(downloadXiaohongshu).mock.calls[1][0]).toEqual(["https://cdn.test/source.jpg"]);
});
