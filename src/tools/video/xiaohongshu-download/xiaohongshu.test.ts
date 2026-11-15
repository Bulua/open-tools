import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { fetchBytes } from "@/tools/network/shared/transport";
import { downloadXiaohongshu, getXiaohongshuItem, parseXiaohongshuPage, parseXiaohongshuRef, xiaohongshuBaseName, xiaohongshuCoverExt, xiaohongshuImageSources, xiaohongshuItem } from "./xiaohongshu";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => false), invoke: vi.fn() }));
vi.mock("@/tools/network/shared/transport", () => ({ fetchBytes: vi.fn() }));
const id = "6411cf99000000001300b6d9";
const url = `https://www.xiaohongshu.com/explore/${id}?xsec_token=a%2Bb%3D&xsec_source=app_share`;
const stream = (overrides = {}) => ({ masterUrl: "https://sns-video.xhscdn.com/video.mp4", width: 1080, height: 1920, videoCodec: "h264", duration: 12000, ...overrides });
const state = (overrides = {}) => ({ note: { noteDetailMap: { [id]: { note: {
  type: "video", title: "测试视频", desc: "说明", time: 1700000000000, user: { nickname: "作者" },
  imageList: [{ urlDefault: "https://example.com/cover.jpg" }],
  video: { media: { stream: { h264: [stream()] } } }, ...overrides,
} } } } });
const page = (value: unknown = state()) => `<script>window.__INITIAL_STATE__=${JSON.stringify(value)};</script>`;
const response = (value: string | Uint8Array, finalUrl = url) => ({ data: typeof value === "string" ? new TextEncoder().encode(value) : value, headers: [] as [string, string][], url: finalUrl });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(isTauri).mockReturnValue(false); });

describe("小红书链接", () => {
  it("从分享文案保留完整参数和短链接", () => {
    expect(parseXiaohongshuRef(`分享 ${url} 复制打开`)).toEqual({ id, url });
    expect(parseXiaohongshuRef("分享 http://xhslink.com/o/AbC123，复制打开")).toEqual({ url: "http://xhslink.com/o/AbC123" });
    expect(parseXiaohongshuRef(`www.xiaohongshu.com/discovery/item/${id}?xsec_token=abc=`).id).toBe(id);
  });
  it("拒绝无关链接和伪装域名", () => {
    for (const value of ["", "https://example.com", `https://evilxiaohongshu.com/explore/${id}`, `https://example.com/xiaohongshu.com/explore/${id}`, "https://xhslink.com.evil.test/abc", "https://www.xiaohongshu.com/user/profile/123"]) {
      expect(() => parseXiaohongshuRef(value)).toThrow();
    }
  });
});

