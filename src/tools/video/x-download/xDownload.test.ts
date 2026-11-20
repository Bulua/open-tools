import { expect, test, vi } from "vitest";
import { fetchBytes } from "@/tools/network/shared/transport";
import { parseXRef, toXItems, xAdapter } from "./xDownload";

vi.mock("@/tools/network/shared/transport", () => ({ fetchBytes: vi.fn() }));

const id = "2103382268051964103";
const first = "https://video.twimg.com/ext_tw_video/1/pu/vid/1280x720/first.mp4";
const second = "https://video.twimg.com/ext_tw_video/2/pu/vid/640x360/second.mp4";
const video = (url: string, bitrate = 1000) => ({ url, bitrate, content_type: "video/mp4" });
const post = {
  __typename: "Tweet",
  user: { name: "Example" },
  mediaDetails: [
    { type: "photo" },
    { type: "video", video_info: { variants: [
      video(second, 300), video(first), video("https://example.org/video.mp4", 2000),
    ] } },
    { type: "animated_gif", video_info: { variants: [video(second)] } },
  ],
};

test("识别 X、Twitter 分享链接，并限定为真实帖子域名", () => {
  expect(parseXRef(`分享： https://x.com/test/status/${id}?s=20`).id).toBe(id);
  expect(parseXRef(`twitter.com/i/web/status/${id}/video/2`)).toEqual({ id, video: 2 });
  expect(() => parseXRef(`https://x.com.example.org/test/status/${id}`)).toThrow();
  expect(() => parseXRef(`https://example.org/x.com/test/status/${id}`)).toThrow();
});

test("列出帖子中各段视频和可用画质，读取明确指定的序号", () => {
  expect(toXItems({ id }, post).map(item => ({ id: item.id, urls: item.videoUrls, resolution: item.resolution }))).toEqual([
    { id: `${id}_1`, urls: [first, second], resolution: "1280×720" },
    { id: `${id}_2`, urls: [second], resolution: "640×360" },
  ]);
  expect(toXItems({ id, video: 2 }, post).map(item => item.id)).toEqual([`${id}_2`]);
  expect(() => toXItems({ id }, { __typename: "TweetTombstone" })).toThrow();
});

test("解析公开嵌入响应，下载时跳过无效文件并返回 MP4", async () => {
  const mp4 = new TextEncoder().encode("0000ftypisom");
  vi.mocked(fetchBytes)
    .mockResolvedValueOnce({ data: new TextEncoder().encode(JSON.stringify(post)), url: "", headers: [] })
    .mockResolvedValueOnce({ data: new TextEncoder().encode("<html>error</html>"), url: first, headers: [] })
    .mockResolvedValueOnce({ data: mp4, url: second, headers: [] });
  const items = await xAdapter.parse(`https://x.com/example/status/${id}`);
  expect(items).toHaveLength(2);
  const [request] = vi.mocked(fetchBytes).mock.calls[0];
  expect(new URL(request).hostname).toBe("cdn.syndication.twimg.com");
  expect(new URL(request).searchParams.get("id")).toBe(id);
  await expect(xAdapter.download([first, second], "video")).resolves.toEqual(mp4);
});
