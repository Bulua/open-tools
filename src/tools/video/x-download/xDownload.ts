import { t } from "@/locales";
import { fetchBytes } from "@/tools/network/shared/transport";
import { safeFileName } from "../shared/fileName";
import type { SocialDownloadAdapter, SocialMediaItem } from "../shared/socialDownload";
import { groupVideoQualities } from "../shared/videoQuality";

interface PostRef {
  id: string;
  video?: number;
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

export function parseXRef(input: string): PostRef {
  const links = input.matchAll(/https?:\/\/[^\s<>"“”()，。]+|(?<![\w./@-])(?:(?:www|mobile|m)\.)?(?:x|twitter)\.com\/[^\s<>"“”()，。]+/gi);
  for (const [link] of links) {
    const url = parseUrl(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    if (!url || url.username || url.password || url.port || !/^(?:(?:www|mobile|m)\.)?(?:x|twitter)\.com$/i.test(url.hostname)) continue;
    const match = url.pathname.match(/^\/(?:[\w]+|i\/web)\/status\/(\d{1,20})(?:\/video\/([1-9]\d*))?\/?[.!?,]?$/i);
    if (match) return { id: match[1], video: match[2] ? Number(match[2]) : undefined };
  }
  throw new Error(t("video.xInvalidLink"));
}

interface EmbeddedMedia {
  type?: string;
  media_url_https?: string;
  video_info?: {
    duration_millis?: number;
    variants?: { url?: string; content_type?: string; bitrate?: number }[];
  };
}

interface EmbeddedPost {
  __typename?: string;
  text?: string;
  created_at?: string;
  user?: { name?: string; screen_name?: string };
  mediaDetails?: EmbeddedMedia[];
  quoted_tweet?: EmbeddedPost;
}

function mediaUrl(value: string | undefined, host: string): URL | undefined {
  if (typeof value !== "string") return;
  const url = parseUrl(value);
  if (url?.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname === host) return url;
}

function attachedVideos(post: EmbeddedPost) {
  return Array.isArray(post.mediaDetails)
    ? post.mediaDetails.filter(media => media?.type === "video" || media?.type === "animated_gif")
    : [];
}

export function toXItems(ref: PostRef, post: EmbeddedPost): SocialMediaItem[] {
  if (post?.__typename !== "Tweet") throw new Error(t("video.xUnavailable"));
  let source = post;
  let videos = attachedVideos(source);
  if (!videos.length && post.quoted_tweet) {
    source = post.quoted_tweet;
    videos = attachedVideos(source);
  }
  const items = videos.flatMap((video, index): SocialMediaItem[] => {
    if (ref.video !== undefined && ref.video !== index + 1) return [];
    const variants = video.video_info?.variants;
    if (!Array.isArray(variants)) return [];
    const formats = variants.flatMap(variant => {
      if (variant?.content_type !== "video/mp4") return [];
      const url = mediaUrl(variant.url, "video.twimg.com");
      if (!url || !url.pathname.endsWith(".mp4")) return [];
      const size = url.pathname.match(/\/(\d{1,5})x(\d{1,5})\//);
      return [{ width: Number(size?.[1]) || 0, height: Number(size?.[2]) || 0, bitrate: Number(variant.bitrate) || 0, h265: false, urls: [url.href] }];
    }).sort((a, b) => b.bitrate - a.bitrate);
    if (!formats.length) return [];
    const videoQualities = groupVideoQualities(formats);
    return [{
      id: videos.length > 1 ? `${ref.id}_${index + 1}` : ref.id,
      type: "video", desc: source.text ?? "", author: source.user?.name ?? source.user?.screen_name ?? "",
      createTime: (Date.parse(source.created_at ?? "") || 0) / 1000,
      cover: mediaUrl(video.media_url_https, "pbs.twimg.com")?.href ?? "",
      duration: (video.video_info?.duration_millis ?? 0) / 1000,
      resolution: videoQualities[0]?.resolution ?? "",
      videoUrls: [...new Set(formats.flatMap(format => format.urls))], videoQualities, images: [],
    }];
  });
  if (!items.length) throw new Error(t("video.xNoVideo"));
  return items;
}

async function getXItems(input: string) {
  const ref = parseXRef(input);
  // X 的公开嵌入组件按帖子编号计算请求参数，无需登录。
  const token = ((Number(ref.id) / 1e15) * Math.PI).toString(36).replace(/[0.]/g, "");
  const query = new URLSearchParams({ id: ref.id, token });
  const { data } = await fetchBytes(`https://cdn.syndication.twimg.com/tweet-result?${query}`);
  let post: EmbeddedPost;
  try {
    post = JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new Error(t("video.xUnavailable"));
  }
  return toXItems(ref, post);
}

async function downloadVideo(urls: string[], onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal) {
  let last: unknown = new Error(t("video.xNoVideo"));
  for (const url of urls) {
    try {
      const { data } = await fetchBytes(url, { onProgress, signal });
      if (data.length < 12 || String.fromCharCode(...data.subarray(4, 8)) !== "ftyp") throw new Error(t("video.xInvalidFile"));
      return data;
    } catch (error) {
      if (signal?.aborted) throw error;
      last = error;
    }
  }
  throw last;
}

export const xAdapter: SocialDownloadAdapter = {
  platform: "x",
  previewThroughHttp: false,
  parse: getXItems,
  baseName: item => safeFileName(item.desc.replace(/https?:\/\/t\.co\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "X"),
  imageExt: () => undefined,
  download: (urls, _kind, onProgress, signal) => downloadVideo(urls, onProgress, signal),
};
