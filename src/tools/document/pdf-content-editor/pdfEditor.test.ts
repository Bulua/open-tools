import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { GlobalWorkerOptions, getDocument, Util } from "pdfjs-dist";
import { type PdfEditObject, type PdfEditPage } from "./pdfEditorModel";
import { exportEditedPdf, overlayPlacement } from "./pdfEditor";

GlobalWorkerOptions.workerSrc = new URL("../../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
const font = new Uint8Array(readFileSync("src/assets/fonts/NotoSansCJKsc-Regular.otf"));
const page: PdfEditPage = { width: 200, height: 300, transform: [1, 0, 0, -1, 0, 300] };
const object = (patch: Partial<PdfEditObject> = {}): PdfEditObject => ({ id: 1, page: 0, kind: "text", x: 15, y: 20, width: 160, height: 50, text: "中文 English 日本語", fontId: "default", fontSize: 12, color: "#141413", opacity: 1, strokeWidth: 2, ...patch });

async function source(rotation = 0, crop = false) {
  const pdf = await PDFDocument.create(); const page = pdf.addPage([200, 300]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Original", { x: 50, y: 100, font, size: 12 });
  page.setRotation(degrees(rotation));
  if (crop) page.setCropBox(20, 30, 160, 240);
  return pdf.save();
}
async function read(data: Uint8Array) { return getDocument({ data: data.slice(), isEvalSupported: false, disableFontFace: true }).promise; }

describe("PDF 内容编辑导出", () => {
  it("页面坐标转换包含旋转和裁切偏移", () => {
    expect(overlayPlacement(page)).toEqual({ x: 0, y: 0, rotation: 0 });
    expect(overlayPlacement({ width: 240, height: 160, transform: [0, 1, 1, 0, -30, -20] })).toEqual({ x: 180, y: 30, rotation: 90 });
  });
  it("多个非连续页面的叠加内容都能导出，未修改的页面保持原样", async () => {
    const original = await PDFDocument.create();
    for (let index = 0; index < 4; index++) original.addPage([200, 300]).drawText(`Page ${index + 1}`, { x: 10, y: 260, size: 12 });
    const output = await exportEditedPdf(await original.save(), [page, page, page, page], [
      object({ page: 1, text: "Added second" }),
      object({ id: 2, page: 3, text: "Added fourth" }),
    ], { default: font });
    const pdf = await read(output);
    try {
      expect(pdf.numPages).toBe(4);
      for (let index = 0; index < 4; index++) {
        const content = await (await pdf.getPage(index + 1)).getTextContent();
        const text = content.items.map((item) => "str" in item ? item.str : "").join(" ");
        expect(text).toContain(`Page ${index + 1}`);
        if (index === 1) expect(text).toContain("Added second");
        else if (index === 3) expect(text).toContain("Added fourth");
        else expect(text).not.toContain("Added");
      }
    } finally { await pdf.destroy(); }
  });

  it("只删除原文、不绘制新内容时不会嵌入空页面，也不影响其他页面的叠加", async () => {
    const original = await PDFDocument.create();
    original.addPage([200, 300]); original.addPage([200, 300]);
    const data = await original.save();
    const deleted = object({ text: "", originalId: "0:0:0" });
    for (const items of [[deleted], [deleted, object({ id: 2, page: 1, text: "Still added" })]]) {
      const output = await exportEditedPdf(data, [page, page], items, { default: font }, true);
      const pdf = await read(output);
      try {
        expect(pdf.numPages).toBe(2);
        const first = await (await pdf.getPage(1)).getTextContent();
        expect(first.items).toHaveLength(0);
        const second = await (await pdf.getPage(2)).getTextContent();
        expect(second.items.map((item) => "str" in item ? item.str : "").join(" ")).toBe(items.length === 2 ? "Still added" : "");
      } finally { await pdf.destroy(); }
    }
  });

  it("保留原文，同时新增可搜索的中英日文字", async () => {
    const original = await source();
    const output = await exportEditedPdf(original, [page], [object()], { default: font });
    const pdf = await read(output);
    try {
      expect(pdf.numPages).toBe(1);
      const content = await (await pdf.getPage(1)).getTextContent();
      const text = content.items.filter((i) => "str" in i).map((i) => "str" in i ? i.str : "").join(" ");
      expect(text).toContain("Original"); expect(text).toContain("中文"); expect(text).toContain("日本語");
      expect(original).not.toEqual(output);
    } finally { await pdf.destroy(); }
  });
  it.each([0, 90, 180, 270])("旋转 %s 度并裁切的页面导出后，文字仍在可见页面指定位置", async (rotation) => {
    const original = await source(rotation, true);
    const input = await read(original);
    const viewport = (await input.getPage(1)).getViewport({ scale: 1 });
    const metadata = { width: viewport.width, height: viewport.height, transform: [...viewport.transform] };
    await input.destroy();
    const output = await exportEditedPdf(original, [metadata], [object({ text: "位置", width: 100 })], { default: font });
    const pdf = await read(output);
    try {
      const renderedPage = await pdf.getPage(1), content = await renderedPage.getTextContent();
      const item = content.items.find((i) => "str" in i && i.str === "位置");
      expect(item && "transform" in item).toBe(true);
      if (item && "transform" in item) {
        const position = Util.transform(renderedPage.getViewport({ scale: 1 }).transform, item.transform);
        expect(position[4]).toBeCloseTo(15, 2);
        expect(position[5]).toBeGreaterThan(20); expect(position[5]).toBeLessThan(40);
      }
    } finally { await pdf.destroy(); }
  });
  it("图形、透明高亮和手写笔迹能导出，不移除原有页面内容", async () => {
    const items = (["highlight", "rectangle", "ellipse", "line", "arrow", "signature"] as const).map((kind, id) => object({ id, kind, text: undefined, opacity: 0.3, points: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }] }));
    const output = await exportEditedPdf(await source(), [page], items, {});
    const pdf = await read(output);
    try {
      const p = await pdf.getPage(1); const content = await p.getTextContent();
      expect(content.items.some((item) => "str" in item && item.str === "Original")).toBe(true);
      expect((await p.getOperatorList()).fnArray.length).toBeGreaterThan(20);
    } finally { await pdf.destroy(); }
  });
  it("导出 PNG 图片后仍能被 PDF 渲染器识别为图片对象", async () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
    const output = await exportEditedPdf(await source(), [page], [object({ kind: "image", image: png })], {});
    const pdf = await read(output);
    try { expect((await (await pdf.getPage(1)).getOperatorList()).fnArray.length).toBeGreaterThan(10); }
    finally { await pdf.destroy(); }
  });
  it("文本溢出、缺少字体或页码错误时拒绝生成不完整文件", async () => {
    const original = await source();
    await expect(exportEditedPdf(original, [page], [object({ height: 4 })], { default: font })).rejects.toThrow("超出");
    await expect(exportEditedPdf(original, [page], [object({ text: "Hello world", width: 20, height: 150 })], { default: font })).rejects.toThrow("超出");
    await expect(exportEditedPdf(original, [page], [object()], {})).rejects.toThrow("字体");
    await expect(exportEditedPdf(original, [page], [object({ page: 5 })], {})).rejects.toThrow("页面");
  });
  it("导出保留显式换行与行距，不按文本框宽度拆分单词", async () => {
    const output = await exportEditedPdf(await source(), [page], [object({ text: "Hello world\nNext line", fontSize: 12, width: 140, height: 30, lineHeight: 15 })], { default: font });
    const pdf = await read(output);
    try {
      const content = await (await pdf.getPage(1)).getTextContent();
      const first = content.items.find((item) => "str" in item && item.str === "Hello world");
      const second = content.items.find((item) => "str" in item && item.str === "Next line");
      expect(first && "transform" in first).toBe(true);
      expect(second && "transform" in second).toBe(true);
      if (first && "transform" in first && second && "transform" in second) expect(first.transform[5] - second.transform[5]).toBeCloseTo(15);
    } finally { await pdf.destroy(); }
  });
});
