import { isTauri } from "@tauri-apps/api/core";

/**
 * 远程图标：不发新版本也能换程序图标。
 *
 * 仓库的 branding/icon.json 列出所有用过的图标（历史都保留），current 指定现在用哪一个。
 * 程序启动后读取这个文件，图标变了就下载 PNG 和 ICO、核对校验值，再交给 Rust 端
 * 换上窗口、托盘和快捷方式的图标（见 src-tauri/src/branding.rs）。
 * 发布、切换图标用 scripts/branding.mjs，说明见 branding/README.md。
 */

export interface BrandingIcon {
  id: string;
  /** 给自己看的名称，例如「橙色渐变」 */
  name: string;
  /** 加入的日期 */
  added: string;
  /** 相对 icon.json 的路径 */
  png: string;
  ico: string;
  sha256: { png: string; ico: string };
}

export interface BrandingManifest {
  /** 正在使用的图标 id；为空或 "default" 时用程序自带的图标 */
  current: string | null;
  icons: BrandingIcon[];
}

/** Gitee 优先，国内访问快；推送到 GitHub master 后打包流程会同步到 Gitee */
export const BRANDING_URLS = [
  "https://gitee.com/bulua/open-tools/raw/master/branding/icon.json",
  "https://raw.githubusercontent.com/Bulua/open-tools/master/branding/icon.json",
];

/** 单个图标文件的大小上限，与 Rust 端一致 */
const MAX_SIZE = 2 * 1024 * 1024;
/** 程序一直开着（隐藏在托盘）时，每隔多久再检查一次 */
const CHECK_INTERVAL = 6 * 3600 * 1000;

export type BrandingPick = { kind: "default" } | { kind: "icon"; icon: BrandingIcon } | { kind: "invalid" };

/** 配置要求用哪个图标；current 指向不存在的图标时当作配置写错了，什么都不改 */
export function pickIcon(manifest: BrandingManifest): BrandingPick {
  const current = manifest?.current;
  if (!current || current === "default") return { kind: "default" };
  const icon = Array.isArray(manifest.icons) ? manifest.icons.find((i) => i.id === current) : undefined;
  if (!icon?.png || !icon.ico || !icon.sha256?.png || !icon.sha256?.ico) return { kind: "invalid" };
  return { kind: "icon", icon };
}

/** 图片地址相对配置文件：从 Gitee 读到的配置就从 Gitee 下载图片 */
export const resolveAsset = (manifestUrl: string, path: string) => new URL(path, manifestUrl).href;

export async function sha256Hex(data: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 通知顶栏 Logo 等重新读取图标 */
export const BRANDING_CHANGED = "branding-changed";

async function download(fetchFn: typeof fetch, url: string, sha256: string) {
  const res = await fetchFn(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`下载图标失败（${res.status}）：${url}`);
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.length > MAX_SIZE) throw new Error(`图标文件太大：${url}`);
  if ((await sha256Hex(data)) !== sha256.toLowerCase()) throw new Error(`图标校验值不对：${url}`);
  return data;
}

/** 读取远程配置，图标变了就换上。网络不通、配置写错时保持现在的图标 */
export async function syncBranding() {
  if (!isTauri()) return;
  const { fetch } = await import("@tauri-apps/plugin-http");
  const { invoke } = await import("@tauri-apps/api/core");
  for (const url of BRANDING_URLS) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const pick = pickIcon((await res.json()) as BrandingManifest);
      if (pick.kind === "invalid") return;
      const current = await invoke<string | null>("branding_current");
      if (pick.kind === "default") {
        if (!current) return;
        await invoke("branding_activate", { id: null, png: [], ico: [] });
      } else {
        if (pick.icon.id === current) return;
        const [png, ico] = await Promise.all([
          download(fetch, resolveAsset(url, pick.icon.png), pick.icon.sha256.png),
          download(fetch, resolveAsset(url, pick.icon.ico), pick.icon.sha256.ico),
        ]);
        await invoke("branding_activate", { id: pick.icon.id, png: Array.from(png), ico: Array.from(ico) });
      }
      window.dispatchEvent(new Event(BRANDING_CHANGED));
      return;
    } catch {
      // 这个地址读不到或文件不对，换下一个
    }
  }
}

/** 启动几秒后检查一次，之后定时检查 */
export function startBrandingSync() {
  if (!isTauri()) return;
  setTimeout(syncBranding, 3000);
  setInterval(syncBranding, CHECK_INTERVAL);
}
