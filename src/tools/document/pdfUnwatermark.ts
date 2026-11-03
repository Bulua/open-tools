import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, decodePDFRawStream, type PDFDocument, type PDFObject } from "pdf-lib";
import { loadPdf } from "./pdfPages";
import { t } from "@/locales";

/**
 * PDF 去水印：找出 PDF 里的水印，按用户勾选的删除。
 *
 * 水印在 PDF 里有几种样子：
 * - 有明确标记的：Acrobat 等工具加的「/Artifact /Subtype /Watermark」标记内容、水印注释（/Watermark）、
 *   名为 Watermark / 水印的图层（可选内容）。可以确定
 * - 没有标记的：普通的文字、图片、图形，但通常斜着、半透明、浅色、字很大，而且每页都在。按这些特征判断
 *
 * 删除时只去掉水印的绘制指令（一段 BT…ET 文字、一次 Do 图片、一段 q…Q 图形、一段标记内容），其他内容不动。
 * 同样的水印（每页一份、同一页多个）合并成一项。
 */

export interface PdfPlace {
  /** page:页序号 / form:对象号（Form XObject，多页共用） / annot:页序号 */
  target: string;
  /** 在解码后的内容流里的范围；注释为注释序号 */
  start: number;
  end: number;
}

export interface FoundPdfWatermark {
  key: string;
  kind: "text" | "image" | "shape" | "marked" | "annot" | "layer";
  label: string;
  text?: string;
  sure: boolean;
  checked: boolean;
  reason: string;
  /** 出现在哪些页（从 0 开始） */
  pages: number[];
  places: PdfPlace[];
}

export interface PdfScan {
  pageCount: number;
  found: FoundPdfWatermark[];
}

// ---------- 内容流解析 ----------

class Name {
  constructor(public n: string) {}
}
class Str {
  /** 字节，按 latin1 存成字符串 */
  constructor(public s: string) {}
}
class Dict {
  constructor(public d: Map<string, Operand>) {}
}
type Operand = number | boolean | null | Name | Str | Dict | Operand[];

export interface Op {
  op: string;
  args: Operand[];
  /** 包括操作数在内的范围 */
  start: number;
  end: number;
}

const isWs = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";
const isDelim = (c: string) => "()<>[]{}/%".includes(c);

