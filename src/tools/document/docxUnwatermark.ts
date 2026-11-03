import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { t } from "@/locales";

/**
 * Word 去水印：找出 .docx 里的水印，按用户勾选的删除。
 *
 * 水印在文件里有几种样子：
 * - Word「设计 → 水印」、WPS「插入 → 水印」加的：页眉里名为 PowerPlusWaterMarkObject / WordPictureWatermark 的形状，可以确定
 * - 自己做的：页眉里衬于文字下方、半透明或旋转的艺术字、文本框、图片（常见于平铺水印），没有统一标记，按特征判断
 * - 正文里衬于文字下方的浮动图片、艺术字：容易是正常内容，只列出来，默认不勾选
 * - 页面背景（「设计 → 页面颜色」，包括背景图片）
 *
 * 只删除水印所在的 w:r（一个图形），正文和格式不受影响。同样的水印（平铺的多个、多个页眉里的）合并成一项。
 */

export interface WatermarkPart {
  /** 包内路径，例如 word/header1.xml */
  part: string;
  start: number;
  end: number;
}

export interface FoundWatermark {
  key: string;
  kind: "text" | "image" | "shape" | "background";
  /** 显示名称，例如「文字水印」「页眉中的半透明图片」 */
  label: string;
  /** 水印文字（文字水印、艺术字、文本框） */
  text?: string;
  /** 图片在包内的路径，用来显示缩略图 */
  image?: string;
  where: "header" | "body" | "page";
  /** 确定是水印：Word / WPS 的水印，或者明显的水印特征 */
  sure: boolean;
  /** 默认勾选 */
  checked: boolean;
  /** 判断依据，例如「Word 水印」「衬于文字下方、半透明」 */
  reason: string;
  /** 同样的水印出现的次数 */
  count: number;
  places: WatermarkPart[];
}

export interface DocxScan {
  files: Record<string, Uint8Array>;
  found: FoundWatermark[];
}

const REL_HEADER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header";
const REL_FOOTER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer";
const REL_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

const partPath = (target: string, base = "word/") => {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (base + target).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return out.join("/");
};
const relsPathOf = (part: string) => part.replace(/([^/]+)$/, "_rels/$1.rels");
const parseRels = (xml: string) =>
  [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => ({ id: attr(m[0], "Id") ?? "", type: attr(m[0], "Type") ?? "", target: attr(m[0], "Target") ?? "" }));

/**
 * 找出最外层的 w:r（文本框里的段落也有 w:r，必须按嵌套配对，不能用简单的正则）。
 * 返回 [开始, 结束) 位置
 */
export function outerRuns(xml: string): [number, number][] {
  const re = /<w:r(?=[\s>/])[^>]*?(\/?)>|<\/w:r>/g;
  const runs: [number, number][] = [];
  let depth = 0;
  let start = 0;
  for (let m; (m = re.exec(xml)); ) {
    if (m[0] === "</w:r>") {
      if (depth > 0 && --depth === 0) runs.push([start, re.lastIndex]);
    } else if (m[1] === "/") {
      if (depth === 0) runs.push([m.index, re.lastIndex]);
    } else if (depth++ === 0) start = m.index;
  }
  return runs;
}

/** VML 的长度（pt、in、cm、mm、px）换算成磅 */
function vmlLength(v: string | undefined) {
  const m = v?.match(/^(-?[\d.]+)(pt|in|cm|mm|px)?$/);
  if (!m) return 0;
  const n = Number(m[1]);
  return n * ({ pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, px: 0.75 }[m[2] ?? "px"] ?? 1);
}

interface Shape {
  name: string;
  text: string;
  imageRel?: string;
  floating: boolean;
  behind: boolean;
  wordArt: boolean;
  textBox: boolean;
  translucent: boolean;
  rotated: boolean;
  width: number;
}

