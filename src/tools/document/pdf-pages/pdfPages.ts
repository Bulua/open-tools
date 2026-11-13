import { loadPdf } from "../shared/pdf";
import { PDFDocument, degrees } from "pdf-lib";
import { t } from "@/locales";

/**
 * PDF 页面编辑的纯逻辑：页码范围解析、按新的页面顺序生成 PDF。
 */

/**
 * 解析页码范围，如「1-3, 5, 8-」，返回从 0 开始的页序号（去重、保持输入顺序）。
 * 「8-」表示第 8 页到最后一页，「-3」表示第 1～3 页。超出范围或格式错误时抛出错误。
 */
export function parsePageRanges(input: string, total: number): number[] {
  const result: number[] = [];
  const seen = new Set<number>();
  const parts = input
    .replace(/[，、；;]/g, ",")
    .replace(/[～~—–]/g, "-")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error(t("document.needPages"));

  for (const part of parts) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$|^(\d+)$/);
    if (!m) throw new Error(t("document.badRange", { part }));
    const from = m[3] ? Number(m[3]) : m[1] ? Number(m[1]) : 1;
    const to = m[3] ? Number(m[3]) : m[2] ? Number(m[2]) : total;
    if (from < 1 || to > total || from > to) throw new Error(t("document.outOfRange", { part, total }));
    for (let p = from; p <= to; p++) {
      if (!seen.has(p - 1)) {
        seen.add(p - 1);
        result.push(p - 1);
      }
    }
  }
  return result;
}

export interface PageRef {
  /** 来源 PDF 在 sources 中的序号 */
  source: number;
  /** 在来源 PDF 中的页序号（从 0 开始） */
  index: number;
  /** 额外旋转的角度（90 的倍数） */
  rotation: number;
}

/** 按 pages 的顺序从各个来源 PDF 复制页面，生成新的 PDF */
export async function buildPdf(sources: Uint8Array[], pages: PageRef[]): Promise<Uint8Array> {
  if (!pages.length) throw new Error(t("document.noPages"));
  const loaded = await Promise.all(sources.map((data) => loadPdf(data)));
  const out = await PDFDocument.create();

  // 同一来源的页面一次性复制，速度快，共享的字体、图片也只保存一份
  const copied = new Map<string, Awaited<ReturnType<typeof out.copyPages>>[number]>();
  for (let s = 0; s < loaded.length; s++) {
    const indices = [...new Set(pages.filter((p) => p.source === s).map((p) => p.index))];
    if (!indices.length) continue;
    const result = await out.copyPages(loaded[s], indices);
    indices.forEach((index, i) => copied.set(`${s}:${index}`, result[i]));
  }

  const used = new Set<string>();
  for (const p of pages) {
    const key = `${p.source}:${p.index}`;
    // 同一页出现多次时需要再复制一份
    const page = used.has(key) ? (await out.copyPages(loaded[p.source], [p.index]))[0] : copied.get(key)!;
    used.add(key);
    if (p.rotation) page.setRotation(degrees((((page.getRotation().angle + p.rotation) % 360) + 360) % 360));
    out.addPage(page);
  }
  return out.save();
}

/** 把选中的页面移动到 target 之前（target 为 null 时移到末尾），返回新的顺序 */
export function movePages<T>(list: T[], moving: Set<T>, target: T | null): T[] {
  const rest = list.filter((x) => !moving.has(x));
  const moved = list.filter((x) => moving.has(x));
  const at = target === null ? rest.length : rest.indexOf(target);
  if (at < 0) return list;
  return [...rest.slice(0, at), ...moved, ...rest.slice(at)];
}
