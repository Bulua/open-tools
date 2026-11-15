import { expect, it } from "vitest";
import { groupVideoQualities, pickVideoQuality } from "./videoQuality";

it("按实际分辨率分档，兼容编码优先，同一档内保留备用地址", () => {
  const qualities = groupVideoQualities([
    { width: 720, height: 1280, bitrate: 1000, h265: false, urls: ["720"] },
    { width: 1080, height: 1920, bitrate: 4000, h265: true, urls: ["hevc"] },
    { width: 1080, height: 1920, bitrate: 2000, h265: false, urls: ["avc", "backup", "avc"] },
    { width: 0, height: 0, bitrate: 0, h265: false, urls: ["unknown"] },
  ]);
  expect(qualities.map((q) => q.resolution)).toEqual(["1080×1920", "1080×1920", "720×1280"]);
  expect(qualities[0].urls).toEqual(["avc", "backup"]);
  expect(qualities[0].urls).not.toContain("720");
  expect(qualities[2].urls).toEqual(["720"]);
  expect(pickVideoQuality(qualities, 0, "avc")?.urls).toEqual(["avc", "backup"]);
  expect(pickVideoQuality(qualities, 0, "hevc")?.urls).toEqual(["hevc"]);
  expect(pickVideoQuality(qualities, 720, "hevc")?.urls).toEqual(["720"]);
  expect(pickVideoQuality(qualities, 480, "avc")?.urls).toEqual(["720"]);
});
