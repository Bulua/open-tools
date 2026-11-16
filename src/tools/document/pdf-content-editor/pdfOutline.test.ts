import { expect, it, vi } from "vitest";
import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { readPdfOutline, resolveOutlinePage } from "./pdfOutline";
import { exportEditedPdf } from "./pdfEditor";

GlobalWorkerOptions.workerSrc = new URL("../../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

it("没有 PDF 书签时返回空目录，保留嵌套目录的标题和层级", async () => {
  expect(await readPdfOutline({ getOutline: vi.fn().mockResolvedValue(null) })).toEqual([]);
  const result = await readPdfOutline({ getOutline: vi.fn().mockResolvedValue([{ title: "第一章", dest: [0, { name: "Fit" }], items: [{ title: "第一节", dest: "section", items: [] }] }]) });
  expect(result).toEqual([
    { id: "0", title: "第一章", depth: 0, destination: [0, { name: "Fit" }] },
    { id: "0.0", title: "第一节", depth: 1, destination: "section" },
  ]);
});

it("支持命名目标、页对象和页序号，不跳转到无效页面或外部链接", async () => {
  const doc = { numPages: 3, getDestination: vi.fn().mockResolvedValue([{ num: 9, gen: 0 }, { name: "Fit" }]), getPageIndex: vi.fn().mockResolvedValue(2) };
  expect(await resolveOutlinePage(doc, "chapter")).toBe(2);
  expect(doc.getDestination).toHaveBeenCalledWith("chapter");
  expect(doc.getPageIndex).toHaveBeenCalledWith({ num: 9, gen: 0 });
  expect(await resolveOutlinePage(doc, [0])).toBe(0);
  expect(await resolveOutlinePage(doc, [3])).toBeUndefined();
  expect(await resolveOutlinePage(doc, [-1])).toBeUndefined();
  expect(await resolveOutlinePage(doc, null)).toBeUndefined();
  doc.getDestination.mockResolvedValue(null);
  expect(await resolveOutlinePage(doc, "https://example.com")).toBeUndefined();
});

it("从真实 PDF 读取中文书签并定位到第二页", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage(); const target = pdf.addPage();
  const root = pdf.context.nextRef(), chapter = pdf.context.nextRef();
  pdf.context.assign(root, pdf.context.obj({ Type: "Outlines", First: chapter, Last: chapter, Count: 1 }));
  pdf.context.assign(chapter, pdf.context.obj({ Title: PDFHexString.fromText("第二章"), Parent: root, Dest: [target.ref, "Fit"] }));
  pdf.catalog.set(PDFName.of("Outlines"), root);
  const doc = await getDocument({ data: await pdf.save(), isEvalSupported: false }).promise;
  try {
    const entries = await readPdfOutline(doc);
    expect(entries[0].title).toBe("第二章");
    expect(await resolveOutlinePage(doc, entries[0].destination)).toBe(1);
    const metadata = await Promise.all([1, 2].map(async (number) => {
      const viewport = (await doc.getPage(number)).getViewport({ scale: 1 });
      return { width: viewport.width, height: viewport.height, transform: [...viewport.transform] };
    }));
    const edited = await exportEditedPdf(await pdf.save(), metadata, [{ id: 1, page: 0, kind: "rectangle", x: 10, y: 10, width: 40, height: 30, color: "#141413", opacity: 1, strokeWidth: 2 }], {});
    const saved = await getDocument({ data: edited, isEvalSupported: false }).promise;
    try {
      const kept = await readPdfOutline(saved);
      expect(kept[0].title).toBe("第二章");
      expect(await resolveOutlinePage(saved, kept[0].destination)).toBe(1);
    } finally { await saved.destroy(); }
  } finally { await doc.destroy(); }
});