/** 读出一个图形（w:r）的特征 */
export function describeRun(run: string): Shape | null {
  if (!/<w:drawing\b|<w:pict\b|<w:object\b/.test(run)) return null;
  const names = [
    ...[...run.matchAll(/<wp:docPr\b[^>]*>/g)].flatMap((m) => [attr(m[0], "name"), attr(m[0], "descr"), attr(m[0], "title")]),
    ...[...run.matchAll(/<v:(?:shape|rect|roundrect|oval|group|image)\b[^>]*>/g)].flatMap((m) => [attr(m[0], "id"), attr(m[0], "alt"), attr(m[0], "o:title")]),
  ].filter(Boolean) as string[];

  const textpath = run.match(/<v:textpath\b[^>]*\sstring="([^"]*)"/)?.[1];
  const boxText = [...run.matchAll(/<(?:w|a):t(?:\s[^>]*)?>([^<]*)<\/(?:w|a):t>/g)].map((m) => m[1]).join("");
  const style = [...run.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]).join(";");
  const extent = run.match(/<wp:extent\b[^>]*>/)?.[0];
  const width = extent ? Number(attr(extent, "cx")) / 12700 : vmlLength(style.match(/(?:^|;)\s*width:\s*([^;]+)/)?.[1]?.trim());
  const opacity = [...run.matchAll(/<v:fill\b[^>]*\sopacity="([^"]*)"/g)].map((m) => m[1]);
  const alpha = run.match(/<a:alphaModFix\b[^>]*\samt="(\d+)"|<a:alpha\b[^>]*\sval="(\d+)"/);
  const rot = run.match(/<a:xfrm\b[^>]*\srot="(-?\d+)"/)?.[1];

  return {
    name: names.join(" "),
    text: decodeXml(textpath ?? boxText).trim(),
    imageRel: run.match(/<a:blip\b[^>]*\sr:embed="([^"]*)"/)?.[1] ?? run.match(/<v:imagedata\b[^>]*\sr:id="([^"]*)"/)?.[1],
    floating: /<wp:anchor\b/.test(run) || /position:\s*absolute/.test(style),
    behind: /<wp:anchor\b[^>]*\sbehindDoc="(?:1|true)"/.test(run) || /z-index:\s*-\d/.test(style),
    wordArt: !!textpath || /<a:prstTxWarp\b/.test(run),
    textBox: /<w:txbxContent\b|<wps:txbx\b/.test(run),
    // 半透明：VML 填充透明度、图片冲蚀（gain / blacklevel），或者 DrawingML 的透明度
    translucent:
      opacity.some((o) => {
        const n = o.endsWith("f") ? Number(o.slice(0, -1)) / 65536 : Number(o);
        return n < 0.95;
      }) ||
      /<v:imagedata\b[^>]*\s(?:gain|blacklevel)="/.test(run) ||
      (!!alpha && Number(alpha[1] ?? alpha[2]) < 95000),
    rotated: /rotation:\s*-?[1-9]/.test(style) || (!!rot && Number(rot) % 21600000 !== 0),
    width,
  };
}

const WATERMARK_NAME = /WaterMark|水印/i;

/** 判断一个图形是不是水印；不是候选时返回 null */
function classify(s: Shape, where: "header" | "body"): Pick<FoundWatermark, "sure" | "checked" | "reason"> | null {
  if (WATERMARK_NAME.test(s.name)) return { sure: true, checked: true, reason: t("document.wordWpsWatermark") };
  if (!s.floating) return null;
  const traits = [s.behind && t("document.traitBehind"), s.translucent && t("document.traitTranslucent"), s.rotated && t("document.traitRotated"), s.wordArt && t("document.traitWordArt")].filter(Boolean) as string[];
  if (where === "header") {
    if (traits.length) return { sure: true, checked: true, reason: t("document.headerShape", { traits: traits.join(t("document.traitSep")) }) };
    return { sure: false, checked: false, reason: t("document.headerShapeMaybe") };
  }
  // 正文里只有衬于文字下方的才列出来，默认不删
  if (s.behind) return { sure: false, checked: false, reason: t("document.bodyShape", { traits: traits.join(t("document.traitSep")) }) };
  return null;
}

