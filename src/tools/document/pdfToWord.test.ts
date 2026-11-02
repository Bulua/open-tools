import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildDocx, groupLines, headingLevel, layoutPage, wordFont, type TextPiece } from "./pdfToWord";

/** 一行文字：按字号估算宽度（每个字符 0.5 个字号） */
const piece = (text: string, x: number, y: number, size = 12, extra: Partial<TextPiece> = {}): TextPiece => ({
  text,
  x,
  y,
  size,
  width: text.length * size * 0.5,
  ...extra,
});
const textOf = (layout: ReturnType<typeof layoutPage>) =>
  layout.blocks.map((b) => (b.kind === "text" ? b.lines.map((l) => l.pieces.map((p) => p.text).join("")).join("|") : "[img]"));

describe("PDF 转 Word：排版", () => {
  it("同一基线的文字连成一行，间距补空格", () => {
    const lines = groupLines([piece("Hello", 72, 100), piece("world", 72 + 30 + 4, 100), piece("Next", 72, 115)]);
    expect(lines.map((l) => l.pieces.map((p) => p.text).join(""))).toEqual(["Hello world", "Next"]);
  });

  it("中文之间不补空格", () => {
    const lines = groupLines([piece("中文", 72, 100), piece("文字", 72 + 12 + 1, 100)]);
    expect(lines[0].pieces.map((p) => p.text).join("")).toBe("中文文字");
  });

  it("按行距、短行、缩进分段，居中的标题单独成段", () => {
    const W = 72 + 400; // 版心右边
    const full = (y: number, x = 72) => piece("x".repeat(Math.round((W - x) / 6)), x, y);
    const layout = layoutPage(595, 842, [
      piece("Title", 595 / 2 - 30, 80, 24, { width: 60 }),
      full(130, 96), // 首行缩进
      full(145),
      piece("end of paragraph one", 72, 160),
      full(190, 96),
      full(205),
    ]);
    expect(layout.blocks).toHaveLength(3);
    const [title, p1, p2] = layout.blocks;
    expect(title.kind === "text" && title.align).toBe("center");
    expect(p1.kind === "text" && p1.lines.length).toBe(3);
    expect(p1.kind === "text" && p1.firstLine).toBeCloseTo(24);
    expect(p2.kind === "text" && p2.lines.length).toBe(2);
    expect(p2.kind === "text" && p2.spaceBefore).toBeGreaterThan(5);
  });

  it("字号明显大的短段落是标题", () => {
    const layout = layoutPage(595, 842, [piece("Big", 72, 80, 22), piece("Body text here", 72, 120, 12)]);
    const [h, body] = layout.blocks;
    expect(h.kind === "text" && headingLevel(h, 12)).toBe(1);
    expect(body.kind === "text" && headingLevel(body, 12)).toBe(0);
  });

  it("图片插在所在位置；有文字时整页大的背景图去掉", () => {
    const img = { data: new Uint8Array([1]), type: "png" as const, x: 72, y: 150, width: 200, height: 100 };
    const bg = { ...img, x: 0, y: 0, width: 595, height: 842 };
    const layout = layoutPage(595, 842, [piece("Above", 72, 120), piece("Below", 72, 300)], [img, bg]);
    expect(textOf(layout)).toEqual(["Above", "[img]", "Below"]);
  });

  it("PDF 字体名换成 Word 字体名", () => {
    expect(wordFont("ABCDEF+SimSun")).toBe("宋体");
    expect(wordFont("TimesNewRomanPS-BoldMT")).toBe("Times New Roman");
    expect(wordFont("Helvetica")).toBe("Arial");
    expect(wordFont("XYZ")).toBeUndefined();
  });
});

describe("PDF 转 Word：生成 docx", () => {
  it("包含文字、标题样式和页面大小", async () => {
    const layout = layoutPage(612, 792, [piece("Report", 72, 80, 24), piece("Hello world", 72, 130), piece("中文段落", 72, 145)]);
    const docx = await buildDocx([layout]);
    const xml = strFromU8(unzipSync(docx)["word/document.xml"]);
    expect(xml).toContain("Report");
    expect(xml).toContain('w:pStyle w:val="Heading1"');
    expect(xml).toContain("Hello world");
    expect(xml).toContain("中文段落");
    expect(xml).toMatch(/w:pgSz w:w="12240" w:h="15840"/);
  });
});

describe("PDF 转 Word：从 PDF 读取", () => {
  it("读出 PDF 里的文字并分段", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    page.drawText("Quarterly Report", { x: 72, y: 700, size: 24, font: bold });
    page.drawText("The first line of the body text.", { x: 72, y: 650, size: 12, font: regular });
    page.drawText("A second paragraph after a gap.", { x: 72, y: 610, size: 12, font: regular });
    const { pdfToDocx } = await import("./pdfRead");
    // 测试在 Node 里运行，PDF.js 的 worker 改用文件路径加载
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
    const result = await pdfToDocx(await pdf.save());
    expect(result.pages).toBe(1);
    expect(result.textless).toBe(0);
    const xml = strFromU8(unzipSync(result.docx)["word/document.xml"]);
    expect(xml).toContain("Quarterly Report");
    expect(xml).toContain('w:pStyle w:val="Heading1"');
    expect(xml).toContain("The first line of the body text.");
    expect(xml).toContain("A second paragraph after a gap.");
  });
});
