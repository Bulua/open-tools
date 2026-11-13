/**
 * 压缩包读写：ZIP（读写）、TAR / TGZ / GZ（只读）。
 * ZIP 与 GZIP 的压缩算法用 fflate，TAR 格式很简单，直接解析。
 */
import { gunzipSync, unzipSync, zipSync } from "fflate";
import { t } from "@/locales";

export interface ArchiveEntry {
  /** 包内路径，目录以 / 结尾 */
  path: string;
  size: number;
  dir: boolean;
  data: Uint8Array;
}

// ---------- 文件名编码 ----------

/**
 * 修正 ZIP 里的中文文件名。
 * Windows 自带压缩生成的 ZIP 用 GBK 保存文件名，fflate 会按 Latin-1 解出乱码；
 * Latin-1 是逐字节对应的，可以还原出原始字节，再按 UTF-8 或 GBK 重新解码。
 */
export function fixZipName(name: string): string {
  if (/[^\x00-\xff]/.test(name) || !/[\x80-\xff]/.test(name)) return name;
  const bytes = Uint8Array.from(name, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gbk").decode(bytes);
  }
}

// ---------- TAR ----------

const readString = (bytes: Uint8Array, start: number, length: number) => {
  const slice = bytes.subarray(start, start + length);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end >= 0 ? slice.subarray(0, end) : slice);
};
const readOctal = (bytes: Uint8Array, start: number, length: number) =>
  parseInt(readString(bytes, start, length).trim() || "0", 8);

export const isTar = (bytes: Uint8Array) => bytes.length >= 512 && readString(bytes, 257, 5) === "ustar";

/** 解析 TAR，支持 GNU 长文件名；跳过 PAX 扩展头 */
export function parseTar(bytes: Uint8Array): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let offset = 0;
  let longName: string | null = null;
  while (offset + 512 <= bytes.length) {
    // 两个全零块表示结束
    if (bytes.subarray(offset, offset + 512).every((b) => b === 0)) break;
    const size = readOctal(bytes, offset + 124, 12);
    const type = String.fromCharCode(bytes[offset + 156] || 48);
    const prefix = readString(bytes, offset + 345, 155);
    const name = longName ?? (prefix ? `${prefix}/` : "") + readString(bytes, offset + 0, 100);
    const data = bytes.slice(offset + 512, offset + 512 + size);
    longName = null;

    if (type === "L") longName = readString(data, 0, data.length);
    else if (type === "0" || type === "5") {
      const dir = type === "5" || name.endsWith("/");
      entries.push({ path: dir && !name.endsWith("/") ? `${name}/` : name, size, dir, data });
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

// ---------- 读取压缩包 ----------

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5);
const isGzip = (b: Uint8Array) => b[0] === 0x1f && b[1] === 0x8b;

/** 根据文件内容识别格式并读出所有条目 */
export function readArchive(fileName: string, bytes: Uint8Array): ArchiveEntry[] {
  if (isZip(bytes)) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch (e) {
      throw new Error(t("utility.unzipFailed", { error: e instanceof Error ? e.message : String(e) }));
    }
    return Object.entries(files).map(([name, data]) => {
      const path = fixZipName(name);
      return { path, size: data.length, dir: path.endsWith("/"), data };
    });
  }
  if (isGzip(bytes)) {
    const inner = gunzipSync(bytes);
    if (isTar(inner)) return parseTar(inner);
    // 单个文件的 .gz：解出的文件名去掉 .gz
    const name = fileName.replace(/\.gz$/i, "") || "file";
    return [{ path: name, size: inner.length, dir: false, data: inner }];
  }
  if (isTar(bytes)) return parseTar(bytes);
  throw new Error(t("utility.unsupportedArchive"));
}

/**
 * 把压缩包里的路径整理成安全的相对路径（防止「zip slip」攻击）：
 * 去掉 ..、.、盘符和开头的 /，以及 Windows 文件名里不允许的字符，确保解压的文件只会落在目标文件夹里。
 * 返回各级名称组成的数组，空数组表示没有有效路径。
 */
export function safeRelativePath(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[<>:"|?*\x00-\x1f]/g, "_").trim())
    .filter((part) => part && part !== "." && part !== ".." && !/^[A-Za-z]_$/.test(part));
}

// ---------- 生成 ZIP ----------

/** 打包成 ZIP；level 0 只打包不压缩，9 压缩率最高 */
export function buildZip(files: { path: string; data: Uint8Array }[], level: 0 | 1 | 6 | 9 = 6): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.path.replace(/\\/g, "/")] = f.data;
  return zipSync(entries, { level });
}

/** 把条目整理成目录树，便于展示 */
export interface TreeNode {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  children: TreeNode[];
}

export function buildTree(entries: ArchiveEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", dir: true, size: 0, children: [] };
  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join("/"), dir: !last || entry.dir, size: 0, children: [] };
        node.children.push(child);
      }
      if (last && !entry.dir) child.size = entry.size;
      node = child;
    });
  }
  // 目录大小 = 所有文件之和；目录排在前面
  const finish = (n: TreeNode): number => {
    n.children.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, "zh-CN"));
    if (n.dir) n.size = n.children.reduce((sum, c) => sum + finish(c), 0);
    return n.size;
  };
  finish(root);
  return root.children;
}
