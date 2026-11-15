import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { DEFAULT_WATERMARK, addWatermark } from "../word-watermark/docxWatermark";
import { describeRun, outerRuns, removeFound, scanDocx } from "./docxUnwatermark";

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** 页眉里的 VML 艺术字（自制水印：没有水印名称，但衬于文字下方、旋转） */
const wordArt = (n: number) =>
  `<w:r><w:pict><v:shape id="_x0000_s${n}" style="position:absolute;margin-left:${n}pt;width:120pt;height:30pt;rotation:315;z-index:-1"><v:fill opacity=".3"/><v:textpath string="内部 &amp; 机密"/></v:shape></w:pict></w:r>`;
/** 浮动图片（DrawingML） */
const anchoredImage = (rel: string, behind: boolean, name = "图片 1") =>
  `<w:r><w:drawing><wp:anchor behindDoc="${behind ? 1 : 0}"><wp:extent cx="2540000" cy="1270000"/><wp:docPr id="5" name="${name}"/><a:graphic><a:graphicData><a:blip r:embed="${rel}"/></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
/** Word「设计 → 水印」生成的水印：放在 sdt 里 */
const wordWatermark =
  '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Watermarks"/></w:docPartObj></w:sdtPr><w:sdtContent><w:r><w:pict><v:shape id="PowerPlusWaterMarkObject1" style="position:absolute;rotation:315;z-index:-1"><v:textpath string="草稿"/></v:shape></w:pict></w:r></w:sdtContent></w:sdt>';
/** 正文里的普通文本框（嵌套了 w:r），不应被当成水印 */
const textBox =
  '<w:r><w:pict><v:shape style="position:absolute;width:100pt"><v:textbox><w:txbxContent><w:p><w:r><w:t>框里的字</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>';

function makeDocx() {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document ${W}><w:background w:color="FFFFFF"><v:background><v:fill r:id="rId20" type="frame"/></v:background></w:background><w:body>` +
        `<w:p><w:r><w:t>正文开头</w:t></w:r>${textBox}${anchoredImage("rId21", true)}<w:r><w:t>正文结尾</w:t></w:r></w:p>` +
        `<w:sectPr><w:headerReference w:type="default" r:id="rId8"/></w:sectPr></w:body></w:document>`,
    ),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId8" Type="${REL}/header" Target="header1.xml"/><Relationship Id="rId20" Type="${REL}/image" Target="media/bg.png"/><Relationship Id="rId21" Type="${REL}/image" Target="media/photo.png"/></Relationships>`,
    ),
    "word/header1.xml": strToU8(
      `<?xml version="1.0"?><w:hdr ${W}><w:p><w:r><w:t>公司名称</w:t></w:r>${wordWatermark}${wordArt(1)}${wordArt(2)}${wordArt(3)}${anchoredImage("rId1", false, "Logo")}</w:p></w:hdr>`,
    ),
    "word/_rels/header1.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/image" Target="media/logo.png"/></Relationships>`,
    ),
    "word/settings.xml": strToU8(`<?xml version="1.0"?><w:settings ${W}><w:displayBackgroundShape/></w:settings>`),
    "word/media/bg.png": new Uint8Array([1]),
    "word/media/photo.png": new Uint8Array([2]),
    "word/media/logo.png": new Uint8Array([3]),
  };
  return zipSync(files);
}

const read = (docx: Uint8Array) => {
  const files = unzipSync(docx);
  return (name: string) => (files[name] ? strFromU8(files[name]) : "");
};

describe("Word 去水印：解析", () => {
  it("按嵌套找出最外层的 w:r，不把 w:rPr 当成 w:r", () => {
    const xml = `<w:p><w:r><w:rPr/><w:t>a</w:t></w:r>${textBox}<w:r/></w:p>`;
    const runs = outerRuns(xml).map(([s, e]) => xml.slice(s, e));
    expect(runs).toHaveLength(3);
    expect(runs[1]).toBe(textBox);
  });

  it("读出图形的特征", () => {
    const s = describeRun(wordArt(1))!;
    expect(s).toMatchObject({ text: "内部 & 机密", floating: true, behind: true, wordArt: true, translucent: true, rotated: true, width: 120 });
    expect(describeRun("<w:r><w:t>文字</w:t></w:r>")).toBeNull();
  });
});

describe("Word 去水印：识别", () => {
  const { found } = scanDocx(makeDocx());
  const byLabel = (text: string) => found.find((f) => f.text === text || f.label === text);

  it("Word 水印、自制水印默认勾选，平铺的合并为一项", () => {
    expect(byLabel("草稿")).toMatchObject({ sure: true, checked: true, where: "header", count: 1 });
    expect(byLabel("内部 & 机密")).toMatchObject({ sure: true, checked: true, kind: "text", count: 3 });
  });

  it("页眉 Logo、正文里衬于文字下方的图片列出但不勾选，普通文本框不列出", () => {
    expect(found.find((f) => f.image === "word/media/logo.png")).toMatchObject({ checked: false, where: "header" });
    expect(found.find((f) => f.image === "word/media/photo.png")).toMatchObject({ checked: false, where: "body" });
    expect(byLabel("框里的字")).toBeUndefined();
  });

  it("背景图片默认勾选", () => {
    expect(byLabel("页面背景图片")).toMatchObject({ checked: true, image: "word/media/bg.png" });
  });
});

describe("Word 去水印：删除", () => {
  it("只删除勾选的，正文、Logo 保留", () => {
    const scan = scanDocx(makeDocx());
    const get = read(removeFound(scan, scan.found.filter((f) => f.checked).map((f) => f.key)));
    const header = get("word/header1.xml");
    expect(header).toContain("公司名称");
    expect(header).toContain('name="Logo"');
    expect(header).not.toContain("PowerPlusWaterMarkObject");
    expect(header).not.toContain("textpath");
    const doc = get("word/document.xml");
    expect(doc).not.toContain("<w:background");
    expect(doc).toContain("正文开头");
    expect(doc).toContain("框里的字");
    expect(doc).toContain('r:embed="rId21"');
    expect(doc).toContain("正文结尾");
    expect(get("word/settings.xml")).not.toContain("displayBackgroundShape");
    // 删除后再扫描：只剩没勾选的
    expect(scanDocx(removeFound(scan, scan.found.filter((f) => f.checked).map((f) => f.key))).found.every((f) => !f.checked)).toBe(true);
  });

  it("能去掉「Word 添加水印」工具加的平铺水印", () => {
    const watermarked = addWatermark(makeDocx(), { ...DEFAULT_WATERMARK, text: "样本", tiled: true, replace: true });
    const scan = scanDocx(watermarked);
    const sample = scan.found.find((f) => f.text === "样本")!;
    expect(sample).toMatchObject({ sure: true, checked: true });
    const header = read(removeFound(scan, [sample.key]))("word/header1.xml");
    expect(header).not.toContain("样本");
    expect(header).toContain("公司名称");
  });
});
