import type { VideoQuality } from "./videoQuality";

/** 下载页面只依赖公共作品信息，平台解析和请求头由工具入口提供。 */
export interface SocialMediaItem {
  id: string;
  type: "video" | "images";
  desc: string;
  author: string;
  createTime: number;
  cover: string;
  duration: number;
  resolution: string;
  videoUrls: string[];
  videoQualities?: VideoQuality[];
  images: { urls: string[]; previewUrls?: string[]; live: string[] }[];
}

export interface SocialDownloadAdapter {
  platform: "douyin" | "xhs";
  previewThroughHttp: boolean;
  parse(input: string): Promise<SocialMediaItem>;
  baseName(item: SocialMediaItem): string;
  imageExt(data: Uint8Array): string | undefined;
  download(urls: string[], kind: "video" | "image", onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<Uint8Array>;
}