/** 把内容流（latin1 字符串，下标与字节一一对应）解析成操作列表 */
export function parseContent(s: string): Op[] {
  const n = s.length;
  let i = 0;
  const skipWs = () => {
    while (i < n) {
      const c = s[i];
      if (isWs(c)) i++;
      else if (c === "%") while (i < n && s[i] !== "\n" && s[i] !== "\r") i++;
      else break;
    }
  };
  const word = () => {
    const from = i;
    while (i < n && !isWs(s[i]) && !isDelim(s[i])) i++;
    return s.slice(from, i);
  };
  const literal = () => {
    i++;
    let depth = 1;
    let out = "";
    while (i < n) {
      const c = s[i++];
      if (c === "\\") {
        const e = s[i++];
        if (e === "n") out += "\n";
        else if (e === "r") out += "\r";
        else if (e === "t") out += "\t";
        else if (e === "b") out += "\b";
        else if (e === "f") out += "\f";
        else if (e >= "0" && e <= "7") {
          let oct = e;
          while (oct.length < 3 && s[i] >= "0" && s[i] <= "7") oct += s[i++];
          out += String.fromCharCode(parseInt(oct, 8) & 255);
        } else if (e === "\r") {
          if (s[i] === "\n") i++;
        } else if (e !== "\n") out += e;
      } else if (c === "(") {
        depth++;
        out += c;
      } else if (c === ")") {
        if (--depth === 0) break;
        out += c;
      } else out += c;
    }
    return new Str(out);
  };
  const hex = () => {
    i++;
    let digits = "";
    while (i < n && s[i] !== ">") {
      if (/[0-9a-f]/i.test(s[i])) digits += s[i];
      i++;
    }
    i++;
    if (digits.length % 2) digits += "0";
    let out = "";
    for (let k = 0; k < digits.length; k += 2) out += String.fromCharCode(parseInt(digits.slice(k, k + 2), 16));
    return new Str(out);
  };

  type Token = { value: Operand } | { op: string } | { end: true } | null;
  const token = (): Token => {
    skipWs();
    if (i >= n) return null;
    const c = s[i];
    if (c === "/") {
      i++;
      return { value: new Name(word().replace(/#([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))) };
    }
    if (c === "(") return { value: literal() };
    if (c === "<") {
      if (s[i + 1] !== "<") return { value: hex() };
      i += 2;
      const d = new Map<string, Operand>();
      for (;;) {
        const k = token();
        if (!k || "end" in k) break;
        const v = token();
        if (!v || "end" in v) break;
        if ("value" in k && k.value instanceof Name) d.set(k.value.n, "value" in v ? v.value : new Name(v.op));
      }
      return { value: new Dict(d) };
    }
    if (c === ">" || c === "]" || c === ")" || c === "}") {
      i += c === ">" && s[i + 1] === ">" ? 2 : 1;
      return { end: true };
    }
    if (c === "[") {
      i++;
      const arr: Operand[] = [];
      for (;;) {
        const t = token();
        if (!t || "end" in t) break;
        if ("value" in t) arr.push(t.value);
      }
      return { value: arr };
    }
    if (c === "{") {
      i++;
      return token();
    }
    const w = word() || s[i++];
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) return { value: Number(w) };
    if (w === "true" || w === "false") return { value: w === "true" };
    if (w === "null") return { value: null };
    return { op: w };
  };

  const ops: Op[] = [];
  let args: Operand[] = [];
  let start = -1;
  for (;;) {
    skipWs();
    const at = i;
    const t = token();
    if (!t) break;
    if ("end" in t) continue;
    if (start < 0) start = at;
    if ("value" in t) {
      args.push(t.value);
      continue;
    }
    if (t.op === "BI") {
      // 内嵌图片：ID 之后是二进制数据，一直到前后是空白的 EI
      const id = s.indexOf("ID", i);
      let ei = id < 0 ? n : id + 3;
      for (;;) {
        ei = s.indexOf("EI", ei);
        if (ei < 0) {
          ei = n;
          break;
        }
        if (isWs(s[ei - 1]) && (ei + 2 >= n || isWs(s[ei + 2]))) break;
        ei += 2;
      }
      i = Math.min(n, ei + 2);
    }
    ops.push({ op: t.op, args, start, end: i });
    args = [];
    start = -1;
  }
  return ops;
}

// ---------- 矩阵、颜色 ----------

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const toMatrix = (args: Operand[]): Matrix | null => (args.length >= 6 && args.slice(-6).every((a) => typeof a === "number") ? (args.slice(-6) as Matrix) : null);
/** 不是 90° 的整数倍：正文偶尔整体旋转 90°（横排页面），水印一般是 30°～60° */
const isRotated = (m: Matrix) => {
  const deg = (((Math.atan2(m[1], m[0]) * 180) / Math.PI) % 90 + 90) % 90;
  return deg > 8 && deg < 82;
};
const angleOf = (m: Matrix) => Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI);

/** 填充颜色的亮度（0 黑 ～ 1 白） */
function luminance(op: string, args: Operand[]): number | null {
  const nums = args.filter((a): a is number => typeof a === "number");
  if (op === "g" || ((op === "sc" || op === "scn") && nums.length === 1)) return nums[0] ?? null;
  if (op === "rg" || ((op === "sc" || op === "scn") && nums.length === 3)) return nums.length >= 3 ? 0.3 * nums[0] + 0.59 * nums[1] + 0.11 * nums[2] : null;
  if (op === "k" || ((op === "sc" || op === "scn") && nums.length === 4)) return nums.length >= 4 ? (1 - Math.min(1, nums[3] + (nums[0] + nums[1] + nums[2]) / 3)) : null;
  return null;
}

// ---------- PDF 对象读取 ----------

const latin1 = (bytes: Uint8Array) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
};
const fromLatin1 = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
  return out;
};

function streamText(obj: PDFObject | undefined): string | null {
  if (obj instanceof PDFRawStream) {
    try {
      return latin1(decodePDFRawStream(obj).decode());
    } catch {
      return null;
    }
  }
  const maybe = obj as { getUnencodedContents?: () => Uint8Array } | undefined;
  return maybe?.getUnencodedContents ? latin1(maybe.getUnencodedContents()) : null;
}

