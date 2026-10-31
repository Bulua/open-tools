import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { DEFAULT_WATERMARK, addWatermark, insertIntoHeader, pageGeometry, removeWatermarks, textWidthEm, watermarkBoxes } from "./docxWatermark";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** 构造一个最小的 docx：两节，第一节有页眉且首页不同，第二节没有页眉 */
function makeDocx() {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document ${W}><w:body>` +
        `<w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="rId8"/><w:titlePg/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr></w:pPr></w:p>` +
        `<w:p><w:r><w:t>正文</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/></w:sectPr></w:body></w:document>`,
    ),
    "word/_rels/document.xml.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>',
    ),
    "word/header1.xml": strToU8(`<?xml version="1.0"?><w:hdr ${W}><w:p><w:r><w:t>公司名称</w:t></w:r></w:p></w:hdr>`),
  };
  return zipSync(files);
}

const read = (docx: Uint8Array) => {
  const files = unzipSync(docx);
  return (name: string) => (files[name] ? strFromU8(files[name]) : "");
};

describe("Word 水印", () => {
  it("已有页眉中插入水印，保留原内容并补齐命名空间", () => {
    const get = read(addWatermark(makeDocx(), { ...DEFAULT_WATERMARK, text: "机密" }));
    const header = get("word/header1.xml");
    expect(header).toContain("公司名称");
    expect(header).toContain('string="机密"');
    expect(header).toContain('xmlns:v="urn:schemas-microsoft-com:vml"');
    expect(header).toContain("rotation:315");
    expect(header.indexOf("PowerPlusWaterMarkObject")).toBeLessThan(header.indexOf("</w:p>"));
  });

  it("首页页眉缺失时新建；第二节沿用前一节的页眉，不重复添加", () => {
    const get = read(addWatermark(makeDocx(), DEFAULT_WATERMARK));
    const doc = get("word/document.xml");
    expect(doc.match(/w:type="first"/g)?.length).toBe(1);
    expect(doc.match(/<w:headerReference/g)?.length).toBe(2);
    expect(get("word/header_otwm1.xml")).toContain("PowerPlusWaterMarkObject");
    expect(get("[Content_Types].xml")).toContain('PartName="/word/header_otwm1.xml"');
    expect(get("word/_rels/document.xml.rels")).toContain('Target="header_otwm1.xml"');
  });

  it("再次添加时替换原有水印，而不是叠加", () => {
    const once = addWatermark(makeDocx(), { ...DEFAULT_WATERMARK, text: "第一次" });
    const header = read(addWatermark(once, { ...DEFAULT_WATERMARK, text: "第二次" }))("word/header1.xml");
    expect(header).not.toContain("第一次");
    expect(header.match(/PowerPlusWaterMarkObject/g)?.length).toBe(1);
  });

  it("图片水印：写入图片并在页眉中建立关系", () => {
    const image = { data: new Uint8Array([1, 2, 3]), type: "png" as const, width: 200, height: 100 };
    const get = read(addWatermark(makeDocx(), { ...DEFAULT_WATERMARK, kind: "image", image }));
    expect(get("word/_rels/header1.xml.rels")).toContain('Target="media/otwm_image.png"');
    expect(get("word/header1.xml")).toContain('gain="19661f"');
    expect(get("[Content_Types].xml")).toContain('Extension="png"');
  });

  it("文字需要填写；不是 docx 时给出提示", () => {
    expect(() => addWatermark(makeDocx(), { ...DEFAULT_WATERMARK, text: " " })).toThrow("请输入水印文字");
    expect(() => addWatermark(new Uint8Array([1, 2, 3]), DEFAULT_WATERMARK)).toThrow(".docx");
  });
});

describe("水印计算", () => {
  it("页面尺寸", () => {
    expect(pageGeometry('<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:left="1800" w:right="1800" w:top="1440" w:bottom="1440"/>')).toMatchObject({
      width: 595.3,
      left: 90,
      top: 72,
    });
  });

  it("自动大小铺满版心宽度；平铺排满整页", () => {
    const page = pageGeometry("");
    const [single] = watermarkBoxes({ ...DEFAULT_WATERMARK, text: "机密" }, page);
    expect(single.width).toBeCloseTo(page.width - page.left - page.right);
    expect(textWidthEm("AB机密")).toBeCloseTo(3.2);
    const tiled = watermarkBoxes({ ...DEFAULT_WATERMARK, tiled: true }, page);
    expect(tiled.length).toBeGreaterThan(6);
    expect(tiled.every((b) => b.x! + b.width > 0 && b.x! < page.width)).toBe(true);
  });

  it("插入空段落与删除水印", () => {
    expect(insertIntoHeader(`<w:hdr ${W}><w:p/></w:hdr>`, "<w:r/>")).toContain("<w:p><w:r/></w:p>");
    expect(removeWatermarks('<w:p><w:r><w:t>a</w:t></w:r><w:r><w:pict><v:shape id="PowerPlusWaterMarkObject1"/></w:pict></w:r></w:p>')).toBe(
      "<w:p><w:r><w:t>a</w:t></w:r></w:p>",
    );
  });
});
