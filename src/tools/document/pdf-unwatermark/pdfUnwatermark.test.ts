import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream, degrees, rgb, type PDFPage } from "pdf-lib";
import { parseContent, removePdfWatermarks, scanPdf } from "./pdfUnwatermark";

/** 1×1 像素的 PNG */
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

async function makePdf(pages: number, draw: (page: PDFPage, doc: PDFDocument, i: number) => Promise<void> | void) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Body text on page ${i + 1}`, { x: 72, y: 760, size: 12, font });
    await draw(page, doc, i);
  }
  return doc.save();
}

/** 页面内容里能看到的文字（pdf-lib 用十六进制字符串写标准字体的文字） */
async function pageTexts(data: Uint8Array, index = 0) {
  const doc = await PDFDocument.load(data);
  const contents = doc.getPage(index).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
  const content = streams.map((s) => (s instanceof PDFRawStream ? new TextDecoder("latin1").decode(decodePDFRawStream(s).decode()) : "")).join("\n");
  return parseContent(content)
    .filter((o) => o.op === "Tj")
    .map((o) => (o.args[0] as { s: string }).s)
    .join("|");
}

describe("PDF 去水印：内容流解析", () => {
  it("字符串转义、嵌套括号、十六进制、字典、内嵌图片", () => {
    const ops = parseContent("BT (a\\(b\\) (c) \\101) Tj <48 49> Tj ET /Artifact <</Subtype /Watermark>> BDC EMC BI /W 1 /H 1 ID \x00EI\x01 EI Q");
    expect(ops.map((o) => o.op)).toEqual(["BT", "Tj", "Tj", "ET", "BDC", "EMC", "BI", "Q"]);
    expect((ops[1].args[0] as { s: string }).s).toBe("a(b) (c) A");
    expect((ops[2].args[0] as { s: string }).s).toBe("HI");
    expect(ops[4].args[1]).toMatchObject({ d: new Map([["Subtype", { n: "Watermark" }]]) });
  });
});

describe("PDF 去水印：识别与删除", () => {
  it("每页都有的斜着、半透明文字：识别并删除，正文保留", async () => {
    const pdf = await makePdf(3, async (page, doc) => {
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      page.drawText("CONFIDENTIAL", { x: 150, y: 300, size: 60, font, rotate: degrees(45), opacity: 0.3, color: rgb(0.7, 0.7, 0.7) });
    });
    const scan = await scanPdf(pdf);
    expect(scan.found).toHaveLength(1);
    expect(scan.found[0]).toMatchObject({ kind: "text", text: "CONFIDENTIAL", checked: true, pages: [0, 1, 2] });
    expect(scan.found[0].reason).toContain("全部 3 页");

    const out = await removePdfWatermarks(pdf, scan, [scan.found[0].key]);
    expect((await scanPdf(out)).found).toHaveLength(0);
    for (let i = 0; i < 3; i++) {
      const texts = await pageTexts(out, i);
      expect(texts).toContain(`Body text on page ${i + 1}`);
      expect(texts).not.toContain("CONFIDENTIAL");
    }
  });

  it("没有勾选的不删除", async () => {
    const pdf = await makePdf(2, async (page, doc) => {
      page.drawText("DRAFT", { x: 150, y: 300, size: 60, font: await doc.embedFont(StandardFonts.Helvetica), rotate: degrees(30), opacity: 0.2 });
    });
    const scan = await scanPdf(pdf);
    expect(await pageTexts(await removePdfWatermarks(pdf, scan, []))).toContain("DRAFT");
  });

  it("半透明图片水印默认勾选，不透明的 Logo 只列出", async () => {
    const pdf = await makePdf(2, async (page, doc) => {
      const img = await doc.embedPng(PNG);
      page.drawImage(img, { x: 100, y: 200, width: 300, height: 300, opacity: 0.25 });
      page.drawImage(await doc.embedPng(PNG), { x: 20, y: 800, width: 30, height: 30 });
    });
    const scan = await scanPdf(pdf);
    const images = scan.found.filter((f) => f.kind === "image");
    expect(images.map((f) => f.checked).sort()).toEqual([false, true]);
    const out = await removePdfWatermarks(pdf, scan, images.filter((f) => f.checked).map((f) => f.key));
    const left = (await scanPdf(out)).found.filter((f) => f.kind === "image");
    expect(left).toHaveLength(1);
    expect(left[0].checked).toBe(false);
  });

  it("Acrobat 的水印标记、水印注释", async () => {
    const pdf = await makePdf(1, (page, doc) => {
      const fontName = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict).keys()[0].decodeText();
      const content = doc.context.flateStream(
        `q BT /${fontName} 12 Tf 72 700 Td (Hello) Tj ET Q /Artifact <</Subtype /Watermark /Type /Pagination>> BDC q BT /${fontName} 40 Tf 100 400 Td (SAMPLE) Tj ET Q EMC`,
      );
      page.node.set(PDFName.of("Contents"), doc.context.register(content));
      const annot = doc.context.obj({ Type: "Annot", Subtype: "Watermark", Rect: [0, 0, 100, 100] });
      page.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(annot)]));
    });
    const scan = await scanPdf(pdf);
    expect(scan.found.find((f) => f.kind === "marked")).toMatchObject({ text: "SAMPLE", sure: true, checked: true });
    expect(scan.found.find((f) => f.kind === "annot")).toMatchObject({ checked: true });

    const out = await removePdfWatermarks(pdf, scan, scan.found.map((f) => f.key));
    expect(await pageTexts(out)).toBe("Hello");
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
  });

  it("放在 Form XObject 里、多页共用的水印：从 Form 里删除", async () => {
    // 先做一页只有水印文字的 PDF，再作为 Form 斜着、半透明地画到每一页上
    const stamp = await PDFDocument.create();
    stamp.addPage([300, 80]).drawText("COPY", { x: 10, y: 20, size: 48, font: await stamp.embedFont(StandardFonts.Helvetica) });
    const stampBytes = await stamp.save();
    let form: Awaited<ReturnType<PDFDocument["embedPdf"]>>[number] | undefined;
    const pdf = await makePdf(2, async (page, doc) => {
      form ??= (await doc.embedPdf(stampBytes))[0];
      page.drawPage(form, { x: 150, y: 300, rotate: degrees(40), opacity: 0.3 });
    });
    const scan = await scanPdf(pdf);
    const copy = scan.found.find((f) => f.text === "COPY")!;
    expect(copy).toMatchObject({ kind: "text", checked: true, pages: [0, 1] });
    expect(copy.places.every((p) => p.target.startsWith("form:"))).toBe(true);
    const out = await removePdfWatermarks(pdf, scan, [copy.key]);
    expect((await scanPdf(out)).found).toHaveLength(0);
    expect(await pageTexts(out, 1)).toContain("Body text on page 2");
  });
});
