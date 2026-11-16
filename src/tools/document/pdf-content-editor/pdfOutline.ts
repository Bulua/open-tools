import type { PdfDocument } from "../shared/pdfjs";

export interface PdfOutlineEntry {
  id: string;
  title: string;
  depth: number;
  destination: unknown;
}

/** 保留 PDF 自带的目录层级，不把普通页面文字猜成目录。页码在点击时按需解析。 */
export async function readPdfOutline(doc: Pick<PdfDocument, "getOutline">): Promise<PdfOutlineEntry[]> {
  const outline = await doc.getOutline();
  const result: PdfOutlineEntry[] = [];
  const visit = (items: NonNullable<typeof outline>, depth: number, prefix: string) => {
    for (const [index, item] of items.entries()) {
      const id = `${prefix}${index}`;
      result.push({ id, title: item.title, depth, destination: item.dest });
      if (item.items?.length) visit(item.items, depth + 1, `${id}.`);
    }
  };
  if (outline) visit(outline, 0, "");
  return result;
}

export async function resolveOutlinePage(doc: Pick<PdfDocument, "getDestination" | "getPageIndex" | "numPages">, destination: unknown): Promise<number | undefined> {
  const dest: unknown = typeof destination === "string" ? await doc.getDestination(destination) : destination;
  if (!Array.isArray(dest) || !dest.length) return undefined;
  const ref: unknown = dest[0];
  let index: number;
  if (typeof ref === "number") index = ref;
  else if (ref && typeof ref === "object" && "num" in ref && "gen" in ref && typeof ref.num === "number" && typeof ref.gen === "number") index = await doc.getPageIndex({ num: ref.num, gen: ref.gen });
  else return undefined;
  return Number.isInteger(index) && index >= 0 && index < doc.numPages ? index : undefined;
}
