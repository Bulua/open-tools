import type { LoadedImage } from "./toDocx";

/**
 * 为 Markdown 转 Word 读取图片：
 * - data: 开头的内嵌图片、http(s) 网络图片：直接读取（网络图片可能因对方限制而失败）
 * - 相对路径（如 images/a.png）：在一起拖入的文件中按路径查找，找不到时再按文件名查找
 * Word 不支持的格式（WebP、SVG 等）转成 PNG。
 */
export function createImageLoader(files: { file: File; path: string }[] = []) {
  const byPath = new Map(files.map((f) => [normalize(f.path), f.file]));
  const byName = new Map(files.map((f) => [baseName(f.path), f.file]));

  const isRemote = (src: string) => /^(data:|https?:|blob:)/i.test(src);

  /** 在拖入的文件中查找相对路径的图片；from 是 Markdown 文件自身的路径 */
  const findLocal = (src: string, from = "") => {
    let clean = src.split(/[?#]/)[0];
    try {
      clean = decodeURIComponent(clean);
    } catch {
      // 路径里有不成对的 %，按原样查找
    }
    const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
    return byPath.get(normalize(dir + clean)) ?? byPath.get(normalize(clean)) ?? byName.get(baseName(clean));
  };

  const load = async (src: string, from = ""): Promise<LoadedImage | null> => {
    let blob: Blob | undefined;
    if (isRemote(src)) {
      const response = await fetch(src);
      if (!response.ok) return null;
      blob = await response.blob();
    } else blob = findLocal(src, from);
    return blob ? toWordImage(blob) : null;
  };

  /** 本地图片中找不到的那些（网络图片不算） */
  const missing = (srcs: string[], from = "") => srcs.filter((s) => !isRemote(s) && !findLocal(s, from));

  return { load, missing };
}

/** Markdown 中引用的所有图片地址 */
export const imageSources = (markdown: string) =>
  [...markdown.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g)].map((m) => m[1]);

const baseName = (p: string) => p.split(/[\\/]/).pop()!.toLowerCase();

/** 统一斜杠，去掉 ./ 并解析 ../ */
function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/").toLowerCase();
}

const TYPES: Record<string, LoadedImage["type"]> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/bmp": "bmp" };

/** 解码图片；SVG 不能用 createImageBitmap，改用 <img> */
async function decode(blob: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(blob);
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      // SVG 没有声明尺寸时按 800 宽处理
      if (!img.naturalWidth) Object.assign(img, { width: 800, height: 600 });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function toWordImage(blob: Blob): Promise<LoadedImage | null> {
  try {
    const image = await decode(blob);
    const { width, height } = image;
    const type = TYPES[blob.type];
    if (type) return { data: new Uint8Array(await blob.arrayBuffer()), type, width, height };
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return png ? { data: new Uint8Array(await png.arrayBuffer()), type: "png", width, height } : null;
  } catch {
    return null;
  }
}