const nameOf = (o: PDFObject | undefined) => (o instanceof PDFName ? o.decodeText() : undefined);
const textOf = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined);
const numOf = (o: PDFObject | undefined) => (o instanceof PDFNumber ? o.asNumber() : undefined);

/** 解析 ToUnicode CMap，用来显示水印文字 */
function parseToUnicode(cmap: string) {
  const map = new Map<number, string>();
  let width = 1;
  const utf16 = (h: string) => {
    let out = "";
    for (let i = 0; i + 4 <= h.length; i += 4) out += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
    return out || String.fromCharCode(parseInt(h, 16));
  };
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const m of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]*)>/gi)) {
      width = Math.max(width, m[1].length / 2);
      map.set(parseInt(m[1], 16), utf16(m[2]));
    }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const m of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<[0-9a-f]*>|\[[^\]]*\])/gi)) {
      width = Math.max(width, m[1].length / 2);
      const lo = parseInt(m[1], 16);
      const hi = Math.min(parseInt(m[2], 16), lo + 0xffff);
      if (m[3].startsWith("[")) {
        [...m[3].matchAll(/<([0-9a-f]*)>/gi)].forEach((d, k) => map.set(lo + k, utf16(d[1])));
      } else {
        const base = m[3].slice(1, -1);
        const first = utf16(base);
        for (let c = lo; c <= hi; c++) map.set(c, first.slice(0, -1) + String.fromCharCode(first.charCodeAt(first.length - 1) + c - lo));
      }
    }
  return { map, width };
}

// ---------- 分析 ----------

interface Hit {
  sig: string;
  kind: FoundPdfWatermark["kind"];
  page: number;
  place: PdfPlace;
  text?: string;
  traits: { rotated?: boolean; translucent?: boolean; light?: boolean; large?: boolean };
  sureReason?: string;
}

interface GState {
  ctm: Matrix;
  alpha: number;
  lum: number;
  font?: string;
  size: number;
}

const WATERMARK_NAME = /watermark|水印/i;

class Analyzer {
  hits: Hit[] = [];
  private fonts = new Map<string, ((bytes: string) => string) | null>();
  private formOps = new Map<string, Op[] | null>();

  constructor(
    private doc: PDFDocument,
    private wmLayers: Set<string>,
  ) {}

  private lookup(o: PDFObject | undefined): PDFObject | undefined {
    return o ? this.doc.context.lookup(o) : undefined;
  }
  private dict(o: PDFObject | undefined) {
    const v = this.lookup(o);
    return v instanceof PDFDict ? v : v instanceof PDFRawStream ? v.dict : undefined;
  }
  private sub(res: PDFDict | undefined, group: string, name: string) {
    const g = this.dict(res?.get(PDFName.of(group)));
    return g?.get(PDFName.of(name));
  }

  /** 字体的文字解码函数：有 ToUnicode 时按它解码，否则只认 ASCII */
  private decoder(res: PDFDict | undefined, font: string | undefined) {
    if (!font) return null;
    const ref = this.sub(res, "Font", font);
    const key = ref instanceof PDFRef ? ref.toString() : `${font}@${res ? this.fonts.size : 0}`;
    if (this.fonts.has(key)) return this.fonts.get(key)!;
    let fn: ((bytes: string) => string) | null = null;
    const cmap = streamText(this.lookup(this.dict(ref)?.get(PDFName.of("ToUnicode"))));
    if (cmap) {
      const { map, width } = parseToUnicode(cmap);
      fn = (bytes) => {
        let out = "";
        for (let i = 0; i + width <= bytes.length; i += width) {
          let code = 0;
          for (let k = 0; k < width; k++) code = code * 256 + bytes.charCodeAt(i + k);
          out += map.get(code) ?? "";
        }
        return out;
      };
    }
    this.fonts.set(key, fn);
    return fn;
  }

