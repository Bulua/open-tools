import { t } from "@/locales";
import { fetchBytes } from "@/tools/network/shared/transport";
import type { SocialDownloadAdapter, SocialMediaItem } from "../shared/socialDownload";
import { groupVideoQualities, type VideoCodec } from "../shared/videoQuality";

const mobileOrigin = "https://m.weibo.cn";
const videoOrigin = "https://h5.video.weibo.com";
const userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
const mediaHeaders: [string, string][] = [["Referer", mobileOrigin + "/"], ["User-Agent", userAgent]];
const videoId = /^1034:(?:\d{16,20}|[a-f\d]{32})$/i;
const postId = /^[a-z\d]{1,20}$/i;
const postHost = /^(?:(?:www|m)\.)?weibo\.(?:com|cn)$/;
const videoHost = /^(?:h5\.)?video\.weibo\.com$/;
const cdnHost = /(?:^|\.)(?:weibocdn\.com|sinaimg\.cn|weibovideo\.com)$/;

type WeiboRef = { kind: "post" | "video" | "short"; id: string };

function httpUrl(value: string, base?: string): URL | undefined {
  try {
    const url = new URL(value, base);
    if (/^https?:$/.test(url.protocol) && !url.port && !url.username && !url.password) return url;
  } catch {
    // 忽略不能解析成 URL 的分享内容。
  }
}

function classify(url: URL): WeiboRef | undefined {
  const path = url.pathname.replace(/[.!?,;\])}]+$/, "").replace(/\/$/, "").replace(/%3a/gi, ":");
  if (url.hostname === "t.cn" && /^\/[a-z\d]+$/i.test(path)) return { kind: "short", id: path.slice(1) };
  if (!postHost.test(url.hostname) && !videoHost.test(url.hostname)) return;

  const oid = path.match(/^\/(?:tv\/)?show\/([^/]+)$/)?.[1]
    ?? (videoHost.test(url.hostname) && path === "/show" ? url.searchParams.get("fid") : null);
  if (oid && videoId.test(oid)) return { kind: "video", id: oid };
  if (!postHost.test(url.hostname)) return;

  const id = path.match(/^\/(?:status|detail|\d+)\/([^/]+)$/)?.[1];
  if (id && postId.test(id)) return { kind: "post", id };
}

export function parseWeiboRef(input: string): WeiboRef {
  const links = input.matchAll(/https?:\/\/[^\s<>"“”()，。！？、；】》]+|(?<![\w./@-])(?:(?:(?:www|m|video|h5\.video)\.)?weibo\.(?:com|cn)|t\.cn)\/[^\s<>"“”()，。！？、；】》]+/gi);
  let short: WeiboRef | undefined;
  for (const [link] of links) {
    const url = httpUrl(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    const ref = url && classify(url);
    if (ref && ref.kind !== "short") return ref;
    short ??= ref;
  }
  if (short) return short;
  throw new Error(t("video.weiboInvalidLink"));
}

const requestOptions = () => ({ maxRedirections: 0, connectTimeout: 10_000, signal: AbortSignal.timeout(15_000) });

async function resolveShortLink(id: string): Promise<WeiboRef> {
  const { fetch } = await import("@tauri-apps/plugin-http");
  let url = `https://t.cn/${id}`;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, { ...requestOptions(), headers: { "User-Agent": userAgent } });
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (response.status < 300 || response.status >= 400 || !location) break;
    const target = httpUrl(location, url);
    const ref = target && classify(target);
    if (!ref) break;
    if (ref.kind !== "short") return ref;
    url = `https://t.cn/${ref.id}`;
  }
  throw new Error(t("video.weiboInvalidLink"));
}

interface PageInfo {
  object_id?: string;
  title?: string;
  page_title?: string;
  page_pic?: { url?: string };
  urls?: Record<string, string>;
  media_info?: { duration?: number | string; stream_url?: string; stream_url_hd?: string };
}

interface WeiboPost {
  id?: string;
  text?: string;
  created_at?: string;
  user?: { screen_name?: string };
  page_info?: PageInfo;
  mix_media_ids?: string[];
  retweeted_status?: WeiboPost;
}

