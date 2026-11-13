import { describe, expect, it, vi } from "vitest";
import { fetchBytes } from "@/tools/network/shared/transport";
import { getVideoInfo } from "./bilibili";

vi.mock("@/tools/network/shared/transport", () => ({ fetchBytes: vi.fn() }));

describe("B 站：请求头", () => {
  it("解析视频时为所有请求显式移除桌面窗口 Origin", async () => {
    const mockedFetch = vi.mocked(fetchBytes);
    mockedFetch.mockImplementation(async (url) => ({
      data: new TextEncoder().encode(JSON.stringify(
        url.includes("/finger/spi")
          ? { code: 0, data: { b_3: "visitor" } }
          : {
              code: 0,
              data: {
                bvid: "BV1dR4g68Eyp",
                aid: 1,
                title: "测试视频",
                pic: "https://example.com/cover.jpg",
                owner: { name: "作者" },
                desc: "",
                duration: 10,
                pubdate: 0,
                pages: [{ cid: 1, page: 1, part: "第一集", duration: 10 }],
              },
            },
      )),
      headers: [],
      url,
    }));

    const { info } = await getVideoInfo("https://www.bilibili.com/video/BV1dR4g68Eyp?t=1.6", { sessdata: "" });
    expect(info.bvid).toBe("BV1dR4g68Eyp");
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    for (const [, options] of mockedFetch.mock.calls) {
      expect(options?.headers).toEqual(expect.arrayContaining([
        ["Referer", "https://www.bilibili.com/"],
        ["Origin", ""],
      ]));
    }
  });
});