  /** 分析一段内容流；target 是它在 PdfPlace 里的名字 */
  analyze(ops: Op[], res: PDFDict | undefined, target: string, page: number, init: GState, depth = 0) {
    const hits: Hit[] = [];
    let st: GState = { ...init };
    const stack: GState[] = [];
    // 标记内容：BDC/BMC … EMC，记录水印标记的范围
    const marks: { start: number; wm?: string; texts: string[] }[] = [];
    const inWatermark = () => marks.some((m) => m.wm);
    // q … Q 图形块：只有图形（没有文字）、半透明并且旋转的，当作图形水印
    const blocks: { start: number; text: boolean; paint: boolean; odd: boolean }[] = [];
    let text: { start: number; bytes: string; decoded: string; trm?: Matrix; st?: GState } | null = null;
    let tm: Matrix = IDENTITY;
    let tlm: Matrix = IDENTITY;

    const show = (s: Str) => {
      if (!text) return;
      if (!text.trm) {
        text.trm = mul(tm, st.ctm);
        text.st = { ...st };
      }
      text.bytes += s.s;
      const decode = this.decoder(res, st.font);
      const plain = decode ? decode(s.s) : /^[\x20-\x7e]*$/.test(s.s) ? s.s : "";
      text.decoded += plain;
      for (const m of marks) if (m.wm) m.texts.push(plain);
      for (const b of blocks) b.text = true;
    };

    for (const o of ops) {
      const a = o.args;
      switch (o.op) {
        case "q":
          stack.push({ ...st });
          blocks.push({ start: o.start, text: false, paint: false, odd: false });
          break;
        case "Q": {
          st = stack.pop() ?? st;
          const b = blocks.pop();
          if (b && b.paint && b.odd && !b.text && !inWatermark()) {
            hits.push({
              sig: `shape:${hash(opsText(ops, b.start, o.end))}`,
              kind: "shape",
              page,
              place: { target, start: b.start, end: o.end },
              traits: { rotated: true, translucent: true },
            });
          }
          break;
        }
        case "cm": {
          const m = toMatrix(a);
          if (m) st.ctm = mul(m, st.ctm);
          break;
        }
        case "gs": {
          const name = a[0] instanceof Name ? a[0].n : "";
          const gs = this.dict(this.sub(res, "ExtGState", name));
          const ca = numOf(this.lookup(gs?.get(PDFName.of("ca"))));
          const CA = numOf(this.lookup(gs?.get(PDFName.of("CA"))));
          if (ca !== undefined || CA !== undefined) st.alpha = Math.min(init.alpha, ca ?? 1, CA ?? 1);
          break;
        }
        case "g":
        case "rg":
        case "k":
        case "sc":
        case "scn": {
          const l = luminance(o.op, a);
          if (l !== null) st.lum = l;
          break;
        }
        case "Tf":
          if (a[0] instanceof Name) st.font = a[0].n;
          if (typeof a[1] === "number") st.size = a[1];
          break;
        case "BT":
          tm = tlm = IDENTITY;
          text = { start: o.start, bytes: "", decoded: "" };
          break;
        case "Tm": {
          const m = toMatrix(a);
          if (m) tm = tlm = m;
          break;
        }
        case "Td":
        case "TD":
          if (typeof a[0] === "number" && typeof a[1] === "number") tm = tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm);
          break;
        case "Tj":
        case "'":
        case '"':
          if (a[a.length - 1] instanceof Str) show(a[a.length - 1] as Str);
          break;
        case "TJ":
          if (Array.isArray(a[0])) for (const x of a[0]) if (x instanceof Str) show(x);
          break;
        case "ET":
          if (text?.trm && text.st && !inWatermark()) {
            const size = st.size * Math.hypot(text.trm[2], text.trm[3]);
            const traits = {
              rotated: isRotated(text.trm),
              translucent: text.st.alpha < 0.95,
              light: text.st.lum >= 0.55 && text.st.lum < 0.99,
              large: size >= 28,
            };
            if (traits.rotated || traits.translucent || (traits.light && traits.large)) {
              hits.push({
                sig: `text:${hash(text.bytes)}:${angleOf(text.trm)}`,
                kind: "text",
                page,
                place: { target, start: text.start, end: o.end },
                text: text.decoded.trim() || undefined,
                traits,
              });
            }
          }
          text = null;
          break;
        case "BMC":
          marks.push({ start: o.start, texts: [] });
          break;
        case "BDC": {
          const tag = a[0] instanceof Name ? a[0].n : "";
          const prop = a[1];
          let wm: string | undefined;
          if (prop instanceof Dict) {
            const subtype = prop.d.get("Subtype");
            if (tag === "Artifact" && subtype instanceof Name && subtype.n === "Watermark") wm = "wmMarked";
          } else if (prop instanceof Name) {
            const ref = this.sub(res, "Properties", prop.n);
            const d = this.dict(ref);
            if (ref instanceof PDFRef && this.wmLayers.has(ref.toString())) wm = "wmLayer";
            else if (tag === "Artifact" && nameOf(d?.get(PDFName.of("Subtype"))) === "Watermark") wm = "wmMarked";
          }
          marks.push({ start: o.start, wm: inWatermark() ? undefined : wm, texts: [] });
          break;
        }
        case "EMC": {
          const m = marks.pop();
          if (m?.wm) {
            const text = m.texts.join("").trim();
            hits.push({
              sig: `marked:${m.wm}:${hash(text)}`,
              kind: m.wm === "wmLayer" ? "layer" : "marked",
              page,
              place: { target, start: m.start, end: o.end },
              text: text || undefined,
              traits: {},
              sureReason: t(`document.${m.wm}`),
            });
          }
          break;
        }
        case "Do": {
          if (inWatermark() || !(a[0] instanceof Name)) break;
          const ref = this.sub(res, "XObject", a[0].n);
          const x = this.lookup(ref);
          if (!(x instanceof PDFRawStream)) break;
          const subtype = nameOf(x.dict.get(PDFName.of("Subtype")));
          const oc = x.dict.get(PDFName.of("OC"));
          const refKey = ref instanceof PDFRef ? ref.toString() : `${a[0].n}@${page}`;
          if (oc instanceof PDFRef && this.wmLayers.has(oc.toString())) {
            hits.push({ sig: `layer:${refKey}`, kind: "layer", page, place: { target, start: o.start, end: o.end }, traits: {}, sureReason: t("document.wmLayer") });
            break;
          }
          for (const b of blocks) b.text = true;
          if (subtype === "Image") {
            const traits = { rotated: isRotated(st.ctm), translucent: st.alpha < 0.95 };
            // 每页各嵌入一份的同一张图片也算同一个：按图片尺寸、数据大小和显示大小比较
            const dim = (k: string) => numOf(this.lookup(x.dict.get(PDFName.of(k)))) ?? 0;
            const shown = `${Math.round(Math.hypot(st.ctm[0], st.ctm[1]))}x${Math.round(Math.hypot(st.ctm[2], st.ctm[3]))}`;
            const sig = `image:${dim("Width")}x${dim("Height")}:${x.getContentsSize()}:${shown}`;
            hits.push({ sig, kind: "image", page, place: { target, start: o.start, end: o.end }, traits });
          } else if (subtype === "Form" && depth < 6 && ref instanceof PDFRef) {
            const formOps = this.formOps.has(refKey) ? this.formOps.get(refKey)! : this.parseForm(x, refKey);
            if (!formOps) break;
            const matrix = (x.dict.lookup(PDFName.of("Matrix")) as PDFArray | undefined)?.asArray().map((v) => numOf(v) ?? 0);
            const ctm = matrix?.length === 6 ? mul(matrix as Matrix, st.ctm) : st.ctm;
            const formRes = this.dict(x.dict.get(PDFName.of("Resources"))) ?? res;
            hits.push(...this.analyze(formOps, formRes, `form:${refKey}`, page, { ...st, ctm }, depth + 1));
          }
          break;
        }
        case "f":
        case "F":
        case "f*":
        case "B":
        case "B*":
        case "b":
        case "b*":
        case "S":
        case "s":
          if (st.alpha < 0.95 && isRotated(st.ctm)) for (const b of blocks) (b.paint = true), (b.odd = true);
          else for (const b of blocks) b.text = true; // 普通图形：所在的块不是水印
          break;
      }
    }
    if (depth === 0) this.hits.push(...hits);
    return hits;
  }

  private parseForm(x: PDFRawStream, key: string) {
    const content = streamText(x);
    const ops = content === null ? null : parseContent(content);
    this.formOps.set(key, ops);
    return ops;
  }
}

