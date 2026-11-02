import SparkMD5 from "spark-md5";
import { BufferTarget, EncodedAudioPacketSource, EncodedPacketSink, EncodedVideoPacketSource, Mp4OutputFormat, Output } from "mediabunny";
import { fetchBytes } from "@/tools/network/http";
import { openInput } from "./media";

/**
 * B 站视频下载：解析视频链接，取得各清晰度的视频流，下载后把画面和声音合并为 MP4（不重新编码）。
 *
 * - 视频信息、播放地址来自 B 站网页使用的公开接口；播放地址接口需要 WBI 签名（失败时改用旧接口）
 * - 下载视频文件必须带 Referer（否则 403），所以由桌面版的 Rust 或开发服务器发出请求
 * - 不登录最高 480P；填写自己账号的 SESSDATA 后可以下载 1080P，大会员可以下载 4K 等
 * - 番剧、电影、付费内容不支持
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ---------- 链接解析 ----------

export interface VideoRef {
  bvid?: string;
  aid?: number;
  /** 链接里指定的分 P（从 1 开始） */
  page?: number;
  /** b23.tv 短链接，需要先访问得到真实地址 */
  shortUrl?: string;
}

/** 从链接或编号中找出视频：BV 号、av 号、b23.tv 短链接；番剧链接给出提示 */
export function parseVideoRef(input: string): VideoRef {
  const text = input.trim();
  if (!text) throw new Error("请粘贴 B 站视频链接或 BV 号");
  const page = Number(text.match(/[?&]p=(\d+)/)?.[1]) || undefined;
  const bv = text.match(/BV1[0-9A-Za-z]{9}/);
  if (bv) return { bvid: bv[0], page };
  const av = text.match(/(?:^|[/?&=\s])av(\d+)/i) ?? text.match(/^(\d+)$/);
  if (av) return { aid: Number(av[1]), page };
  const short = text.match(/https?:\/\/(?:b23\.tv|bili2233\.cn)\/[\w-]+/i) ?? text.match(/(?:^|\s)((?:b23\.tv|bili2233\.cn)\/[\w-]+)/i);
  if (short) return { shortUrl: short[0].trim().startsWith("http") ? short[0].trim() : `https://${short[1]}` };
  if (/bilibili\.com\/bangumi|\b(ep|ss)\d+/i.test(text)) throw new Error("番剧、电影暂不支持，只支持普通视频（链接中有 BV 号的）");
  throw new Error("没有找到视频编号，请粘贴视频页面的链接（含 BV 号），或 b23.tv 分享链接");
}

// ---------- WBI 签名（B 站接口防爬用的参数签名） ----------

const MIXIN_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60,
  51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

/** 由 img_key、sub_key 打乱得到 32 位的混合密钥 */
export const mixinKey = (imgKey: string, subKey: string) =>
  MIXIN_TABLE.map((i) => (imgKey + subKey)[i])
    .join("")
    .slice(0, 32);

