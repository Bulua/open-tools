import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { PDFDocument, StandardFonts, rgb, degrees, setTextRenderingMode, TextRenderingMode, pushGraphicsState, popGraphicsState, beginText, endText, setCharacterSpacing, setCharacterSqueeze } from "pdf-lib";
import * as mupdf from "mupdf";
import fontkit from "@pdf-lib/fontkit";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { readEmbeddedPdfFonts, readOriginalPdfText, removeOriginalPdfText } from "./pdfTextEngine";
import { exportEditedPdf } from "./pdfEditor";

GlobalWorkerOptions.workerSrc = new URL("../../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
const fontBytes = new Uint8Array(readFileSync("src/assets/fonts/NotoSansCJKsc-Regular.otf"));
async function sample(cjk = false, rotation = 0) {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const page = doc.addPage([300, 400]);
  const font = cjk ? await doc.embedFont(fontBytes, { subset: true }) : await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 0, y: 0, width: 300, height: 400, color: rgb(0.8, 0.9, 1) });
  page.drawText(cjk ? "修改前文字" : "Original text", { x: 20, y: 300, font, size: 14 });
  page.drawText(cjk ? "保留文字" : "Keep this line", { x: 20, y: 260, font, size: 14 });
  page.setRotation(degrees(rotation));
  return doc.save();
}
async function extracted(data: Uint8Array) {
  const doc = await getDocument({ data: data.slice(), isEvalSupported: false }).promise;
  try { return (await (await doc.getPage(1)).getTextContent()).items.flatMap((item) => "str" in item ? [item.str] : []).join(" "); }
  finally { await doc.destroy(); }
}

it.each([false, true])("移除原文并添加可搜索的替换文字，保留相邻文字和底色（中文：%s）", async (cjk) => {
  const data = await sample(cjk);
  const runs = readOriginalPdfText(data, 0);
  expect(runs).toHaveLength(2); expect(runs[0].supported).toBe(true);
  expect(runs[0].x).toBeCloseTo(20);
  const removed = removeOriginalPdfText(data, [runs[0].id]);
  const view = new mupdf.PDFDocument(removed), renderedPage = view.loadPage(0);
  const pixmap = renderedPage.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, false);
  // 所选文字原位置的底色仍为淡蓝色，没有用白色或黑色矩形覆盖。
  const pixel = pixmap.getPixels().slice(95 * pixmap.getStride() + 25 * 3, 95 * pixmap.getStride() + 25 * 3 + 3);
  expect(pixel[0]).toBeGreaterThan(190); expect(pixel[0]).toBeLessThan(220);
  expect(pixel[2]).toBe(255);
  pixmap.destroy(); renderedPage.destroy(); view.destroy();
  const kept = await extracted(removed);
  expect(kept).not.toContain(cjk ? "修改前文字" : "Original text");
  expect(kept).toContain(cjk ? "保留文字" : "Keep this line");
  const output = await exportEditedPdf(removed, [{ width: 300, height: 400, transform: [1, 0, 0, -1, 0, 400] }], [{ id: 1, page: 0, kind: "text", originalId: runs[0].id, x: runs[0].x, y: runs[0].y, width: 200, height: 50, text: "修改后的新文字", fontSize: 14, fontId: "default", color: "#141413", opacity: 1, strokeWidth: 2 }], { default: fontBytes }, true);
  const text = await extracted(output);
  expect(text).toContain("修改后的新文字");
  expect(text).not.toContain(cjk ? "修改前文字" : "Original text");
  const pdf = await getDocument({ data: output.slice(), isEvalSupported: false }).promise;
  try { expect((await (await pdf.getPage(1)).getOperatorList()).fnArray.length).toBeGreaterThan(20); }
  finally { await pdf.destroy(); }
});

it("方向不支持或原文编号失效时拒绝修改，原文件仍然可用", async () => {
  const data = await sample(false, 90);
  const runs = readOriginalPdfText(data, 0);
  expect(runs[0].supported).toBe(false);
  expect(() => removeOriginalPdfText(data, [runs[0].id])).toThrow("PDF_TEXT_UNSUPPORTED");
  expect(() => removeOriginalPdfText(data, ["0:unknown"])).toThrow("PDF_TEXT_STALE");
  expect(await extracted(data)).toContain("Original text");
});

it("跨页共享文字对象修改第一页后，第二页内容仍然存在", async () => {
  const source = await PDFDocument.create(), p = source.addPage([300, 400]);
  p.drawText("Shared original", { x: 20, y: 300, size: 14 });
  const sourceBytes = await source.save();
  const doc = await PDFDocument.create(); const embedded = await doc.embedPdf(sourceBytes);
  doc.addPage([300, 400]).drawPage(embedded[0]); doc.addPage([300, 400]).drawPage(embedded[0]);
  const bytes = await doc.save(), runs = readOriginalPdfText(bytes, 0);
  const output = removeOriginalPdfText(bytes, [runs[0].id]);
  expect(readOriginalPdfText(output, 0)).toHaveLength(0);
  expect(readOriginalPdfText(output, 1)[0].text).toContain("Shared original");
});

it("隐藏的 OCR 文字层不能被误当成可直接修改的扫描件文字", async () => {
  const pdf = await PDFDocument.create(), page = pdf.addPage([200, 300]);
  page.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
  page.drawText("Hidden OCR", { x: 20, y: 200, size: 12 });
  const bytes = await pdf.save(), runs = readOriginalPdfText(bytes, 0);
  expect(runs.length).toBeGreaterThan(0);
  expect(runs[0].supported).toBe(false);
  expect(() => removeOriginalPdfText(bytes, [runs[0].id])).toThrow("PDF_TEXT_UNSUPPORTED");
});


