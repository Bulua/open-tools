import { describe, expect, it } from "vitest";
import { pickFormat, recordingFileName, recordingName, videoBitrate } from "./recorder";

describe("视频录制：格式", () => {
  it("支持 MP4 时优先用 MP4", () => {
    expect(pickFormat(() => true)).toMatchObject({ ext: "mp4", mimeType: "video/mp4;codecs=avc1.640028,mp4a.40.2" });
  });

  it("不支持 MP4 时用 WebM", () => {
    expect(pickFormat((t) => t.startsWith("video/webm;codecs=vp8"))).toMatchObject({ ext: "webm", mimeType: "video/webm;codecs=vp8,opus" });
  });

  it("都不支持时返回 null", () => {
    expect(pickFormat(() => false)).toBeNull();
  });
});

describe("视频录制：名称", () => {
  it("按序号和时间命名，文件名去掉空格和冒号", () => {
    const name = recordingName(3, new Date(2026, 0, 1, 9, 5));
    expect(name).toBe("录像 3 · 09:05");
    expect(recordingFileName(name, "mp4")).toBe("录像_3_09_05.mp4");
  });
});

describe("视频录制：码率", () => {
  it("清晰度越高码率越高，60 帧多 50%、15 帧少 40%", () => {
    expect(videoBitrate("720", 30)).toBe(5_000_000);
    expect(videoBitrate("1080", 30)).toBe(10_000_000);
    expect(videoBitrate("original", 60)).toBe(30_000_000);
    expect(videoBitrate("1080", 15)).toBe(6_000_000);
  });
});