/** 参数加上 wts（时间戳）后按名称排序，去掉 !'()* 字符，拼上混合密钥算 MD5 得到 w_rid */
export function signWbi(params: Record<string, string | number>, key: string, wts = Math.round(Date.now() / 1000)): string {
  const all: Record<string, string | number> = { ...params, wts };
  const query = Object.keys(all)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(all[k]).replace(/[!'()*]/g, ""))}`)
    .join("&");
  return `${query}&w_rid=${SparkMD5.hash(query + key)}`;
}

// ---------- 接口 ----------

export interface Session {
  /** 用户填写的 SESSDATA（可选） */
  sessdata: string;
}

let buvid3 = "";
let wbiKey: { key: string; time: number } | null = null;

const cookieOf = (s: Session) => [buvid3 && `buvid3=${buvid3}`, s.sessdata.trim() && `SESSDATA=${s.sessdata.trim().replace(/^SESSDATA=/i, "").replace(/;$/, "")}`].filter(Boolean).join("; ");
const headersOf = (s: Session): [string, string][] => {
  const cookie = cookieOf(s);
  return [["User-Agent", UA], ["Referer", "https://www.bilibili.com/"], ...(cookie ? [["Cookie", cookie] as [string, string]] : [])];
};

const ERRORS: Record<number, string> = {
  [-400]: "请求参数错误",
  [-403]: "没有权限访问这个视频（可能需要登录或大会员）",
  [-404]: "视频不存在或已被删除",
  [-352]: "请求被 B 站拦截（风控），请稍后再试，或填写 SESSDATA 登录后再试",
  [-412]: "请求太频繁，被 B 站拦截，请稍后再试",
  62002: "视频不可见（可能是私密视频或已下架）",
  62004: "视频正在审核中",
  62012: "视频仅 UP 主自己可见",
};

async function api<T>(url: string, s: Session): Promise<{ code: number; message: string; data: T }> {
  const { data } = await fetchBytes(url, { headers: headersOf(s) });
  let json: { code: number; message: string; data: T };
  try {
    json = JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new Error("B 站返回的内容无法识别，请稍后再试");
  }
  return json;
}

const check = <T>(r: { code: number; message: string; data: T }) => {
  if (r.code !== 0) throw new Error(ERRORS[r.code] ?? `B 站返回错误：${r.message || r.code}`);
  return r.data;
};

/** 访客标识：没有时部分接口会被风控拦截 */
async function ensureBuvid(s: Session) {
  if (buvid3) return;
  const r = await api<{ b_3: string }>("https://api.bilibili.com/x/frontend/finger/spi", s).catch(() => null);
  buvid3 = r?.data?.b_3 ?? "";
}

export interface LoginInfo {
  isLogin: boolean;
  name: string;
  vip: boolean;
}

/** 登录状态，同时取得 WBI 密钥（每小时更新一次） */
export async function getLoginInfo(s: Session): Promise<LoginInfo> {
  await ensureBuvid(s);
  const r = await api<{ isLogin: boolean; uname?: string; vipStatus?: number; wbi_img?: { img_url: string; sub_url: string } }>("https://api.bilibili.com/x/web-interface/nav", s);
  const img = r.data?.wbi_img;
  if (img) {
    const name = (u: string) => u.split("/").pop()!.split(".")[0];
    wbiKey = { key: mixinKey(name(img.img_url), name(img.sub_url)), time: Date.now() };
  }
  return { isLogin: !!r.data?.isLogin, name: r.data?.uname ?? "", vip: r.data?.vipStatus === 1 };
}

export interface VideoPage {
  cid: number;
  page: number;
  part: string;
  duration: number;
}
export interface VideoInfo {
  bvid: string;
  aid: number;
  title: string;
  cover: string;
  owner: string;
  desc: string;
  duration: number;
  pubdate: number;
  pages: VideoPage[];
}

/** 短链接访问后得到真实地址 */
async function resolveShort(url: string, s: Session): Promise<VideoRef> {
  const { url: final, data } = await fetchBytes(url, { headers: headersOf(s) });
  const ref = parseVideoRef(final);
  if (ref.bvid || ref.aid) return ref;
  // 地址里没有时，从页面内容里找
  return parseVideoRef(new TextDecoder().decode(data.subarray(0, 200000)));
}

export async function getVideoInfo(input: string, s: Session): Promise<{ info: VideoInfo; page?: number }> {
  await ensureBuvid(s);
  let ref = parseVideoRef(input);
  if (ref.shortUrl) ref = { ...(await resolveShort(ref.shortUrl, s)), page: ref.page };
  const query = ref.bvid ? `bvid=${ref.bvid}` : `aid=${ref.aid}`;
  const d = check(
    await api<{
      bvid: string;
      aid: number;
      title: string;
      pic: string;
      owner: { name: string };
      desc: string;
      duration: number;
      pubdate: number;
      pages: VideoPage[];
    }>(`https://api.bilibili.com/x/web-interface/view?${query}`, s),
  );
  return {
    info: {
      bvid: d.bvid,
      aid: d.aid,
      title: d.title,
      cover: d.pic.replace(/^http:/, "https:"),
      owner: d.owner?.name ?? "",
      desc: d.desc,
      duration: d.duration,
      pubdate: d.pubdate,
      pages: d.pages.map((p) => ({ cid: p.cid, page: p.page, part: p.part, duration: p.duration })),
    },
    page: ref.page,
  };
}

export interface Stream {
  /** 清晰度编号，例如 80 = 1080P */
  id: number;
  url: string;
  backup: string[];
  bandwidth: number;
  codecid?: number;
  codecs?: string;
  width?: number;
  height?: number;
}
export interface PlayInfo {
  /** DASH：画面、声音分开 */
  videos: Stream[];
  audios: Stream[];
  /** 不是 DASH 时：完整的文件（可能分成几段） */
  files: { url: string; size: number }[];
  /** 当前账号可以选择的清晰度 */
  qualities: { id: number; label: string }[];
}

type DashStream = { id: number; baseUrl?: string; base_url?: string; backupUrl?: string[]; backup_url?: string[]; bandwidth: number; codecid?: number; codecs?: string; width?: number; height?: number };
interface PlayData {
  accept_quality?: number[];
  accept_description?: string[];
  dash?: { video?: DashStream[]; audio?: DashStream[] | null; flac?: { audio?: DashStream | null } | null };
  durl?: { url: string; size: number }[];
}

const toStream = (d: DashStream): Stream => ({
  id: d.id,
  url: d.baseUrl ?? d.base_url ?? "",
  backup: d.backupUrl ?? d.backup_url ?? [],
  bandwidth: d.bandwidth,
  codecid: d.codecid,
  codecs: d.codecs,
  width: d.width,
  height: d.height,
});

export const QUALITY_NAMES: Record<number, string> = {
  127: "8K 超高清",
  126: "杜比视界",
  125: "HDR 真彩",
  120: "4K 超清",
  116: "1080P 60 帧",
  112: "1080P 高码率",
  100: "智能修复",
  80: "1080P 高清",
  74: "720P 60 帧",
  64: "720P 高清",
  32: "480P 清晰",
  16: "360P 流畅",
  6: "240P 极速",
};

/** 播放地址：先用 WBI 签名的新接口，失败时用旧接口 */
export async function getPlayInfo(bvid: string, cid: number, s: Session): Promise<PlayInfo> {
  const params = { bvid, cid, qn: 127, fnval: 4048, fnver: 0, fourk: 1 };
  let data: PlayData | null = null;
  try {
    if (!wbiKey || Date.now() - wbiKey.time > 3600_000) await getLoginInfo(s);
    if (wbiKey) data = check(await api<PlayData>(`https://api.bilibili.com/x/player/wbi/playurl?${signWbi(params, wbiKey.key)}`, s));
  } catch {
    data = null;
  }
  if (!data) {
    const q = Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    data = check(await api<PlayData>(`https://api.bilibili.com/x/player/playurl?${q}`, s));
  }

  const videos = (data.dash?.video ?? []).map(toStream).filter((v) => v.url);
  const audios = [...(data.dash?.audio ?? []), ...(data.dash?.flac?.audio ? [data.dash.flac.audio] : [])].map(toStream).filter((a) => a.url);
  // 能选的清晰度：DASH 里实际有的（没登录时列表里的高清晰度其实拿不到）
  const available = videos.length ? [...new Set(videos.map((v) => v.id))] : (data.accept_quality ?? []);
  const qualities = available.sort((a, b) => b - a).map((id) => ({ id, label: QUALITY_NAMES[id] ?? `清晰度 ${id}` }));
  return { videos, audios, files: (data.durl ?? []).map((d) => ({ url: d.url, size: d.size })), qualities };
}

/**
 * 在线播放地址：网页播放器用的 MP4（画面和声音在一个文件里，最高 720P）。
 * 这个地址不检查 Referer，页面里的 <video> 可以直接播放，不用先下载。地址有时效，每次播放前重新获取。
 */
export async function getPreviewUrl(bvid: string, cid: number, s: Session): Promise<{ url: string; quality: string }> {
  const data = check(
    await api<{ quality: number; durl?: { url: string }[] }>(
      `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=1&fnver=0&platform=html5&high_quality=1`,
      s,
    ),
  );
  const url = data.durl?.[0]?.url;
  if (!url) throw new Error("这个视频没有可以在线播放的地址");
  return { url: url.replace(/^http:/, "https:"), quality: QUALITY_NAMES[data.quality] ?? "" };
}

// ---------- 选择视频流 ----------

export type CodecPreference = "avc" | "hevc" | "av1";
const CODEC_IDS: Record<CodecPreference, number> = { avc: 7, hevc: 12, av1: 13 };
export const CODEC_LABELS: Record<CodecPreference, string> = { avc: "H.264（兼容性最好）", hevc: "H.265（体积更小）", av1: "AV1（体积最小）" };

/** 按清晰度和编码偏好选择画面：没有所选清晰度时用比它低的最高一档；没有所选编码时依次用 H.264、H.265、AV1 */
export function pickVideo(videos: Stream[], quality: number, codec: CodecPreference): Stream | null {
  if (!videos.length) return null;
  const ids = [...new Set(videos.map((v) => v.id))].sort((a, b) => b - a);
  const id = ids.find((q) => q <= quality) ?? ids[ids.length - 1];
  const same = videos.filter((v) => v.id === id);
  const order = [CODEC_IDS[codec], 7, 12, 13];
  for (const c of order) {
    const hit = same.find((v) => v.codecid === c);
    if (hit) return hit;
  }
  return same[0];
}

/** 声音选码率最高的一条（含无损） */
export const pickAudio = (audios: Stream[]): Stream | null => [...audios].sort((a, b) => b.bandwidth - a.bandwidth)[0] ?? null;

// ---------- 下载与合并 ----------

/** 下载一个视频流：主地址失败时依次试备用地址 */
export async function downloadStream(stream: { url: string; backup?: string[] }, s: Session, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal) {
  const urls = [stream.url, ...(stream.backup ?? [])];
  let last: unknown;
  for (const url of urls) {
    try {
      return (await fetchBytes(url, { headers: headersOf(s), onProgress, signal })).data;
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("下载失败");
}

/** 下载一般文件（封面、弹幕） */
export const downloadFile = async (url: string, s: Session) => (await fetchBytes(url, { headers: headersOf(s) })).data;

/** 把 DASH 的画面文件和声音文件合并成一个 MP4（只复制数据，不重新编码，很快）；只传一个时得到无声视频或纯音频（M4A） */
export async function muxToMp4(video: Uint8Array | null, audio: Uint8Array | null): Promise<Uint8Array> {
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const inputs = [video, audio].map((d) => (d ? openInput(new Blob([d as Uint8Array<ArrayBuffer>])) : null));
  try {
    const videoTrack = inputs[0] ? await inputs[0].getPrimaryVideoTrack() : null;
    const audioTrack = inputs[1] ? await inputs[1].getPrimaryAudioTrack() : null;
    if (video && !videoTrack) throw new Error("下载的画面文件无法识别");
    if (audio && !audioTrack) throw new Error("下载的声音文件无法识别");

    const videoSource = videoTrack ? new EncodedVideoPacketSource((await videoTrack.getCodec())!) : null;
    const audioSource = audioTrack ? new EncodedAudioPacketSource((await audioTrack.getCodec())!) : null;
    if (videoSource) output.addVideoTrack(videoSource, { rotation: await videoTrack!.getRotation() });
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();

    const copy = async (track: NonNullable<typeof videoTrack | typeof audioTrack>, source: EncodedVideoPacketSource | EncodedAudioPacketSource) => {
      const config = await track.getDecoderConfig();
      let first = true;
      for await (const p of new EncodedPacketSink(track).packets()) {
        // 两种 source 的 add 参数类型不同，这里的 decoderConfig 与轨道类型一致
        await (source as EncodedVideoPacketSource).add(p, first && config ? { decoderConfig: config as VideoDecoderConfig } : undefined);
        first = false;
      }
    };
    await Promise.all([videoTrack && videoSource && copy(videoTrack, videoSource), audioTrack && audioSource && copy(audioTrack, audioSource)]);
    await output.finalize();
    return new Uint8Array(output.target.buffer!);
  } finally {
    inputs.forEach((i) => i?.dispose());
  }
}

/** 文件名中不能用的字符换掉，太长的截断 */
export function safeFileName(name: string): string {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");
  return (clean || "bilibili").slice(0, 120);
}

/** 输出文件名：单 P 用标题；多 P 加上「P2 分P标题」 */
export function outputBaseName(info: VideoInfo, page: VideoPage): string {
  if (info.pages.length <= 1) return safeFileName(info.title);
  const part = page.part && page.part !== info.title ? ` ${page.part}` : "";
  return safeFileName(`${info.title} P${page.page}${part}`);
}