const opsText = (ops: Op[], start: number, end: number) =>
  ops
    .filter((o) => o.start >= start && o.end <= end)
    .map((o) => o.op)
    .join(" ");

/** 简单的字符串哈希，用来判断两处水印是否相同 */
function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}.${s.length}`;
}

/** 页面的内容流（多段内容流按顺序拼起来，与 PDF 规范一致） */
function pageContent(doc: PDFDocument, index: number): string {
  const node = doc.getPage(index).node;
  const contents = node.Contents();
  const parts = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
  return parts.map((p) => streamText(p) ?? "").join("\n");
}

/** 名为 Watermark / 水印的图层（可选内容组） */
function watermarkLayers(doc: PDFDocument): Set<string> {
  const set = new Set<string>();
  const props = doc.catalog.lookupMaybe(PDFName.of("OCProperties"), PDFDict);
  const ocgs = props?.lookupMaybe(PDFName.of("OCGs"), PDFArray);
  for (const ref of ocgs?.asArray() ?? []) {
    const d = doc.context.lookup(ref);
    if (!(ref instanceof PDFRef) || !(d instanceof PDFDict)) continue;
    const name = textOf(d.lookup(PDFName.of("Name")));
    const element = d.lookupMaybe(PDFName.of("Usage"), PDFDict)?.lookupMaybe(PDFName.of("PageElement"), PDFDict);
    if ((name && WATERMARK_NAME.test(name)) || nameOf(element?.get(PDFName.of("Subtype"))) === "W") set.add(ref.toString());
  }
  return set;
}

/** 页面上的水印注释 */
function annotationHits(doc: PDFDocument, index: number): Hit[] {
  const annots = doc.getPage(index).node.Annots();
  const hits: Hit[] = [];
  annots?.asArray().forEach((ref, i) => {
    const d = doc.context.lookup(ref);
    if (d instanceof PDFDict && nameOf(d.get(PDFName.of("Subtype"))) === "Watermark") {
      hits.push({ sig: "annot", kind: "annot", page: index, place: { target: `annot:${index}`, start: i, end: i + 1 }, traits: {}, sureReason: t("document.wmAnnot") });
    }
  });
  return hits;
}

/** 各类水印的名称，见文案 document.kindText 等 */
const LABELS: Record<FoundPdfWatermark["kind"], string> = {
  text: "kindText",
  image: "kindImage",
  shape: "kindShape",
  marked: "kindMarked",
  annot: "kindAnnot",
  layer: "kindLayer",
};

/** 合并相同的水印，按特征判断是否默认勾选；不像水印的去掉 */
function classify(hits: Hit[], pageCount: number): FoundPdfWatermark[] {
  const groups = new Map<string, Hit[]>();
  for (const h of hits) groups.set(`${h.kind}|${h.sig}`, [...(groups.get(`${h.kind}|${h.sig}`) ?? []), h]);

  const found: FoundPdfWatermark[] = [];
  for (const [key, list] of groups) {
    const first = list[0];
    const pages = [...new Set(list.map((h) => h.page))].sort((a, b) => a - b);
    const seen = new Set<string>();
    const places = list.map((h) => h.place).filter((p) => !seen.has(`${p.target}:${p.start}`) && seen.add(`${p.target}:${p.start}`));
    const repeated = pageCount === 1 || (pages.length >= 2 && pages.length >= pageCount * 0.6);
    const tr = first.traits;
    const where = pages.length === pageCount ? (pageCount > 1 ? t("document.allPages", { n: pageCount }) : "") : t("document.nPages", { n: pages.length });
    const traitText = [tr.rotated && t("document.pdfRotated"), tr.translucent && t("document.traitTranslucent"), tr.light && t("document.pdfLight"), tr.large && t("document.pdfLarge")].filter(Boolean).join(t("document.traitSep"));

    let sure = false;
    let checked = false;
    let reason: string;
    if (first.sureReason) {
      sure = checked = true;
      reason = first.sureReason;
    } else if (first.kind === "image") {
      checked = !!tr.translucent && repeated;
      if (!checked && !tr.translucent && !tr.rotated && !(repeated && pageCount > 1)) continue;
      sure = checked;
      reason = traitText ? t("document.imageWith", { traits: traitText }) : t("document.imageEveryPage");
    } else {
      const strong = (tr.rotated && (tr.translucent || tr.light || tr.large || repeated)) || (tr.translucent && (repeated || tr.large)) || (tr.light && tr.large && repeated);
      if (!strong && !tr.rotated && !tr.translucent) continue;
      sure = checked = !!strong;
      reason = traitText;
    }
    found.push({
      key,
      kind: first.kind,
      label: t(`document.${LABELS[first.kind]}`),
      text: list.find((h) => h.text)?.text,
      sure,
      checked,
      reason: [reason, where].filter(Boolean).join(" · "),
      pages,
      places,
    });
  }
  return found.sort((a, b) => Number(b.sure) - Number(a.sure) || b.pages.length - a.pages.length);
}

/** 同一段内容流里，被别的水印包含的范围去掉（例如水印标记里的文字） */
function dropNested(hits: Hit[]) {
  return hits.filter(
    (h) =>
      !hits.some(
        (o) => o !== h && o.place.target === h.place.target && o.place.start <= h.place.start && o.place.end >= h.place.end && (o.place.start < h.place.start || o.place.end > h.place.end),
      ),
  );
}

function collectHits(doc: PDFDocument) {
  const analyzer = new Analyzer(doc, watermarkLayers(doc));
  const init: GState = { ctm: IDENTITY, alpha: 1, lum: 0, size: 12 };
  const hits: Hit[] = [];
  doc.getPages().forEach((page, i) => {
    const before = analyzer.hits.length;
    analyzer.analyze(parseContent(pageContent(doc, i)), page.node.Resources(), `page:${i}`, i, init);
    hits.push(...dropNested(analyzer.hits.slice(before)), ...annotationHits(doc, i));
  });
  return hits;
}

export async function scanPdf(data: Uint8Array): Promise<PdfScan> {
  const doc = await loadPdf(data);
  return { pageCount: doc.getPageCount(), found: classify(collectHits(doc), doc.getPageCount()) };
}

/** 删除选中的水印，返回新的 PDF */
export async function removePdfWatermarks(data: Uint8Array, scan: PdfScan, keys: Iterable<string>): Promise<Uint8Array> {
  const selected = new Set(keys);
  const doc = await loadPdf(data);
  const byTarget = new Map<string, PdfPlace[]>();
  for (const f of scan.found) if (selected.has(f.key)) for (const p of f.places) byTarget.set(p.target, [...(byTarget.get(p.target) ?? []), p]);

  const cut = (content: string, places: PdfPlace[]) => {
    // 从后往前删；换成换行，避免前后两个指令粘在一起
    let out = content;
    let last = Infinity;
    for (const p of [...places].sort((a, b) => b.start - a.start)) {
      const end = Math.min(p.end, last);
      if (end <= p.start) continue;
      out = out.slice(0, p.start) + "\n" + out.slice(end);
      last = p.start;
    }
    return fromLatin1(out);
  };

  for (const [target, places] of byTarget) {
    const [kind, id] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
    if (kind === "page") {
      const page = doc.getPage(Number(id));
      const stream = doc.context.flateStream(cut(pageContent(doc, Number(id)), places));
      page.node.set(PDFName.of("Contents"), doc.context.register(stream));
    } else if (kind === "form") {
      const [num, gen] = id.split(" ").map(Number);
      const ref = PDFRef.of(num, gen);
      const old = doc.context.lookup(ref);
      const content = old instanceof PDFRawStream ? streamText(old) : null;
      if (!old || content === null || !(old instanceof PDFRawStream)) continue;
      const stream = doc.context.flateStream(cut(content, places));
      for (const [k, v] of old.dict.entries()) if (!["Length", "Filter", "DecodeParms"].includes(k.decodeText())) stream.dict.set(k, v);
      doc.context.assign(ref, stream);
    } else if (kind === "annot") {
      const node = doc.getPage(Number(id)).node;
      const annots = node.Annots();
      if (!annots) continue;
      const drop = new Set(places.map((p) => p.start));
      node.set(PDFName.of("Annots"), doc.context.obj(annots.asArray().filter((_, i) => !drop.has(i))));
    }
  }
  return doc.save();
}

/** 文件名：a.pdf → a_去水印.pdf */
export const unwatermarkedPdfName = (name: string) => name.replace(/(\.pdf)?$/i, `_${t("document.unwatermarkedSuffix")}.pdf`);