describe("小红书页面数据", () => {
  it("按资源编号取源图，预览和缩略图分别使用小尺寸版本，不沿用带水印的页面处理样式", () => {
    const sources = xiaohongshuImageSources({ fileId: "1040g2sg_test", url: "http://sns-webpic-qc.xhscdn.com/date/sign/1040g2sg_test!h5_1080jpg", infoList: [{ imageScene: "CRD_WM_JPG", url: "https://cdn.test/watermarked.jpg" }] });
    expect(sources.urls[0]).toBe("https://sns-img-bd.xhscdn.com/1040g2sg_test?imageView2/2/format/jpg");
    expect(sources.urls.join(" ")).not.toMatch(/watermarked|h5_1080|!|\/w\//);
    expect(sources.previewUrls[0]).toContain("/w/960/format/webp");
    expect(sources.thumbnail).toContain("/w/480/format/webp");
    expect(xiaohongshuImageSources({ url: "http://sns-webpic-qc.xhscdn.com/date/sign/1040g2sg_test!h5_1080jpg" }).urls).toEqual(sources.urls);
  });
  it("不从无关域名猜测图片编号，不接受非法资源路径", () => {
    expect(xiaohongshuImageSources({ fileId: "../outside", url: "https://cdn.test/a.jpg" }).urls).toEqual(["https://cdn.test/a.jpg"]);
  });
  it("提取标题、作者、封面、时长、分辨率和日期", () => {
    expect(parseXiaohongshuPage(page(), id)).toMatchObject({ id, desc: "测试视频", author: "作者", duration: 12, resolution: "1080×1920", createTime: 1700000000 });
  });
  it("支持手机分享页的 noteData、nickName 和封面 url 字段", () => {
    const mobile = { noteData: { data: { noteData: {
      ...state().note.noteDetailMap[id].note, noteId: id, title: "", desc: "手机视频",
      user: { nickName: "手机作者" }, imageList: [{ url: "https://cdn.test/mobile.jpg" }],
    } } } };
    expect(parseXiaohongshuPage(page(mobile), id)).toMatchObject({ desc: "手机视频", author: "手机作者", cover: "https://cdn.test/mobile.jpg", resolution: "1080×1920" });
    expect(() => xiaohongshuItem(mobile, "other")).toThrow();
  });
  it("处理 undefined、字符串中的大括号和转义，不执行脚本", () => {
    const html = page(state({ title: 'undefined } \\" 标题' })).replace('"type":"video"', '"unused":undefined,"type":"video"');
    expect(parseXiaohongshuPage(html, id).desc).toBe('undefined } \\" 标题');
    expect(() => parseXiaohongshuPage('window.__INITIAL_STATE__={"note":alert(1)}', id)).toThrow();
  });
  it("优先 H.264 最高分辨率，保留备用地址并去重", () => {
    const item = xiaohongshuItem(state({ video: { media: { stream: {
      h265: [stream({ videoCodec: "hevc", width: 2160, masterUrl: "https://cdn.test/hevc.mp4" })],
      h264: [stream({ width: 720, masterUrl: "https://cdn.test/720.mp4" }), stream({ masterUrl: "https://cdn.test/1080.mp4", backupUrls: ["https://cdn.test/backup.mp4", "https://cdn.test/1080.mp4", "javascript:bad"] })],
    } } } }), id);
    expect(item.videoUrls).toEqual(["https://cdn.test/1080.mp4", "https://cdn.test/backup.mp4", "https://cdn.test/720.mp4", "https://cdn.test/hevc.mp4"]);
  });
  it("自动识别图文，保留全部图片，不误取其他笔记", () => {
    const item = xiaohongshuItem(state({ type: "normal", video: {}, imageList: [
      { urlDefault: "https://cdn.test/a.jpg" },
      { infoList: [{ imageScene: "WB_PRV", url: "https://cdn.test/b-small.jpg" }, { imageScene: "WB_DFT", url: "https://cdn.test/b.jpg" }] },
    ] }), id);
    expect(item.type).toBe("images");
    expect(item.images).toHaveLength(2);
    expect(item.images[1].urls[0]).toBe("https://cdn.test/b.jpg");
    expect(() => xiaohongshuItem(state({ type: "normal", imageList: [{}] }), id)).toThrow("图片");
    expect(() => xiaohongshuItem(state(), "other")).toThrow();
    expect(() => xiaohongshuItem(state({ video: {} }), id)).toThrow();
    expect(() => parseXiaohongshuPage("<html>登录</html>", id)).toThrow();
  });
  it("清理文件名中的非法字符", () => {
    expect(xiaohongshuBaseName({ ...xiaohongshuItem(state(), id), desc: 'a/b:c*?"<>' })).not.toMatch(/[\\/:*?"<>|]/);
  });
});

describe("小红书读取与下载", () => {
  it("短链接跟随跳转后读取原始页面", async () => {
    vi.mocked(fetchBytes).mockResolvedValue(response(page()));
    expect((await getXiaohongshuItem("https://xhslink.com/o/abc")).id).toBe(id);
    expect(invoke).not.toHaveBeenCalled();
    expect(vi.mocked(fetchBytes).mock.calls[0][1]?.headers?.find(([key]) => key === "User-Agent")?.[1]).toContain("iPhone");
  });
  it("桌面读取失败后用原始链接调用后台窗口", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(fetchBytes).mockRejectedValue(new Error("请求失败"));
    vi.mocked(invoke).mockResolvedValue(JSON.stringify({ id, state: state() }));
    expect((await getXiaohongshuItem(url)).id).toBe(id);
    expect(invoke).toHaveBeenCalledWith("xiaohongshu_capture", { url });
  });
  it("下载拒绝 HTML 错误页，并尝试备用视频地址", async () => {
    const mp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    vi.mocked(fetchBytes).mockResolvedValueOnce(response("<html>Access denied</html>")).mockResolvedValueOnce(response(mp4));
    expect(await downloadXiaohongshu(["https://cdn.test/a", "https://cdn.test/b"], "video")).toEqual(mp4);
    expect(fetchBytes).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetchBytes).mock.calls[0][1]?.headers).toContainEqual(["Referer", "https://www.xiaohongshu.com/"]);
  });
  it("取消后停止下载，不再请求备用地址", async () => {
    const controller = new AbortController();
    vi.mocked(fetchBytes).mockImplementation(async () => { controller.abort(); throw new Error("取消"); });
    await expect(downloadXiaohongshu(["https://cdn.test/a", "https://cdn.test/b"], "video", undefined, controller.signal)).rejects.toThrow();
    expect(fetchBytes).toHaveBeenCalledTimes(1);
  });
  it("按文件头区分 JPEG、WebP、AVIF，并拒绝非图片的封面", async () => {
    expect(xiaohongshuCoverExt(new Uint8Array([255, 216, 255, 224]))).toBe("jpg");
    expect(xiaohongshuCoverExt(new TextEncoder().encode("RIFF1234WEBP"))).toBe("webp");
    expect(xiaohongshuCoverExt(new TextEncoder().encode("1234ftypavif"))).toBe("avif");
    expect(xiaohongshuCoverExt(new TextEncoder().encode("1234ftypisom"))).toBeUndefined();
    vi.mocked(fetchBytes).mockResolvedValue(response("<html>登录</html>"));
    await expect(downloadXiaohongshu(["https://cdn.test/cover.jpg"], "cover")).rejects.toThrow("有效");
  });
});
