import { beforeEach, expect, it, vi } from "vitest";
import { BufferTarget, Conversion } from "mediabunny";
import { compressMedia, compressedVideoSize } from "./compression";

const media = vi.hoisted(() => ({
  ensureMp3: vi.fn(),
  openInput: vi.fn(),
  UNSUPPORTED_VIDEO: () => "unsupported",
}));
vi.mock("./media", () => media);

const audioTrack = {
  getNumberOfChannels: async () => 6,
  getSampleRate: async () => 22050,
};
const videoTrack = {
  getDisplayWidth: async () => 1080,
  getDisplayHeight: async () => 1920,
};
const input = {
  canRead: async () => true,
  getPrimaryAudioTrack: vi.fn(),
  getPrimaryVideoTrack: async () => videoTrack,
  dispose: vi.fn(),
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  input.getPrimaryAudioTrack.mockResolvedValue(audioTrack);
  media.openInput.mockReturnValue(input);
});

it("按短边等比压缩横屏和竖屏，不放大较小画面", () => {
  expect(compressedVideoSize(1920, 1080, 720)).toEqual({ width: 1280, height: 720 });
  expect(compressedVideoSize(1080, 1920, 720)).toEqual({ width: 720, height: 1280 });
  expect(compressedVideoSize(641, 361, 720)).toEqual({ width: 640, height: 360 });
  expect(compressedVideoSize(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
});

function mockConversion(discardedTracks: Conversion["discardedTracks"] = []) {
  const execute = vi.fn();
  const init = vi.spyOn(Conversion, "init").mockImplementation(async ({ output }) => {
    execute.mockImplementation(async () => {
      (output.target as BufferTarget).buffer = new Uint8Array([1, 2]).buffer;
    });
    return { isValid: true, discardedTracks, execute } as unknown as Conversion;
  });
  return { execute, init };
}

it("音频压缩强制重新编码，应用码率并为 MP3 调整不兼容的采样率和声道", async () => {
  const { init } = mockConversion();
  const result = await compressMedia(new Blob(), { mode: "audio", format: "mp3", audioBitrate: 96 }, vi.fn(), new AbortController().signal);
  expect(init).toHaveBeenCalledWith(expect.objectContaining({
    video: { discard: true },
    audio: { codec: "mp3", bitrate: 96000, forceTranscode: true, numberOfChannels: 2, sampleRate: 44100 },
  }));
  expect(media.ensureMp3).toHaveBeenCalledOnce();
  expect(result).toEqual({ data: new Uint8Array([1, 2]), ext: "mp3" });
  expect(input.dispose).toHaveBeenCalledOnce();
});

it("视频压缩可输出无声的竖屏视频", async () => {
  input.getPrimaryAudioTrack.mockResolvedValue(null);
  const { init } = mockConversion();
  const result = await compressMedia(new Blob(), { mode: "video", videoBitrate: 1800, audioBitrate: 128, shortEdge: 720 }, vi.fn(), new AbortController().signal);
  expect(init).toHaveBeenCalledWith(expect.objectContaining({
    video: { codec: "avc", width: 720, height: 1280, fit: "contain", bitrate: 1800000, forceTranscode: true },
  }));
  expect(result.ext).toBe("mp4");
});

it("有声视频的音轨无法编码时报告失败，避免无声结果", async () => {
  const { execute } = mockConversion([{ reason: "undecodable_source_codec" } as Conversion["discardedTracks"][number]]);
  await expect(compressMedia(new Blob(), { mode: "video", videoBitrate: 1800, audioBitrate: 128, shortEdge: 720 }, vi.fn(), new AbortController().signal)).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
  expect(input.dispose).toHaveBeenCalledOnce();
});
