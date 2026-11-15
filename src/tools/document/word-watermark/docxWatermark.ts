import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { t } from "@/locales";

/**
 * 给 Word 文档（.docx）加水印，生成的是 Word 原生水印：
 * 与在 Word 中「设计 → 水印」添加的完全相同，放在页眉里，每一页都有，可以在 Word 里「删除水印」。
 *
 * 做法：
 * - 文档已有的页眉：在页眉第一段里插入水印
 * - 没有页眉的节：新建一个只含水印的页眉（后面没有页眉的节会沿用前一节的页眉，不需要重复添加）
 * - 设置了「首页不同」「奇偶页不同」的，首页页眉、偶数页页眉也加上
 */

export interface WatermarkImage {
  data: Uint8Array;
  type: "png" | "jpeg";
  width: number;
  height: number;
}

export interface WatermarkOptions {
  kind: "text" | "image";
  text: string;
  font: string;
  /** #rrggbb */
  color: string;
  bold: boolean;
  /** 字号（磅），0 表示自动：单个水印铺满版心宽度 */
  size: number;
  /** 0～1 */
  opacity: number;
  layout: "diagonal" | "horizontal";
  /** 平铺：整页排满多个小水印 */
  tiled: boolean;
  image?: WatermarkImage;
  /** 图片宽度占版心宽度的百分比 */
  imageScale: number;
  /** 冲蚀：图片变淡，不影响阅读正文 */
  washout: boolean;
  /** 先删除文档中原有的水印 */
  replace: boolean;
}

export const DEFAULT_WATERMARK: WatermarkOptions = {
  kind: "text",
  text: "内部资料",
  font: "宋体",
  color: "#c0c0c0",
  bold: false,
  size: 0,
  opacity: 0.5,
  layout: "diagonal",
  tiled: false,
  imageScale: 60,
  washout: true,
  replace: true,
};

/** 页面尺寸（磅） */
export interface PageGeometry {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const A4: PageGeometry = { width: 595.3, height: 841.9, left: 90, right: 90, top: 72, bottom: 72 };

const REL_HEADER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header";
const REL_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const CT_HEADER = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml";
const NS = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  v: "urn:schemas-microsoft-com:vml",
  o: "urn:schemas-microsoft-com:office:office",
};
const IMAGE_PATH = "media/otwm_image";

// ---------- 小工具 ----------

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** 文字宽度（以字号为单位）：中文等全角字符 1，其他 0.6 */
export function textWidthEm(text: string): number {
  let em = 0;
  for (const ch of text) em += /[⺀-￯]/.test(ch) ? 1 : 0.6;
  return Math.max(em, 1);
}

/** 从 sectPr 读取页面尺寸和页边距（单位 twip，1/20 磅） */
export function pageGeometry(sectPr: string): PageGeometry {
  const size = sectPr.match(/<w:pgSz\b[^>]*>/)?.[0] ?? "";
  const mar = sectPr.match(/<w:pgMar\b[^>]*>/)?.[0] ?? "";
  const pt = (tag: string, name: string, fallback: number) => {
    const v = Number(attr(tag, `w:${name}`));
    return Number.isFinite(v) && v > 0 ? Math.abs(v) / 20 : fallback;
  };
  return {
    width: pt(size, "w", A4.width),
    height: pt(size, "h", A4.height),
    left: pt(mar, "left", A4.left),
    right: pt(mar, "right", A4.right),
    top: pt(mar, "top", A4.top),
    bottom: pt(mar, "bottom", A4.bottom),
  };
}

// ---------- 水印形状 ----------

interface Box {
  width: number;
  height: number;
  /** 平铺时相对页面左上角的位置；不平铺时居中于版心 */
  x?: number;
  y?: number;
}

