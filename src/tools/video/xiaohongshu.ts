import { isTauri, invoke } from "@tauri-apps/api/core";
import { fetchBytes } from "@/tools/network/http";
import { t } from "@/locales";
import { safeFileName } from "./bilibili";
import { groupVideoQualities, type VideoCodec, type VideoQuality } from "./videoQuality";

const HEADERS: [string, string][] = [
  ["User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"],
  ["Referer", "https://www.xiaohongshu.com/"],
  ["Origin", ""],
];

export interface XiaohongshuRef { url: string; id?: string }
export interface XiaohongshuItem {
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

/** 只接受小红书笔记和短链接，完整保留分享参数（尤其是 xsec_token）。 */
export function parseXiaohongshuRef(input: string): XiaohongshuRef {
  if (!input.trim()) throw new Error(t("video.xhsEmpty"));
  const candidates = input.match(/(?:https?:\/\/)?(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\/[^\s<>"'，。！）】]+/gi) ?? [];
  for (const candidate of candidates) {
    // 防止在其他域名、路径或查询参数中匹配到伪造的链接。
    const at = input.indexOf(candidate);
    if (at > 0 && /[\w./?=&@-]/.test(input[at - 1])) continue;
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    if (url.username || url.password || url.port) continue;
    const host = url.hostname.toLowerCase();
    if (host === "xhslink.com" || host === "www.xhslink.com") {
      if (/^\/(?:[a-z]\/)?[\w-]+\/?$/i.test(url.pathname)) return { url: url.href };
    }
    if (host === "www.xiaohongshu.com" || host === "xiaohongshu.com") {
      const id = url.pathname.match(/^\/(?:explore|discovery\/item)\/([a-f\d]{24})\/?$/i)?.[1];
      if (id) return { url: url.href, id: id.toLowerCase() };
    }
  }
  throw new Error(t("video.xhsInvalid"));
}

type Data = Record<string, unknown>;
const object = (v: unknown): Data => v && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
const text = (v: unknown) => typeof v === "string" ? v : "";
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
const mediaUrl = (v: unknown): string => {
  if (typeof v !== "string") return "";
  try {
    const url = new URL(v.startsWith("//") ? `https:${v}` : v);
    if (url.protocol === "http:" && (url.hostname.endsWith(".xhscdn.com") || url.hostname.endsWith(".xiaohongshu.com"))) url.protocol = "https:";
    return /^(https?:)$/.test(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
};

/** 使用图片资源编号读取源图，不沿用网页附加水印的处理样式。预览另取小尺寸 WebP。 */
export function xiaohongshuImageSources(value: unknown): { urls: string[]; previewUrls: string[]; thumbnail: string } {
  const img = object(value);
  const info = Array.isArray(img.infoList) ? img.infoList.map(object) : [];
  const fallback = [...new Set([...info.filter((i) => i.imageScene === "WB_DFT").map((i) => i.url), img.urlDefault, img.url, ...info.map((i) => i.url), img.urlPre].map(mediaUrl).filter(Boolean))];
  const validKey = (value: unknown) => typeof value === "string" && /^[\w/-]+$/.test(value) && !value.split("/").some((part) => part === "..") ? value : "";
  let key = validKey(img.fileId) || validKey(img.traceId);
  if (!key) {
    // 网页 CDN 路径前两段是时效签名，资源编号位于其后；只处理已知的小红书图片域名。
    for (const address of fallback) {
      const url = new URL(address);
      if (!/^sns-webpic-[\w-]+\.xhscdn\.com$/.test(url.hostname)) continue;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 3) key = validKey(parts.slice(2).join("/").split("!")[0]);
      if (key) break;
    }
  }
  if (!key) return { urls: fallback, previewUrls: fallback, thumbnail: fallback[0] || "" };
  const hosts = ["https://sns-img-bd.xhscdn.com", "https://ci.xiaohongshu.com"];
  const urls = hosts.map((host) => `${host}/${key}?imageView2/2/format/jpg`);
  const previewUrls = hosts.map((host) => `${host}/${key}?imageView2/2/w/960/format/webp`);
  return { urls, previewUrls, thumbnail: `${hosts[0]}/${key}?imageView2/2/w/480/format/webp` };
}

/** 从页面状态中读取指定笔记，不能误取推荐列表里的其他视频。 */
export function xiaohongshuItem(state: unknown, id: string): XiaohongshuItem {
  const desktop = object(object(object(object(state).note).noteDetailMap)[id]).note;
  // 手机分享页与桌面网页的数据结构不同，必须校验手机页返回的笔记编号。
  const mobile = object(object(object(object(state).noteData).data).noteData);
  const raw = desktop ?? (mobile.noteId === id ? mobile : undefined);
  const note = object(raw);
  if (!Object.keys(note).length) throw new Error(t("video.xhsUnavailable"));
  const isImages = note.type === "normal" || note.type === "image";
  const video = object(note.video);
  const streams = object(object(video.media).stream);
  const formats = Object.values(streams).flatMap((value) => Array.isArray(value) ? value : []).map(object)
    .filter((value) => mediaUrl(value.masterUrl) || (Array.isArray(value.backupUrls) && value.backupUrls.some(mediaUrl)))
    .sort((a, b) => {
      const hevc = (v: Data) => /265|hevc/i.test(text(v.videoCodec)) ? 1 : 0;
      return hevc(a) - hevc(b) || number(b.width) * number(b.height) - number(a.width) * number(a.height) || number(b.avgBitrate) - number(a.avgBitrate);
    });
  const videoUrls = [...new Set(formats.flatMap((v) => [v.masterUrl, ...(Array.isArray(v.backupUrls) ? v.backupUrls : [])]).map(mediaUrl).filter(Boolean))];
  const videoQualities = groupVideoQualities(formats.map((v) => ({
    width: number(v.width), height: number(v.height), bitrate: number(v.avgBitrate), h265: /265|hevc/i.test(text(v.videoCodec)),
    codec: (/av1|av01/i.test(text(v.videoCodec)) ? "av1" : /265|hevc/i.test(text(v.videoCodec)) ? "hevc" : "avc") as VideoCodec,
    urls: [v.masterUrl, ...(Array.isArray(v.backupUrls) ? v.backupUrls : [])].map(mediaUrl).filter(Boolean),
  })));
  if (!isImages && !videoUrls.length) throw new Error(t("video.xhsNoVideo"));
  const best = formats[0] ?? {};
  const images = (Array.isArray(note.imageList) ? note.imageList : []).map((value) => {
    const sources = xiaohongshuImageSources(value);
    return { urls: sources.urls, previewUrls: sources.previewUrls, live: [] as string[] };
  });
  // 缺失任何一张图片时应报错，避免把不完整的图集标为下载成功。
  if (isImages && (!images.length || images.some((img) => !img.urls.length))) throw new Error(t("video.xhsNoImages"));
  const firstImage = object(Array.isArray(note.imageList) ? note.imageList[0] : undefined);
  const cover = xiaohongshuImageSources(firstImage).thumbnail;
  const w = number(best.width), h = number(best.height);
  return {
    id, type: isImages ? "images" : "video", desc: text(note.title) || text(note.desc), author: text(object(note.user).nickname) || text(object(note.user).nickName),
    createTime: number(note.time) > 1e12 ? number(note.time) / 1000 : number(note.time),
    cover, duration: number(best.duration) / 1000 || number(object(video.basic).duration) || number(object(object(video.media).video).duration),
    resolution: w && h ? `${w}×${h}` : "", videoUrls, videoQualities: isImages ? [] : videoQualities, images: isImages ? images : [],
  };
}

/** 安全解析网页里的状态对象，不执行网页 JavaScript；只将字符串以外的 undefined 换为 null。 */
export function parseXiaohongshuPage(html: string, id: string): XiaohongshuItem {
  const marker = /window\.__INITIAL_STATE__\s*=\s*/.exec(html);
  if (!marker) throw new Error(t("video.xhsUnavailable"));
  const start = marker.index + marker[0].length;
  let depth = 0, quoted = false, escaped = false;
  for (let end = start; end < html.length; end++) {
    const c = html[end];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      const json = html.slice(start, end + 1).replace(/"(?:\\.|[^"\\])*"|\bundefined\b/g, (token) => token === "undefined" ? "null" : token);
      return xiaohongshuItem(JSON.parse(json), id);
    }
  }
  throw new Error(t("video.xhsUnavailable"));
}

export async function getXiaohongshuItem(input: string): Promise<XiaohongshuItem> {
  const ref = parseXiaohongshuRef(input);
  try {
    const response = await fetchBytes(ref.url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
    const resolved = parseXiaohongshuRef(response.url);
    if (!resolved.id) throw new Error(t("video.xhsUnavailable"));
    return parseXiaohongshuPage(new TextDecoder().decode(response.data), resolved.id);
  } catch (e) {
    // 部分分享页需要在真实 WebView 中加载，使用原始分享链接，避免丢失校验参数。
    if (!isTauri()) throw e;
    const result = JSON.parse(await invoke<string>("xiaohongshu_capture", { url: ref.url })) as { id: string; state: unknown; error?: string };
    if (result.error) throw new Error(t("video.xhsUnavailable"));
    return xiaohongshuItem(result.state, result.id);
  }
}

/** 多个 CDN 地址依次重试，拒绝把错误页保存为视频或封面。 */
export async function downloadXiaohongshu(urls: string[], kind: "video" | "cover", onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<Uint8Array> {
  let last: unknown = new Error(t("video.xhsNoVideo"));
  for (const url of urls) {
    if (signal?.aborted) throw new Error(t("video.cancelled"));
    try {
      const { data } = await fetchBytes(url, { headers: HEADERS, onProgress, signal });
      const box = String.fromCharCode(...data.subarray(4, 8));
      const valid = kind === "video" ? data.length >= 12 && box === "ftyp" : !!xiaohongshuCoverExt(data);
      if (!valid) throw new Error(t("video.xhsInvalidFile"));
      return data;
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
    }
  }
  throw last;
}

/** 根据图片文件头确定扩展名，CDN 链接的后缀不一定对应真实格式。 */
export function xiaohongshuCoverExt(data: Uint8Array): string | undefined {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => data[i] === v)) return "png";
  if (String.fromCharCode(...data.subarray(0, 4)) === "RIFF" && String.fromCharCode(...data.subarray(8, 12)) === "WEBP") return "webp";
  if (String.fromCharCode(...data.subarray(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...data.subarray(8, 12));
    if (/^avi[fs]$/.test(brand)) return "avif";
    if (/^hei[cx]$/.test(brand)) return "heic";
    if (/^(mif1|msf1)$/.test(brand)) return "heif";
  }
  return undefined;
}

export const xiaohongshuBaseName = (item: XiaohongshuItem) => safeFileName(item.desc.slice(0, 60) || t("video.xhsFileName", { id: item.id }));
