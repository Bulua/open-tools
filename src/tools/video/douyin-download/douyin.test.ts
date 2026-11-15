import { describe, expect, it } from "vitest";
import { douyinBaseName, imageExt, parseDouyinRef, toItem, withoutWatermark, type RawAweme } from "./douyin";

describe("抖音：解析链接", () => {
  it("分享文案中的短链接", () => {
    const text = "1.56 复制打开抖音，看看【6+1的图文作品】最好的jee # 电竞解说 ... https://v.douyin.com/pnt3ingCOyQ/ OXm:/ :2pm 05/29 R@x.fo";
    expect(parseDouyinRef(text)).toEqual({ shortUrl: "https://v.douyin.com/pnt3ingCOyQ/" });
  });

  it("作品页、分享页、弹窗链接、纯编号", () => {
    expect(parseDouyinRef("https://www.iesdouyin.com/share/note/7695639745892973425/?from_ssr=1")).toEqual({ id: "7695639745892973425", kind: "note" });
    expect(parseDouyinRef("https://www.douyin.com/video/7300000000000000000")).toEqual({ id: "7300000000000000000", kind: "video" });
    expect(parseDouyinRef("https://www.douyin.com/user/xx?modal_id=7300000000000000001")).toEqual({ id: "7300000000000000001" });
    expect(parseDouyinRef("7300000000000000002")).toEqual({ id: "7300000000000000002" });
  });

  it("无效内容给出提示", () => {
    expect(() => parseDouyinRef("")).toThrow("请粘贴");
    expect(() => parseDouyinRef("https://www.bilibili.com/video/BV1xx")).toThrow("没有找到抖音作品");
  });
});

describe("抖音：无水印地址", () => {
  it("playwm 换成 play", () => {
    expect(withoutWatermark("https://aweme.snssdk.com/aweme/v1/playwm/?video_id=v0&ratio=720p")).toBe("https://aweme.snssdk.com/aweme/v1/play/?video_id=v0&ratio=720p");
    expect(withoutWatermark("https://x.com/a?watermark=1&b=2")).toBe("https://x.com/a?watermark=0&b=2");
  });

  const raw = (patch: Partial<RawAweme>): RawAweme => ({
    id: "1",
    desc: "好看的视频 #旅行 #风景",
    author: "作者",
    createTime: 1700000000,
    cover: "https://p3/cover.jpeg",
    duration: 15300,
    width: 720,
    height: 1280,
    video: ["https://aweme.snssdk.com/aweme/v1/playwm/?video_id=v0"],
    rates: [],
    images: [],
    music: { title: "", urls: [] },
    ...patch,
  });

  it("视频：多码率中选 H.264 最高的一档，play 地址作为备用", () => {
    const item = toItem(
      raw({
        rates: [
          { urls: ["https://v/h265-1080"], bitrate: 3000000, h265: true, width: 1080, height: 1920 },
          { urls: ["https://v/h264-720"], bitrate: 1200000, h265: false, width: 720, height: 1280 },
          { urls: ["https://v/h264-1080"], bitrate: 2500000, h265: false, width: 1080, height: 1920 },
        ],
      }),
    );
    expect(item.type).toBe("video");
    expect(item.videoUrls).toEqual(["https://v/h264-1080", "https://aweme.snssdk.com/aweme/v1/play/?video_id=v0"]);
    expect(item.resolution).toBe("1080×1920");
    expect(item.duration).toBe(15);
  });

  it("图文：JPEG 地址排在前面，实况照片的视频去水印", () => {
    const item = toItem(
      raw({
        video: [],
        images: [
          { urls: ["https://p/a.webp", "https://p/a.jpeg"], width: 1, height: 1, live: [] },
          { urls: ["https://p/b.heic", "https://p/b.webp"], width: 1, height: 1, live: ["https://x/playwm/?id=2"] },
          { urls: [], width: 0, height: 0, live: [] },
        ],
      }),
    );
    expect(item.type).toBe("images");
    expect(item.images.map((i) => i.urls[0])).toEqual(["https://p/a.jpeg", "https://p/b.webp"]);
    expect(item.images[1].live).toEqual(["https://x/play/?id=2"]);
  });

  it("文件名去掉话题标签", () => {
    expect(douyinBaseName(toItem(raw({})))).toBe("好看的视频");
    expect(douyinBaseName(toItem(raw({ desc: "#只有话题" })))).toBe("抖音_1");
  });

  it("按内容判断图片格式", () => {
    expect(imageExt(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("jpg");
    expect(imageExt(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("png");
    expect(imageExt(new TextEncoder().encode("RIFF....WEBPVP8 "))).toBe("webp");
  });
});