it("同一段落的相邻行合并为一个编辑框，修改时完整移除并保留其他段落", async () => {
  const pdf = await PDFDocument.create(), page = pdf.addPage([400, 500]);
  page.drawText("First paragraph line\nSecond paragraph line\nThird paragraph line", { x: 20, y: 420, size: 14, lineHeight: 18 });
  page.drawText("Another paragraph", { x: 20, y: 300, size: 14 });
  const bytes = await pdf.save(), runs = readOriginalPdfText(bytes, 0);
  expect(runs).toHaveLength(2);
  expect(runs[0].text).toBe("First paragraph line\nSecond paragraph line\nThird paragraph line");
  expect(runs[0].height).toBeGreaterThan(36);
  const output = removeOriginalPdfText(bytes, [runs[0].id]);
  expect(await extracted(output)).toContain("Another paragraph");
  expect(await extracted(output)).not.toContain("paragraph line");
});


it("提取可复用的嵌入字体并保留原文基线，标准字体缺失时返回空列表", async () => {
  const source = await PDFDocument.create(); source.registerFontkit(fontkit);
  const embeddedBytes = new Uint8Array(readFileSync("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf"));
  const font = await source.embedFont(embeddedBytes, { subset: false });
  source.addPage([300, 400]).drawText("Original text", { x: 25, y: 300, size: 14, font });
  const bytes = await source.save(), embedded = readEmbeddedPdfFonts(bytes, 0);
  expect(embedded).toHaveLength(1);
  expect(embedded[0].bytes.byteLength).toBe(embeddedBytes.byteLength);
  expect(fontkit.create(embedded[0].bytes).characterSet).toContain("A".codePointAt(0));
  const run = readOriginalPdfText(bytes, 0)[0];
  expect(run.baseline).toBeCloseTo(100);
  expect(run.fontName).toContain("LiberationSans");
  const output = await exportEditedPdf(removeOriginalPdfText(bytes, [run.id]), [{ width: 300, height: 400, transform: [1, 0, 0, -1, 0, 400] }], [{ id: 1, kind: "text", page: 0, originalId: run.id, text: "Edited text", fontId: "original", fontSize: run.fontSize, x: run.x, y: run.y, baseline: run.baseline! - run.y, width: 150, height: 40, color: run.color, opacity: 1, strokeWidth: 2 }], { original: embedded[0].bytes }, true);
  expect(readOriginalPdfText(output, 0)[0].baseline).toBeCloseTo(100);
  expect(readEmbeddedPdfFonts(await sample(), 0)).toEqual([]);
});

it("同一视觉行中的同字体片段合并，大间隔的分栏和不同样式仍保持独立", async () => {
  const pdf = await PDFDocument.create(), page = pdf.addPage([500, 400]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const x = 20 + font.widthOfTextAtSize("Hello", 14);
  page.drawText("Hello", { x: 20, y: 300, size: 14, font });
  page.drawText("world", { x: x + 2, y: 300, size: 14, font });
  page.drawText("Other column", { x: 300, y: 300, size: 14, font });
  const bytes = await pdf.save(), runs = readOriginalPdfText(bytes, 0);
  expect(runs).toHaveLength(2);
  expect(runs[0].text.replace(/ /g, "")).toBe("Helloworld");
  expect(runs[1].text).toBe("Other column");
  expect(await extracted(removeOriginalPdfText(bytes, [runs[0].id]))).toContain("Other column");
});

it("在中英混排的大写字母后追加文字时，保留原文起点、字距和水平缩放", async () => {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: false, features: { kern: false, liga: false, clig: false, calt: false } });
  const page = pdf.addPage([500, 400]), original = "原文 AVATAR";
  page.pushOperators(pushGraphicsState(), beginText(), setCharacterSpacing(0.8), setCharacterSqueeze(85), endText());
  page.drawText(original, { font, x: 32, y: 300, size: 16 });
  page.pushOperators(popGraphicsState());
  const before = await pdf.save(), run = readOriginalPdfText(before, 0)[0];
  const output = await exportEditedPdf(removeOriginalPdfText(before, [run.id]), [{ width: 500, height: 400, transform: [1, 0, 0, -1, 0, 400] }], [{
    id: 1, page: 0, kind: "text", originalId: run.id, text: original + " 添加", fontId: "same", fontSize: run.fontSize,
    x: run.x, y: run.y, width: 400, height: 40, baseline: run.baseline! - run.y, textOriginX: run.originX! - run.x,
    characterSpacing: run.characterSpacing, horizontalScale: run.horizontalScale, color: run.color, opacity: 1, strokeWidth: 2,
  }], { same: fontBytes }, true);
  const positions = (bytes: Uint8Array) => {
    const document = new mupdf.PDFDocument(bytes), page = document.loadPage(0), structured = page.toStructuredText("");
    const result: { char: string; x: number }[] = [];
    try { structured.walk({ onChar(char, origin) { result.push({ char, x: origin[0] }); } }); return result; }
    finally { structured.destroy(); page.destroy(); document.destroy(); }
  };
  const expected = positions(before), actual = positions(output);
  for (const [index, glyph] of expected.entries()) {
    expect(actual[index].char).toBe(glyph.char);
    expect(actual[index].x).toBeCloseTo(glyph.x, 2);
  }
});