/** 水印的尺寸与位置（磅） */
export function watermarkBoxes(o: WatermarkOptions, page: PageGeometry): Box[] {
  const contentW = page.width - page.left - page.right;
  const contentH = page.height - page.top - page.bottom;

  let width: number;
  let height: number;
  if (o.kind === "image" && o.image) {
    width = (contentW * o.imageScale) / 100 / (o.tiled ? 3 : 1);
    height = (width * o.image.height) / o.image.width;
  } else {
    const em = textWidthEm(o.text);
    let font = o.size;
    if (!font) font = o.tiled ? Math.min(36, (page.width / 3) * 0.75 / em) : Math.min(contentW / em, contentH / 3);
    width = font * em;
    height = font;
  }

  if (!o.tiled) return [{ width, height }];

  // 平铺：3 列，行数按页面高度排满，隔行错开半格
  const cols = 3;
  const cellW = page.width / cols;
  const rows = Math.max(2, Math.round(page.height / Math.max(cellW * 0.75, height * 2.5)));
  const cellH = page.height / rows;
  const boxes: Box[] = [];
  for (let r = 0; r < rows; r++) {
    const shift = r % 2 ? cellW / 2 : 0;
    for (let c = r % 2 ? -1 : 0; c < cols; c++) {
      const cx = (c + 0.5) * cellW + shift;
      if (cx - width / 2 > page.width || cx + width / 2 < 0) continue;
      boxes.push({ width, height, x: cx - width / 2, y: (r + 0.5) * cellH - height / 2 });
    }
  }
  return boxes;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

const TEXT_SHAPETYPE =
  '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/><v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottom" xrange="6629,14971"/></v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>';

const IMAGE_SHAPETYPE =
  '<v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f"><v:stroke joinstyle="miter"/><v:formulas><v:f eqn="if lineDrawn pixelLineWidth 0"/><v:f eqn="sum @0 1 0"/><v:f eqn="sum 0 0 @1"/><v:f eqn="prod @2 1 2"/><v:f eqn="prod @3 21600 pixelWidth"/><v:f eqn="prod @3 21600 pixelHeight"/><v:f eqn="sum @0 0 1"/><v:f eqn="prod @6 1 2"/><v:f eqn="prod @7 21600 pixelWidth"/><v:f eqn="sum @8 21600 0"/><v:f eqn="prod @7 21600 pixelHeight"/><v:f eqn="sum @10 21600 0"/></v:formulas><v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/><o:lock v:ext="edit" aspectratio="t"/></v:shapetype>';

let shapeCounter = 0;

/** 生成插入页眉的水印（一个 w:r，里面是若干 VML 形状） */
export function watermarkRun(o: WatermarkOptions, page: PageGeometry, imageRelId = "", withShapetype = true): string {
  const isImage = o.kind === "image" && !!o.image;
  const rotation = !isImage && o.layout === "diagonal" ? "rotation:315;" : "";
  const shapes = watermarkBoxes(o, page).map((b) => {
    const n = ++shapeCounter;
    const position =
      b.x === undefined
        ? "margin-left:0;margin-top:0;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin"
        : `margin-left:${fmt(b.x)}pt;margin-top:${fmt(b.y!)}pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page`;
    const style = `position:absolute;${position};width:${fmt(b.width)}pt;height:${fmt(b.height)}pt;${rotation}z-index:-251654144`;
    if (isImage) {
      const washout = o.washout ? ' gain="19661f" blacklevel="22938f"' : "";
      return `<v:shape id="WordPictureWatermark${n}" o:spid="_x0000_s${2048 + n}" type="#_x0000_t75" style="${style}" o:allowincell="f"><v:imagedata r:id="${imageRelId}" o:title=""${washout}/></v:shape>`;
    }
    const font = `font-family:&quot;${escapeXml(o.font)}&quot;;font-size:1pt${o.bold ? ";font-weight:bold" : ""}`;
    return `<v:shape id="PowerPlusWaterMarkObject${n}" o:spid="_x0000_s${2048 + n}" type="#_x0000_t136" style="${style}" o:allowincell="f" fillcolor="${o.color}" stroked="f"><v:fill opacity="${fmt(o.opacity)}"/><v:textpath style="${font}" string="${escapeXml(o.text)}"/></v:shape>`;
  });
  const shapetype = withShapetype ? (isImage ? IMAGE_SHAPETYPE : TEXT_SHAPETYPE) : "";
  return `<w:r><w:rPr><w:noProof/></w:rPr><w:pict>${shapetype}${shapes.join("")}</w:pict></w:r>`;
}

/** 删除页眉中已有的水印（Word、WPS 添加的水印都用这两个名字） */
export function removeWatermarks(xml: string): string {
  return xml.replace(/<w:r\b(?:(?!<\/w:r>)[\s\S])*?(?:PowerPlusWaterMarkObject|WordPictureWatermark)[\s\S]*?<\/w:r>/g, "");
}

/** 确保根元素声明了水印需要的命名空间 */
function ensureNamespaces(xml: string, root: string): string {
  return xml.replace(new RegExp(`<${root}\\b[^>]*>`), (tag) => {
    let out = tag.slice(0, -1);
    for (const [prefix, uri] of Object.entries(NS)) if (!new RegExp(`\\sxmlns:${prefix}=`).test(out)) out += ` xmlns:${prefix}="${uri}"`;
    return `${out}>`;
  });
}

/** 把水印插入页眉：放进第一个段落末尾，不额外增加页眉的高度 */
export function insertIntoHeader(xml: string, run: string): string {
  const body = xml.search(/<w:hdr\b/);
  const close = xml.indexOf("</w:p>", body);
  const empty = xml.slice(body).search(/<w:p\b[^>]*\/>/);
  const emptyAt = empty < 0 ? -1 : body + empty;
  if (emptyAt >= 0 && (close < 0 || emptyAt < close)) {
    const tag = xml.slice(emptyAt).match(/<w:p\b[^>]*\/>/)![0];
    return xml.slice(0, emptyAt) + tag.replace(/\s*\/>$/, ">") + run + "</w:p>" + xml.slice(emptyAt + tag.length);
  }
  if (close >= 0) return xml.slice(0, close) + run + xml.slice(close);
  return xml.replace("</w:hdr>", `<w:p>${run}</w:p></w:hdr>`);
}

// ---------- 关系文件 ----------

interface Rel {
  id: string;
  type: string;
  target: string;
}
const parseRels = (xml: string): Rel[] =>
  [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => ({ id: attr(m[0], "Id") ?? "", type: attr(m[0], "Type") ?? "", target: attr(m[0], "Target") ?? "" }));

const EMPTY_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

const uniqueId = (base: string, used: Set<string>) => {
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}${i}`;
  used.add(id);
  return id;
};

/** word/ 下的相对路径 → 包内完整路径 */
const partPath = (target: string) => (target.startsWith("/") ? target.slice(1) : `word/${target}`).replace(/\/\.\//g, "/");

const relsPathOf = (part: string) => part.replace(/([^/]+)$/, "_rels/$1.rels");

// ---------- 主流程 ----------

export function addWatermark(docx: Uint8Array, options: WatermarkOptions): Uint8Array {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(docx);
  } catch {
    throw new Error(t("document.notDocx"));
  }
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : "");
  const write = (path: string, text: string) => (files[path] = strToU8(text));

  let documentXml = read("word/document.xml");
  if (!documentXml) throw new Error(t("document.oldDoc"));
  if (!/<w:sectPr\b/.test(documentXml)) throw new Error(t("document.noSection"));
  const o = options;
  if (o.kind === "text" && !o.text.trim()) throw new Error(t("document.needText"));
  if (o.kind === "image" && !o.image) throw new Error(t("document.needImage"));

  let docRels = read("word/_rels/document.xml.rels") || EMPTY_RELS;
  let contentTypes = read("[Content_Types].xml");
  const rels = parseRels(docRels);
  const usedIds = new Set(rels.map((r) => r.id));
  const headerById = new Map(rels.filter((r) => r.type === REL_HEADER).map((r) => [r.id, partPath(r.target)]));

  const evenAndOdd = /<w:evenAndOddHeaders(?![^>]*w:val="(?:0|false)")[^>]*\/?>/.test(read("word/settings.xml"));

  // 图片水印：图片放进 media，每个用到它的页眉都需要一条关系
  const imageExt = o.image?.type === "jpeg" ? "jpeg" : "png";
  const imagePart = `word/${IMAGE_PATH}.${imageExt}`;
  if (o.kind === "image" && o.image) {
    files[imagePart] = o.image.data;
    if (!new RegExp(`Extension="${imageExt}"`, "i").test(contentTypes)) {
      contentTypes = contentTypes.replace("</Types>", `<Default Extension="${imageExt}" ContentType="image/${imageExt}"/></Types>`);
    }
  }

  /** 给一个页眉加水印 */
  const stamp = (headerPart: string, page: PageGeometry) => {
    let xml = read(headerPart);
    if (!xml) return;
    if (o.replace) xml = removeWatermarks(xml);
    let relId = "";
    if (o.kind === "image") {
      const relsPath = relsPathOf(headerPart);
      let headerRels = read(relsPath) || EMPTY_RELS;
      const existing = parseRels(headerRels).find((r) => r.type === REL_IMAGE && partPath(r.target) === imagePart);
      relId = existing?.id ?? uniqueId("rIdOtWmImg", new Set(parseRels(headerRels).map((r) => r.id)));
      if (!existing) {
        headerRels = headerRels.replace("</Relationships>", `<Relationship Id="${relId}" Type="${REL_IMAGE}" Target="${IMAGE_PATH}.${imageExt}"/></Relationships>`);
        write(relsPath, headerRels);
      }
    }
    const hasShapetype = xml.includes(o.kind === "image" ? 'id="_x0000_t75"' : 'id="_x0000_t136"');
    xml = ensureNamespaces(xml, "w:hdr");
    write(headerPart, insertIntoHeader(xml, watermarkRun(o, page, relId, !hasShapetype)));
  };

  /** 新建只含水印的页眉，返回关系 id */
  let created = 0;
  const createHeader = (page: PageGeometry) => {
    let name: string;
    do name = `header_otwm${++created}.xml`;
    while (files[`word/${name}`]);
    const part = `word/${name}`;
    write(
      part,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:v="${NS.v}" xmlns:o="${NS.o}"><w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p></w:hdr>`,
    );
    contentTypes = contentTypes.replace("</Types>", `<Override PartName="/${part}" ContentType="${CT_HEADER}"/></Types>`);
    const id = uniqueId("rIdOtWmHdr", usedIds);
    docRels = docRels.replace("</Relationships>", `<Relationship Id="${id}" Type="${REL_HEADER}" Target="${name}"/></Relationships>`);
    stamp(part, page);
    return id;
  };

  // 逐节处理：节没有某类页眉时沿用前一节的，所以只有「之前都没有」时才需要新建
  const seen = new Set<string>();
  const stamped = new Set<string>();
  /** 新建的页眉可以给多个节、多个类型共用 */
  let sharedHeaderId = "";
  documentXml = documentXml.replace(/<w:sectPr\b[^>]*\/>|<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g, (sect) => {
    const page = pageGeometry(sect);
    const types = ["default"];
    if (/<w:titlePg(?![^>]*w:val="(?:0|false)")[^>]*\/?>/.test(sect)) types.push("first");
    if (evenAndOdd) types.push("even");

    const refs = new Map(
      [...sect.matchAll(/<w:headerReference\b[^>]*>/g)].map((m) => [attr(m[0], "w:type") ?? "default", attr(m[0], "r:id") ?? ""]),
    );
    for (const id of refs.values()) {
      const part = headerById.get(id);
      if (part && !stamped.has(part)) {
        stamped.add(part);
        stamp(part, page);
      }
    }

    let added = "";
    for (const type of types) {
      if (refs.has(type)) seen.add(type);
      else if (!seen.has(type)) {
        sharedHeaderId ||= createHeader(page);
        added += `<w:headerReference w:type="${type}" r:id="${sharedHeaderId}"/>`;
        seen.add(type);
      }
    }
    if (!added) return sect;
    // headerReference 必须是 sectPr 的第一批子元素
    return sect.endsWith("/>") ? sect.replace(/\s*\/>$/, `>${added}</w:sectPr>`) : sect.replace(/^<w:sectPr\b[^>]*>/, (open) => open + added);
  });

  documentXml = ensureNamespaces(documentXml, "w:document");

  write("word/document.xml", documentXml);
  write("word/_rels/document.xml.rels", docRels);
  write("[Content_Types].xml", contentTypes);

  const zippable: Zippable = {};
  for (const [name, data] of Object.entries(files)) zippable[name] = [data, { level: /\.(png|jpe?g|gif|emf|wmf)$/i.test(name) ? 0 : 6 }];
  return zipSync(zippable);
}

/** 文件名：a.docx → a_水印.docx */
export const watermarkedName = (name: string) => name.replace(/(\.docx)?$/i, `_${t("document.watermarkedSuffix")}.docx`);
