import { describe, expect, it } from "vitest";
import { pickFormat, recordingFileName, recordingName } from "./recorder";

describe("视频录制：格式", () => {
  it("支持 MP4 时优先用 MP4", () => {
    expect(pickFormat(() => true)).toMatchObject({ ext: "mp4", mimeType: "video/mp4;codecs=avc1.42E01F,mp4a.40.2" });
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
