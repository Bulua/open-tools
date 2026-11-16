import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, degrees, rgb, LineCapStyle, pushGraphicsState, popGraphicsState, beginText, endText, setCharacterSpacing, setCharacterSqueeze, type PDFFont, type PDFPage } from "pdf-lib";
import { loadPdf } from "../shared/pdf";
import { t } from "@/locales";

import { arrowHeadPoints, clampObject, textLines, PDF_TEXT_FEATURES, type PdfEditObject, type PdfEditPage } from "./pdfEditorModel";

/** 将可见页面的 PDF 坐标映射回原页；叠加页自身采用左下角坐标。 */
export function overlayPlacement(page: PdfEditPage) {
  const [a, b, c, d, e, f] = page.transform;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) throw new Error(t("document.pdfEditBadPage"));
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
  const ie = (c * f - d * e) / det, iff = (b * e - a * f) / det;
  return { x: ic * page.height + ie, y: id * page.height + iff, rotation: Math.atan2(ib, ia) * 180 / Math.PI };
}

const pdfColor = (hex: string) => {
  if (!/^#[a-f\d]{6}$/i.test(hex)) throw new Error(t("document.pdfEditBadColor"));
  return rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
};

function drawStroke(page: PDFPage, item: PdfEditObject, height: number) {
  const points = item.points ?? [{ x: 0, y: 1 }, { x: 1, y: 0 }];
  const actual = points.map((p) => ({ x: item.x + p.x * item.width, y: height - item.y - p.y * item.height }));
  const options = { color: pdfColor(item.color), opacity: item.opacity, thickness: item.strokeWidth, lineCap: LineCapStyle.Round };
  for (let i = 1; i < actual.length; i++) page.drawLine({ start: actual[i - 1], end: actual[i], ...options });
  if (item.kind === "arrow" && actual.length >= 2) {
    const head = arrowHeadPoints(item).map((point) => ({ x: item.x + point.x, y: height - item.y - point.y }));
    for (const index of [0, 2]) page.drawLine({ start: head[1], end: head[index], ...options });
  }
}

/** 把新增内容写入原 PDF；原页面继续保留文字、图片和矢量内容，不整页转成图片。 */
export async function exportEditedPdf(data: Uint8Array, pages: PdfEditPage[], items: PdfEditObject[], fonts: Record<string, Uint8Array>, originalsRemoved = false): Promise<Uint8Array> {
  if (items.some((item) => item.originalId) && !originalsRemoved) throw new Error(t("document.pdfEditStaleOriginal"));
  const document = await loadPdf(data);
  if (document.getPageCount() !== pages.length) throw new Error(t("document.pdfEditBadPage"));
  if (items.some((item) => !Number.isInteger(item.page) || item.page < 0 || item.page >= pages.length)) throw new Error(t("document.pdfEditBadPage"));
  const overlay = await PDFDocument.create();
  overlay.registerFontkit(fontkit);
  const embeddedFonts = new Map<string, PDFFont>();
  const sourcePages: number[] = [];
  for (const [index, metadata] of pages.entries()) {
    // 只删除原文的页面已经由原文引擎处理，无需再嵌入没有内容流的空叠加页。
    const objects = items.filter((item) => item.page === index && (item.kind !== "text" || item.text?.trim()));
    if (!objects.length) continue;
    const page = overlay.addPage([metadata.width, metadata.height]);
    sourcePages.push(index);
    for (const original of objects) {
      const item = clampObject(original, metadata);
      const x = item.x, y = metadata.height - item.y - item.height;
      if (item.kind === "text") {
        if (!item.text?.trim()) continue;
        const id = item.fontId || "default";
        let font = embeddedFonts.get(id);
        if (!font) {
          if (!fonts[id]) throw new Error(t("document.pdfEditFontMissing"));
          font = await overlay.embedFont(fonts[id], { subset: true, features: PDF_TEXT_FEATURES }); embeddedFonts.set(id, font);
        }
        const size = item.fontSize || 18;
        const chars = new Set(font.getCharacterSet());
        if ([...item.text].some((char) => !/\s/.test(char) && !chars.has(char.codePointAt(0)!))) throw new Error(t("document.pdfEditUnsupportedText"));
        const lines = textLines(item.text.replace(/\t/g, "    "));
        const leading = item.lineHeight || size * 1.25;
        const needed = lines.length * leading;
        const spacing = item.characterSpacing || 0, scale = item.horizontalScale || 1, origin = item.textOriginX || 0;
        if (needed > item.height + 0.1 || lines.some((line) => origin + (font!.widthOfTextAtSize(line, size) + Math.max(0, [...line].length - 1) * spacing) * scale > item.width + 0.1)) throw new Error(t("document.pdfEditTextOverflow"));
        const ascent = item.baseline ?? font.heightAtSize(size, { descender: false });
        page.pushOperators(pushGraphicsState(), beginText(), setCharacterSpacing(spacing), setCharacterSqueeze(scale * 100), endText());
        for (const [line, text] of lines.entries()) if (text) page.drawText(text, { x: x + origin, y: metadata.height - item.y - ascent - line * leading, font, size, color: pdfColor(item.color), opacity: item.opacity });
        page.pushOperators(popGraphicsState());
      } else if (item.kind === "image" && item.image) {
        const image = await overlay.embedPng(item.image);
        page.drawImage(image, { x, y, width: item.width, height: item.height, opacity: item.opacity });
      } else if (item.kind === "signature" || item.kind === "line" || item.kind === "arrow") {
        drawStroke(page, item, metadata.height);
      } else if (item.kind === "ellipse") {
        page.drawEllipse({ x: x + item.width / 2, y: y + item.height / 2, xScale: Math.max(0, (item.width - item.strokeWidth) / 2), yScale: Math.max(0, (item.height - item.strokeWidth) / 2), borderColor: pdfColor(item.color), borderWidth: item.strokeWidth, borderOpacity: item.opacity });
      } else {
        const inset = item.kind === "highlight" ? 0 : item.strokeWidth / 2;
        page.drawRectangle({ x: x + inset, y: y + inset, width: Math.max(0, item.width - inset * 2), height: Math.max(0, item.height - inset * 2), ...(item.kind === "highlight" ? { color: pdfColor(item.color), opacity: item.opacity } : { borderColor: pdfColor(item.color), borderWidth: item.strokeWidth, borderOpacity: item.opacity }) });
      }
    }
  }
  if (sourcePages.length) {
    // embedPdf 默认只嵌入第 0 页，必须明确传入全部叠加页的索引。
    const embedded = await document.embedPdf(await overlay.save(), overlay.getPageIndices());
    for (const [i, index] of sourcePages.entries()) {
      const placement = overlayPlacement(pages[index]);
      document.getPage(index).drawPage(embedded[i], { x: placement.x, y: placement.y, width: pages[index].width, height: pages[index].height, rotate: degrees(placement.rotation) });
    }
  }
  return document.save();
}
