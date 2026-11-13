import { isTauri } from "@tauri-apps/api/core";
import { fetchBytes } from "@/tools/network/shared/transport";
import { t } from "@/locales";
import { safeFileName } from "../shared/fileName";

/**
 * 抖音下载（无水印）：
 * 1. 分享链接（v.douyin.com/…）跳转后得到作品编号和类型（视频 / 图文）
 * 2. 抖音的接口需要页面脚本计算签名，所以由桌面版开一个看不到的窗口打开作品页，读取页面自己加载的作品信息（见 Rust 的 douyin.rs）
 * 3. 选无水印的地址：视频的 playwm 换成 play，或者用多码率列表里的地址（本来就没有水印）；图文的 url_list 是无水印原图
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEADERS: [string, string][] = [
  ["User-Agent", UA],
  ["Referer", "https://www.douyin.com/"],
];

export interface DouyinRef {
  id?: string;
  kind?: "video" | "note";
  /** v.douyin.com 短链接，需要先访问得到真实地址 */
  shortUrl?: string;
}

/** 从分享文案、链接或编号中找出作品 */
export function parseDouyinRef(input: string): DouyinRef {
  const text = input.trim();
  if (!text) throw new Error(t("video.dyEmpty"));
  const short = text.match(/https?:\/\/v\.douyin\.com\/[\w-]+\/?/i) ?? text.match(/(?:^|\s)(v\.douyin\.com\/[\w-]+\/?)/i);
  if (short) return { shortUrl: short[0].trim().startsWith("http") ? short[0].trim() : `https://${short[1]}` };
  const path = text.match(/(?:douyin\.com|iesdouyin\.com)\/(?:share\/)?(video|note|slides)\/(\d{10,24})/i);
  if (path) return { id: path[2], kind: path[1].toLowerCase() === "video" ? "video" : "note" };
  const modal = text.match(/[?&](?:modal_id|vid|aweme_id)=(\d{10,24})/);
  if (modal) return { id: modal[1] };
  const bare = text.match(/^\d{15,24}$/);
  if (bare) return { id: bare[0] };
  throw new Error(t("video.dyNotFound"));
}

/** 页面里读到的作品信息（字段见 Rust 注入的 douyin_capture.js） */
export interface RawAweme {
  id: string;
  desc: string;
  author: string;
  createTime: number;
  cover: string;
  /** 毫秒 */
  duration: number;
  width: number;
  height: number;
  video: string[];
  rates: { urls: string[]; bitrate: number; h265: boolean; width: number; height: number }[];
  images: { urls: string[]; width: number; height: number; live: string[] }[];
  music: { title: string; urls: string[] };
}

export interface DouyinItem {
  id: string;
  type: "video" | "images";
  desc: string;
  author: string;
  createTime: number;
  cover: string;
  /** 秒 */
  duration: number;
  /** 无水印视频地址（从优先到备用） */
  videoUrls: string[];
  /** 视频分辨率，例如 1080×1920 */
  resolution: string;
  /** 图文：每张无水印原图的地址（从优先到备用）；实况照片附带视频地址 */
  images: { urls: string[]; live: string[] }[];
  music: { title: string; urls: string[] };
}

/** 带水印的地址（playwm）换成无水印的（play） */
export const withoutWatermark = (url: string) => url.replace(/\/playwm\//, "/play/").replace(/([?&])watermark=1/, "$1watermark=0");

/** 图片地址排序：JPEG 优先（兼容性好），WebP、HEIC 放后面 */
const imageRank = (u: string) => (/\.jpe?g(\?|$)|~tplv-[^.]*\.jpe?g|jpeg/i.test(u) ? 0 : /webp/i.test(u) ? 1 : 2);

/** 整理成下载需要的信息：视频选 H.264 中码率最高的一档，没有多码率列表时用 play 地址 */
export function toItem(a: RawAweme): DouyinItem {
  const images = a.images.filter((i) => i.urls.length);
  const best = [...a.rates].filter((r) => r.urls.length).sort((x, y) => Number(x.h265) - Number(y.h265) || y.bitrate - x.bitrate)[0];
  const videoUrls = [...new Set([...(best?.urls ?? []), ...a.video].map(withoutWatermark))];
  const w = best?.width || a.width;
  const h = best?.height || a.height;
  return {
    id: a.id,
    type: images.length ? "images" : "video",
    desc: a.desc,
    author: a.author,
    createTime: a.createTime,
    cover: a.cover,
    duration: Math.round((a.duration || 0) / 1000),
    videoUrls,
    resolution: w && h ? `${w}×${h}` : "",
    images: images.map((i) => ({ urls: [...i.urls].sort((x, y) => imageRank(x) - imageRank(y)), live: i.live.map(withoutWatermark) })),
    music: a.music,
  };
}

/** 读取作品：先解析短链接，再由桌面版读取页面里的作品信息 */
export async function getDouyinItem(input: string): Promise<DouyinItem> {
  if (!isTauri()) throw new Error(t("video.dyDesktopOnly"));
  let ref = parseDouyinRef(input);
  if (ref.shortUrl) {
    const { url } = await fetchBytes(ref.shortUrl, { headers: [["User-Agent", UA]] });
    ref = parseDouyinRef(url);
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const json = await invoke<string>("douyin_capture", { id: ref.id, kind: ref.kind ?? "video" });
  const raw = JSON.parse(json) as RawAweme;
  const item = toItem(raw);
  if (item.type === "video" && !item.videoUrls.length) throw new Error(t("video.dyNoVideo"));
  return item;
}

/** 依次尝试多个地址下载 */
export async function downloadFirst(urls: string[], onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<{ data: Uint8Array; url: string }> {
  let last: unknown = new Error(t("video.dyNoUrl"));
  for (const url of urls) {
    try {
      const r = await fetchBytes(url, { headers: HEADERS, onProgress, signal });
      if (!r.data.length) throw new Error(t("video.dyEmptyFile"));
      return { data: r.data, url: r.url };
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error(t("video.downloadFailed"));
}

/** 按文件内容判断图片格式（地址里的扩展名不可靠） */
export function imageExt(data: Uint8Array): string {
  if (data[0] === 0xff && data[1] === 0xd8) return "jpg";
  if (data[0] === 0x89 && data[1] === 0x50) return "png";
  if (data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return "webp";
  if (String.fromCharCode(...data.subarray(4, 12)).includes("heic")) return "heic";
  return "jpg";
}

/** 文件名：作品描述（去掉话题标签）或作品编号 */
export function douyinBaseName(item: DouyinItem): string {
  const desc = item.desc.replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  return safeFileName(desc ? desc.slice(0, 60) : t("video.dyFileName", { id: item.id }));
}