interface VideoPage {
  title?: string;
  text?: string;
  author?: string;
  real_date?: number;
  duration_time?: number | string;
  cover_image?: string;
  urls?: Record<string, string>;
  stream_url?: string;
}

async function readJson<T>(url: string, headers: Record<string, string>, body?: URLSearchParams): Promise<T> {
  const { fetch } = await import("@tauri-apps/plugin-http");
  try {
    const response = await fetch(url, { ...requestOptions(), method: body ? "POST" : "GET", headers: { "User-Agent": userAgent, ...headers }, body });
    if (response.ok) return await response.json() as T;
    await response.body?.cancel();
  } catch {
    // 登录页、超时或无效 JSON 都无法提供公开媒体信息。
  }
  throw new Error(t("video.weiboUnavailable"));
}

function cdnUrl(value?: string): URL | undefined {
  if (typeof value !== "string" || !/^(?:https?:)?\/\//i.test(value)) return;
  const url = httpUrl(value, videoOrigin);
  if (url && cdnHost.test(url.hostname)) {
    url.protocol = "https:";
    return url;
  }
}

function plainText(value?: string): string {
  if (!value) return "";
  // 模板内容保持惰性，微博文案中的图片和脚本不会被加载。
  const template = document.createElement("template");
  template.innerHTML = value.replace(/<br\s*\/?>/gi, " ");
  return (template.content.textContent ?? "").replace(/\s+/g, " ").trim();
}

type VideoDetails = Omit<SocialMediaItem, "type" | "images" | "resolution" | "videoUrls" | "videoQualities">;

function makeItem(details: VideoDetails, candidates: (string | undefined)[]): SocialMediaItem | undefined {
  const formats = candidates.flatMap(candidate => {
    const url = cdnUrl(candidate);
    if (!url || !/\.mp4$/i.test(url.pathname)) return [];
    const size = /^(\d+)x(\d+)(?:\.|$)/i.exec(url.searchParams.get("template") ?? "");
    const encoding = url.searchParams.get("codec") ?? url.searchParams.get("vcodec") ?? "";
    const codec: VideoCodec = /^(?:hevc|h265|hvc1)/i.test(encoding) ? "hevc" : /^(?:av01|av1)/i.test(encoding) ? "av1" : "avc";
    return [{ width: Number(size?.[1]) || 0, height: Number(size?.[2]) || 0, bitrate: 0, h265: codec === "hevc", codec, urls: [url.href] }];
  });
  if (!formats.length) return;
  const videoQualities = groupVideoQualities(formats);
  const videoUrls = [...new Set([...videoQualities.flatMap(quality => quality.urls), ...formats.flatMap(format => format.urls)])];
  return { ...details, type: "video", images: [], videoUrls, videoQualities, resolution: videoQualities[0]?.resolution ?? "" };
}

async function readVideoPage(id: string, fallback?: SocialMediaItem) {
  const page = `/show/${id}`;
  const body = new URLSearchParams({ data: JSON.stringify({ Component_Play_Playinfo: { oid: id } }) });
  const response = await readJson<{ data?: { Component_Play_Playinfo?: VideoPage } }>(
    `${videoOrigin}/api/component`, { Referer: videoOrigin + page, Origin: videoOrigin, "PAGE-REFERER": page }, body,
  );
  const video = response?.data?.Component_Play_Playinfo;
  if (!video?.title && !video?.urls && !video?.stream_url) throw new Error(t("video.weiboUnavailable"));
  return makeItem({
    id,
    desc: plainText(video.title || video.text) || fallback?.desc || "",
    author: video.author || fallback?.author || "",
    createTime: Number(video.real_date) || fallback?.createTime || 0,
    cover: cdnUrl(video.cover_image)?.href || fallback?.cover || "",
    duration: Number(video.duration_time) || fallback?.duration || 0,
  }, [...Object.values(video.urls ?? {}), video.stream_url, ...(fallback?.videoUrls ?? [])]);
}

async function readPost(id: string) {
  const response = await readJson<{ ok?: number; data?: WeiboPost }>(
    `${mobileOrigin}/statuses/show?${new URLSearchParams({ id })}`,
    { Referer: mobileOrigin + "/", "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
  );
  if (response?.ok !== 1 || !response.data) throw new Error(t("video.weiboUnavailable"));
  const post = response.data.page_info || response.data.mix_media_ids?.length
    ? response.data
    : response.data.retweeted_status ?? response.data;
  const page = post.page_info;
  const oid = page?.object_id && videoId.test(page.object_id) ? page.object_id : undefined;
  const main = makeItem({
    id: oid ?? post.id ?? id,
    desc: plainText(page?.title || post.text || page?.page_title),
    author: post.user?.screen_name ?? "",
    createTime: (Date.parse(post.created_at ?? "") || 0) / 1000,
    cover: cdnUrl(page?.page_pic?.url)?.href ?? "",
    duration: Number(page?.media_info?.duration) || 0,
  }, [...Object.values(page?.urls ?? {}), page?.media_info?.stream_url_hd, page?.media_info?.stream_url]);

  const refs = new Map<string, WeiboRef>();
  if (oid) refs.set(oid, { kind: "video", id: oid });
  for (const link of post.mix_media_ids ?? []) {
    const url = httpUrl(link);
    const ref = url && classify(url);
    if (ref && ref.kind !== "post") refs.set(ref.id, ref);
  }

  const items = new Map<string, SocialMediaItem>();
  if (main) items.set(main.id, main);
  const visited = new Set<string>();
  const candidates = [...refs.values()];
  // 混合帖返回的是各段视频的短链，分批读取，单段失效时仍显示其余视频。
  for (let index = 0; index < candidates.length; index += 4) {
    const batch = await Promise.allSettled(candidates.slice(index, index + 4).map(async ref => {
      const target = ref.kind === "short" ? await resolveShortLink(ref.id) : ref;
      if (target.kind !== "video" || visited.has(target.id)) return;
      visited.add(target.id);
      return readVideoPage(target.id, items.get(target.id));
    }));
    for (const result of batch) if (result.status === "fulfilled" && result.value) items.set(result.value.id, result.value);
  }
  return [...items.values()];
}

async function getWeiboItems(input: string): Promise<SocialMediaItem[]> {
  let ref = parseWeiboRef(input);
  if (ref.kind === "short") ref = await resolveShortLink(ref.id);
  if (ref.kind === "video") {
    const item = await readVideoPage(ref.id);
    if (item) return [item];
  } else {
    const items = await readPost(ref.id);
    if (items.length) return items;
  }
  throw new Error(t("video.weiboNoVideo"));
}

async function downloadVideo(urls: string[], onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal) {
  let lastError: unknown = new Error(t("video.weiboNoVideo"));
  for (const url of urls) {
    try {
      const { data } = await fetchBytes(url, { headers: mediaHeaders, onProgress, signal });
      if (data.length < 12 || String.fromCharCode(...data.subarray(4, 8)) !== "ftyp") throw new Error(t("video.weiboInvalidFile"));
      return data;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function loadCover(url: string, signal: AbortSignal): Promise<Blob> {
  const { data, headers } = await fetchBytes(url, { headers: mediaHeaders, signal });
  const type = headers.find(([key]) => key.toLowerCase() === "content-type")?.[1].split(";")[0].trim();
  if (!type || !/^image\/(?:jpeg|png|gif|webp|avif)$/i.test(type) || !data.length) throw new Error("Invalid cover image");
  return new Blob([data as BlobPart], { type });
}

export const weiboAdapter = {
  platform: "weibo",
  previewThroughHttp: true,
  parse: getWeiboItems,
  baseName: item => item.desc || item.author || "Weibo",
  imageExt: () => undefined,
  loadCover,
  download: (urls, _kind, onProgress, signal) => downloadVideo(urls, onProgress, signal),
} satisfies SocialDownloadAdapter;
