/**
 * 视频模块前后端通信类型定义。
 */

export type DownloadPlatform = "douyin" | "bilibili" | "xhs" | "x" | "weibo";
export type DouyinCaptureKind = "video" | "note";

export interface BilibiliSettings {
  sessdata: string;
  downloadQuality: number;
  codec: "avc" | "hevc" | "av1";
}
