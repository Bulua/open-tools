import { describe, expect, it } from "vitest";
import { BufferTarget, EncodedAudioPacketSource, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output } from "mediabunny";
import { mixinKey, muxToMp4, outputBaseName, parseVideoRef, pickAudio, pickVideo, signWbi, type Stream, type VideoInfo } from "./bilibili";
import { safeFileName } from "../shared/fileName";
import { probeVideo } from "../shared/media";

describe("B 站：解析链接", () => {
  it("BV 号、av 号、分 P、短链接", () => {
    expect(parseVideoRef("https://www.bilibili.com/video/BV1GJ411x7h7/?spm_id_from=333&p=3")).toEqual({ bvid: "BV1GJ411x7h7", page: 3 });
    expect(parseVideoRef("BV1GJ411x7h7")).toEqual({ bvid: "BV1GJ411x7h7", page: undefined });
    expect(parseVideoRef("https://www.bilibili.com/video/av170001")).toEqual({ aid: 170001, page: undefined });
    expect(parseVideoRef("【标题】 https://b23.tv/AbCd123 复制此链接")).toEqual({ shortUrl: "https://b23.tv/AbCd123" });
  });

  it("番剧和无效内容给出提示", () => {
    expect(() => parseVideoRef("https://www.bilibili.com/bangumi/play/ep12345")).toThrow("番剧");
    expect(() => parseVideoRef("https://example.com")).toThrow("没有找到视频编号");
    expect(() => parseVideoRef("  ")).toThrow("请粘贴");
  });
});

describe("B 站：WBI 签名", () => {
  // B 站接口文档（bilibili-API-collect）中的示例
  it("混合密钥", () => {
    expect(mixinKey("7cd084941338484aae1ad9425b84077c", "4932caff0ff746eab6f01bf08b70ac45")).toBe("ea1db124af3c7062474693fa704f4ff8");
  });

  it("签名结果", () => {
    expect(signWbi({ foo: "114", bar: "514", zab: 1919810 }, "ea1db124af3c7062474693fa704f4ff8", 1702204169)).toBe(
      "bar=514&foo=114&wts=1702204169&zab=1919810&w_rid=8f6f2b5b3d485fe1886cec6a0be8c5d4",
    );
  });
});

describe("B 站：选择视频流", () => {
  const s = (id: number, codecid: number, bandwidth = 1): Stream => ({ id, codecid, url: `${id}-${codecid}`, backup: [], bandwidth });
  const videos = [s(80, 7), s(80, 12), s(64, 7), s(64, 13), s(32, 7)];

  it("按清晰度和编码选择，没有时依次降级", () => {
    expect(pickVideo(videos, 80, "hevc")?.url).toBe("80-12");
    expect(pickVideo(videos, 80, "av1")?.url).toBe("80-7");
    expect(pickVideo(videos, 120, "avc")?.url).toBe("80-7");
    expect(pickVideo(videos, 74, "av1")?.url).toBe("64-13");
    expect(pickVideo(videos, 16, "avc")?.url).toBe("32-7");
    expect(pickVideo([], 80, "avc")).toBeNull();
  });

  it("声音选码率最高的", () => {
    expect(pickAudio([s(30216, 0, 64), s(30280, 0, 192), s(30232, 0, 132)])?.id).toBe(30280);
  });
});

describe("B 站：文件名", () => {
  const info = { title: 'a/b:c*"d"?', pages: [{ cid: 1, page: 1, part: "x", duration: 1 }] } as VideoInfo;
  it("去掉不能用的字符", () => {
    expect(safeFileName('a/b:c*"d"?')).toBe("a_b_c__d__");
    expect(safeFileName("...")).toBe("bilibili");
  });
  it("多 P 加上分 P 标题", () => {
    expect(outputBaseName(info, info.pages[0])).toBe("a_b_c__d__");
    const multi = { ...info, title: "合集", pages: [...info.pages, { cid: 2, page: 2, part: "第二集", duration: 1 }] };
    expect(outputBaseName(multi, multi.pages[1])).toBe("合集 P2 第二集");
  });
});

describe("B 站：合并画面和声音", () => {
  // 真实的 H.264 参数（x264 编码 320×180 Baseline 得到），假参数会让 mediabunny 打印解析错误
  const AVCC = new Uint8Array([
    1, 0x42, 0xc0, 0x1f, 0xff, 0xe1, 0, 25,
    0x67, 0x42, 0xc0, 0x1f, 0xd9, 0x01, 0x41, 0x9f, 0x9f, 0x01, 0x10, 0x00, 0x00, 0x03, 0x00, 0x10, 0x00, 0x00, 0x03, 0x03, 0xc0, 0xf1, 0x83, 0x24, 0x80,
    1, 0, 5, 0x68, 0xcb, 0x83, 0xcb, 0x20,
  ]);
  /** 只有画面或只有声音的 MP4（数据包是假的，不解码） */
  async function track(kind: "video" | "audio", seconds: number) {
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    if (kind === "video") {
      const src = new EncodedVideoPacketSource("avc");
      output.addVideoTrack(src, { frameRate: 25 });
      await output.start();
      for (let i = 0; i < seconds * 25; i++)
        await src.add(
          new EncodedPacket(new Uint8Array([0, 0, 0, 1, i & 255]), i % 25 ? "delta" : "key", i / 25, 1 / 25),
          i ? undefined : { decoderConfig: { codec: "avc1.42c01f", codedWidth: 320, codedHeight: 180, description: AVCC } },
        );
    } else {
      const src = new EncodedAudioPacketSource("aac");
      output.addAudioTrack(src);
      await output.start();
      const step = 1024 / 44100;
      for (let i = 0; i * step < seconds; i++)
        await src.add(
          new EncodedPacket(new Uint8Array([0x21, i & 255]), "key", i * step, step),
          i ? undefined : { decoderConfig: { codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 2, description: new Uint8Array([0x12, 0x10]) } },
        );
    }
    await output.finalize();
    return new Uint8Array(output.target.buffer!);
  }

  it("画面 + 声音合并为一个 MP4，时长不变", async () => {
    const mp4 = await muxToMp4(await track("video", 2), await track("audio", 2));
    const info = await probeVideo(new Blob([mp4 as Uint8Array<ArrayBuffer>]));
    expect(info).toMatchObject({ width: 320, height: 180, videoCodec: "avc", audio: { codec: "aac", sampleRate: 44100, channels: 2 } });
    expect(info.duration).toBeCloseTo(2, 1);
  });

  it("只有声音时得到 M4A", async () => {
    const m4a = await muxToMp4(null, await track("audio", 1));
    const info = await probeVideo(new Blob([m4a as Uint8Array<ArrayBuffer>]));
    expect(info.width).toBe(0);
    expect(info.audio?.codec).toBe("aac");
  });
});
