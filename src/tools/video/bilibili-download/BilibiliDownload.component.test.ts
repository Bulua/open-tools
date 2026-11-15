// @vitest-environment jsdom
import { createApp, nextTick } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import { downloadStream, getLoginInfo, getPlayInfo, getPreviewUrl, getVideoInfo, muxToMp4, type PlayInfo } from "./bilibili";
import { revealDownloadedMedia, saveDownloadedMedia } from "../shared/downloadStorage";
import BilibiliDownload from "./BilibiliDownload.vue";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("./bilibili", async (original) => ({
  ...await original<typeof import("./bilibili")>(),
  getLoginInfo: vi.fn(), getPlayInfo: vi.fn(), getPreviewUrl: vi.fn(), getVideoInfo: vi.fn(), downloadStream: vi.fn(), muxToMp4: vi.fn(),
}));
vi.mock("../shared/downloadStorage", () => ({ downloadBaseName: (name: string, id: string) => `${name}_${id}`, saveDownloadedMedia: vi.fn(), revealDownloadedMedia: vi.fn(), releaseSavedMedia: vi.fn() }));
vi.mock("@/utils/errorToast", () => ({ showError: vi.fn() }));

let dispose: (() => void) | undefined;
const data = new Uint8Array([1, 2, 3]);
const play: PlayInfo = {
  videos: [{ id: 80, url: "https://cdn.test/video", backup: [], bandwidth: 100, codecid: 7 }],
  audios: [{ id: 1, url: "https://cdn.test/audio", backup: [], bandwidth: 50 }], files: [], qualities: [{ id: 80, label: "1080P" }],
};
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  vi.mocked(getLoginInfo).mockResolvedValue({ isLogin: false, name: "", vip: false });
  vi.mocked(getVideoInfo).mockResolvedValue({ info: {
    bvid: "BV1test", aid: 1, title: "测试视频", cover: "https://cdn.test/cover.jpg", owner: "作者", desc: "", duration: 20, pubdate: 1700000000,
    pages: [{ cid: 101, page: 1, part: "第一部分", duration: 10 }, { cid: 102, page: 2, part: "第二部分", duration: 10 }],
  } });
  vi.mocked(getPlayInfo).mockResolvedValue(play);
  vi.mocked(downloadStream).mockResolvedValue(data);
  vi.mocked(muxToMp4).mockResolvedValue(data);
  vi.mocked(saveDownloadedMedia).mockImplementation(async (platform, name, _data, kind) => ({ name, kind, path: `D:/App/data/videos/${platform}/${name}`, url: `https://asset.localhost/${name}` }));
});
afterEach(() => { dispose?.(); dispose = undefined; });
const button = (root: Element, name: string) => [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!;
async function mountAndParse() {
  const root = document.createElement("div"); document.body.append(root);
  const app = createApp(BilibiliDownload).use(i18n); app.mount(root);
  dispose = () => { app.unmount(); root.remove(); };
  const input = root.querySelector<HTMLInputElement>(".link")!;
  input.value = "https://www.bilibili.com/video/BV1test"; input.dispatchEvent(new Event("input"));
  await nextTick(); button(root, "解析").click();
  await vi.waitFor(() => expect(root.querySelector("article")).not.toBeNull());
  return root;
}

it("左侧保留清晰度、编码和登录，自动下载多 P，完成后从本地播放", async () => {
  const root = await mountAndParse();
  const panel = root.querySelector("aside")!;
  expect(panel.textContent).toContain("清晰度");
  expect(panel.textContent).toContain("编码");
  expect(panel.textContent).toContain("登录");
  expect(panel.querySelector('input[placeholder="SESSDATA"]')).not.toBeNull();
  expect(panel.querySelector('input[type="checkbox"]')).toBeNull();
  expect(panel.textContent).not.toContain("保存位置");
  const start = [...root.querySelectorAll(".foot button")].find((b) => b.textContent?.includes("下载")) as HTMLButtonElement;
  start.click();
  await vi.waitFor(() => expect(root.querySelector("article.done")).not.toBeNull());
  expect(saveDownloadedMedia).toHaveBeenCalledTimes(2);
  expect(saveDownloadedMedia).toHaveBeenCalledWith("bilibili", expect.stringContaining("BV1test_101.mp4"), data, "video");
  expect(saveDownloadedMedia).toHaveBeenCalledWith("bilibili", expect.stringContaining("BV1test_102.mp4"), data, "video");
  button(root, "播放").click(); await nextTick();
  expect(root.querySelector("video")?.getAttribute("src")).toContain("asset.localhost");
  expect(getPreviewUrl).not.toHaveBeenCalled();
  button(root, "打开文件夹").click();
  expect(revealDownloadedMedia).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining("data/videos/bilibili") }));
});

it("下载进度留在作品卡片，取消后不合并或保存", async () => {
  const root = await mountAndParse();
  let signal: AbortSignal | undefined;
  vi.mocked(downloadStream).mockImplementation((_stream, _session, progress, abortSignal) => {
    signal = abortSignal; progress?.(50, 100);
    return new Promise((_resolve, reject) => abortSignal!.addEventListener("abort", () => reject(new Error("取消"))));
  });
  ([...root.querySelectorAll(".foot button")].find((b) => b.textContent?.includes("下载")) as HTMLButtonElement).click();
  await vi.waitFor(() => expect(root.querySelector("article .download-progress")).not.toBeNull());
  expect(root.querySelector(".results-overlay")).toBeNull();
  button(root, "取消").click();
  await vi.waitFor(() => expect(root.querySelector("article.error")).not.toBeNull());
  expect(signal?.aborted).toBe(true);
  expect(muxToMp4).not.toHaveBeenCalled();
  expect(saveDownloadedMedia).not.toHaveBeenCalled();
});
