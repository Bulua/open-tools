import { t } from "@/locales";

/** 按分辨率和编码分别归档；只在同一档内部重试，避免下载时悄悄改变格式。 */
export interface VideoQuality {
  id: string;
  width: number;
  height: number;
  resolution: string;
  urls: string[];
  codec: VideoCodec;
}

export type VideoCodec = "avc" | "hevc" | "av1";

export interface VideoFormat {
  width: number;
  height: number;
  bitrate: number;
  h265: boolean;
  urls: string[];
  codec?: VideoCodec;
}

export function groupVideoQualities(formats: VideoFormat[]): VideoQuality[] {
  const groups = new Map<string, VideoQuality>();
  const sorted = [...formats].filter((f) => f.width > 0 && f.height > 0 && f.urls.length)
    .sort((a, b) => b.width * b.height - a.width * a.height || Number(a.h265) - Number(b.h265) || b.bitrate - a.bitrate);
  for (const f of sorted) {
    const codec = f.codec ?? (f.h265 ? "hevc" : "avc");
    const id = `${f.width}x${f.height}-${codec}`;
    const group = groups.get(id) ?? { id, width: f.width, height: f.height, resolution: `${f.width}×${f.height}`, codec, urls: [] };
    group.urls = [...new Set([...group.urls, ...f.urls])];
    groups.set(id, group);
  }
  return [...groups.values()];
}

/** 先选画质，再在相同分辨率中选编码；偏好不可用时回退到实际提供的编码。 */
export function pickVideoQuality(qualities: VideoQuality[], shortSide: number, codec: VideoCodec): VideoQuality | undefined {
  const sorted = [...qualities].sort((a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height) || b.width * b.height - a.width * a.height);
  const target = sorted.find((q) => !shortSide || Math.min(q.width, q.height) <= shortSide) ?? sorted[sorted.length - 1];
  if (!target) return undefined;
  const same = sorted.filter((q) => q.width === target.width && q.height === target.height);
  for (const preferred of [codec, "avc", "hevc", "av1"]) {
    const quality = same.find((q) => q.codec === preferred);
    if (quality) return quality;
  }
  return target;
}

export const codecLabel = (codec: VideoCodec) => t(`video.${{ avc: "codecAvc", hevc: "codecHevc", av1: "codecAv1" }[codec]}`);