export function scanDocx(docx: Uint8Array): DocxScan {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(docx);
  } catch {
    throw new Error(t("document.notDocx"));
  }
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : "");
  const documentXml = read("word/document.xml");
  if (!documentXml) throw new Error(t("document.oldDoc"));

  const docRels = parseRels(read("word/_rels/document.xml.rels"));
  const parts: { part: string; where: "header" | "body" }[] = [
    ...docRels.filter((r) => r.type === REL_HEADER || r.type === REL_FOOTER).map((r) => ({ part: partPath(r.target), where: "header" as const })),
    { part: "word/document.xml", where: "body" },
  ];

  const groups = new Map<string, FoundWatermark>();
  for (const { part, where } of parts) {
    const xml = read(part);
    if (!xml) continue;
    const rels = parseRels(read(relsPathOf(part)));
    for (const [start, end] of outerRuns(xml)) {
      const shape = describeRun(xml.slice(start, end));
      if (!shape) continue;
      const verdict = classify(shape, where);
      if (!verdict) continue;
      const rel = shape.imageRel ? rels.find((r) => r.id === shape.imageRel && r.type === REL_IMAGE) : undefined;
      const image = rel ? partPath(rel.target, part.replace(/[^/]+$/, "")) : undefined;
      const kind: FoundWatermark["kind"] = shape.text ? "text" : image ? "image" : "shape";
      const label = { text: shape.wordArt ? t("document.textWatermark") : t("document.textBox"), image: t("document.imageWatermark"), shape: t("document.shape") }[kind];
      // 同样的文字或图片算同一个水印（平铺水印有很多个形状，每个页眉里也各有一份）
      const key = `${where}:${kind}:${shape.text || image || shape.name}:${verdict.reason}`;
      const group = groups.get(key);
      if (group) {
        group.count++;
        group.places.push({ part, start, end });
      } else {
        groups.set(key, { key, kind, label, text: shape.text || undefined, image, where, ...verdict, count: 1, places: [{ part, start, end }] });
      }
    }
  }

  const found = [...groups.values()].sort((a, b) => Number(b.sure) - Number(a.sure));
  // 页面背景
  const bg = documentXml.match(/<w:background\b[^>]*\/>|<w:background\b[^>]*>[\s\S]*?<\/w:background>/);
  if (bg) {
    const fillRel = bg[0].match(/<v:fill\b[^>]*\sr:id="([^"]*)"/)?.[1];
    const rel = fillRel ? docRels.find((r) => r.id === fillRel) : undefined;
    found.push({
      key: "page:background",
      kind: "background",
      label: rel ? t("document.bgImage") : t("document.bgColor"),
      image: rel ? partPath(rel.target) : undefined,
      where: "page",
      sure: !!rel,
      checked: !!rel,
      reason: rel ? t("document.bgImageReason") : t("document.bgColorReason", { color: attr(bg[0], "w:color") ?? "" }),
      count: 1,
      places: [{ part: "word/document.xml", start: bg.index!, end: bg.index! + bg[0].length }],
    });
  }
  return { files, found };
}

/** 删除选中的水印，返回新的 .docx */
export function removeFound(scan: DocxScan, keys: Iterable<string>): Uint8Array {
  const selected = new Set(keys);
  const byPart = new Map<string, WatermarkPart[]>();
  for (const f of scan.found) {
    if (!selected.has(f.key)) continue;
    for (const p of f.places) byPart.set(p.part, [...(byPart.get(p.part) ?? []), p]);
  }
  const files = { ...scan.files };
  for (const [part, places] of byPart) {
    let xml = strFromU8(files[part]);
    // 从后往前删，前面的位置不变
    for (const p of [...places].sort((a, b) => b.start - a.start)) xml = xml.slice(0, p.start) + xml.slice(p.end);
    files[part] = strToU8(xml);
  }
  if (selected.has("page:background") && files["word/settings.xml"]) {
    files["word/settings.xml"] = strToU8(strFromU8(files["word/settings.xml"]).replace(/<w:displayBackgroundShape\b[^>]*\/>/g, ""));
  }
  const zippable: Zippable = {};
  for (const [name, data] of Object.entries(files)) zippable[name] = [data, { level: /\.(png|jpe?g|gif|emf|wmf)$/i.test(name) ? 0 : 6 }];
  return zipSync(zippable);
}

/** 文件名：a.docx → a_去水印.docx */
export const unwatermarkedName = (name: string) => name.replace(/(\.docx)?$/i, `_${t("document.unwatermarkedSuffix")}.docx`);
