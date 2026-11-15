import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPdf, movePages, parsePageRanges } from "./pdfPages";

/** 生成 n 页的 PDF，每页宽度不同，方便核对顺序 */
async function makePdf(n: number, baseWidth = 100) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([baseWidth + i, 200]);
  return doc.save();
}

describe("页码范围", () => {
  it("单页、区间、开放区间，去重并保持顺序", () => {
    expect(parsePageRanges("1-3, 5", 10)).toEqual([0, 1, 2, 4]);
    expect(parsePageRanges("8-", 10)).toEqual([7, 8, 9]);
    expect(parsePageRanges("-2，2", 10)).toEqual([0, 1]);
    expect(parsePageRanges("3～4", 10)).toEqual([2, 3]);
  });

  it("错误输入给出提示", () => {
    expect(() => parsePageRanges("", 5)).toThrow("请输入页码");
    expect(() => parsePageRanges("2-9", 5)).toThrow("超出范围，共 5 页");
    expect(() => parsePageRanges("abc", 5)).toThrow("无法识别");
  });
});

describe("生成 PDF", () => {
  it("删除、重排、旋转、合并多个文件", async () => {
    const a = await makePdf(3, 100);
    const b = await makePdf(2, 300);
    const out = await PDFDocument.load(
      await buildPdf(
        [a, b],
        [
          { source: 1, index: 1, rotation: 0 },
          { source: 0, index: 2, rotation: 90 },
          { source: 0, index: 0, rotation: -90 },
        ],
      ),
    );
    const pages = out.getPages();
    expect(pages.map((p) => p.getWidth())).toEqual([301, 102, 100]);
    expect(pages.map((p) => p.getRotation().angle)).toEqual([0, 90, 270]);
  });

  it("同一页可以出现多次；没有页面时报错", async () => {
    const a = await makePdf(1);
    const out = await PDFDocument.load(await buildPdf([a], [{ source: 0, index: 0, rotation: 0 }, { source: 0, index: 0, rotation: 0 }]));
    expect(out.getPageCount()).toBe(2);
    await expect(buildPdf([a], [])).rejects.toThrow("没有可以保存的页面");
  });

  it("移动页面", () => {
    expect(movePages([1, 2, 3, 4, 5], new Set([4, 5]), 2)).toEqual([1, 4, 5, 2, 3]);
    expect(movePages([1, 2, 3], new Set([1]), null)).toEqual([2, 3, 1]);
  });
});
