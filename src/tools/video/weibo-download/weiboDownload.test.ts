// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";
import { parseWeiboRef, weiboAdapter } from "./weiboDownload";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

const oid = "1034:4967272104787984";
const hd = "https://f.video.weibocdn.com/hd.mp4?template=1280x720.25.0";
const sd = "https://f.video.weibocdn.com/sd.mp4?template=640x360.25.0";
const responseForVideo = (title: string) => Response.json({
  data: { Component_Play_Playinfo: {
    title, duration_time: 42,
    urls: { sd, hd, hls: "https://f.video.weibocdn.com/video.m3u8", foreign: "https://example.org/file.mp4" },
  } },
});

beforeEach(() => vi.mocked(fetch).mockReset());

test("从分享文案提取帖子和视频页链接，并拒绝仿冒域名", () => {
  expect(parseWeiboRef("分享：https://t.cn/A6WTpbEu，原帖 m.weibo.cn/detail/4967273022359838。"))
    .toEqual({ kind: "post", id: "4967273022359838" });
  expect(parseWeiboRef(`https://video.weibo.com/show?fid=${encodeURIComponent(oid)}`)).toEqual({ kind: "video", id: oid });
  expect(() => parseWeiboRef("https://m.weibo.cn.example.org/detail/123")).toThrow();
});

test("短链跳转到视频页后发送表单，按实际 MP4 分辨率排列画质", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.redirect(`https://h5.video.weibo.com/show/${oid}`))
    .mockResolvedValueOnce(responseForVideo("第一段 &amp; 第二段"));
  const [item] = await weiboAdapter.parse("https://t.cn/A6WTpbEu");
  expect(item).toMatchObject({ id: oid, desc: "第一段 & 第二段", duration: 42, videoUrls: [hd, sd] });
  expect(item.videoQualities?.map(quality => quality.resolution)).toEqual(["1280×720", "640×360"]);
  const [, options] = vi.mocked(fetch).mock.calls[1];
  expect(options?.method).toBe("POST");
  expect(JSON.parse((options?.body as URLSearchParams).get("data")!)).toEqual({ Component_Play_Playinfo: { oid } });
});

test("短链拒绝跳转到非微博站点，视频页失败时仍可下载帖子提供的 MP4", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.redirect("https://example.org/video"));
  await expect(weiboAdapter.parse("https://t.cn/example")).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ ok: 1, data: {
      text: "微博正文", page_info: { object_id: oid, media_info: { stream_url: sd, duration: "20" } },
    } }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockResolvedValueOnce(new Response("服务端错误"))
    .mockResolvedValueOnce(new Response("0000ftypisom"));
  const [item] = await weiboAdapter.parse("https://weibo.com/7610808848/Nse4S9TTU");
  expect(item).toMatchObject({ id: oid, desc: "微博正文", duration: 20, videoUrls: [sd] });
  const bytes = await weiboAdapter.download([hd, sd], "video", undefined, undefined);
  expect(new TextDecoder().decode(bytes)).toBe("0000ftypisom");
});

test("封面带微博来源读取，拒绝伪装成成功响应的网页", async () => {
  const url = "https://wx1.sinaimg.cn/large/cover.jpg";
  const signal = new AbortController().signal;
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(Uint8Array.of(255, 216, 255, 224), { headers: { "Content-Type": "image/jpeg" } }))
    .mockResolvedValueOnce(new Response("<html>Forbidden</html>", { headers: { "Content-Type": "text/html" } }));
  await expect(weiboAdapter.loadCover(url, signal)).resolves.toMatchObject({ type: "image/jpeg", size: 4 });
  expect(fetch).toHaveBeenCalledWith(url, { headers: expect.arrayContaining([["Referer", "https://m.weibo.cn/"]]), signal });
  await expect(weiboAdapter.loadCover(url, signal)).rejects.toThrow("Invalid cover image");
});
