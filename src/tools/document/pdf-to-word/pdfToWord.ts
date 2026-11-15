import { AlignmentType, Document, HeadingLevel, ImageRun, LineRuleType, Packer, Paragraph, TextRun, type IRunOptions } from "docx";

/**
 * PDF → Word（内置转换，不依赖 Office）。
 * 用 PDF.js 读出每段文字的位置、字号和字体，按位置还原成行、段落，大字号的段落识别为标题；
 * 图片按所在位置插入到段落之间。每一页对应 Word 里的一节，页面大小和页边距与原文件一致。
 * 表格、多栏等复杂排版会按阅读顺序变成普通段落；扫描件（整页是图片）只能得到图片。
 */

/** 一段文字（PDF.js 的一个文本项），坐标单位是磅，y 从页面顶部向下 */
export interface TextPiece {
  text: string;
  x: number;
  /** 基线位置 */
  y: number;
  width: number;
  size: number;
  bold?: boolean;
  italic?: boolean;
  font?: string;
}

export interface PageImage {
  data: Uint8Array;
  type: "png" | "jpg";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Line {
  pieces: TextPiece[];
  left: number;
  right: number;
  y: number;
  size: number;
}

export interface TextBlock {
  kind: "text";
  lines: Line[];
  /** 段落顶部，用来确定图片插在哪里 */
  top: number;
  align: "left" | "center" | "right" | "justify";
  /** 相对版心左边的缩进（磅），firstLine 为负表示悬挂缩进 */
  indent: number;
  firstLine: number;
  spaceBefore: number;
  /** 行距（磅），单行段落为 0 */
  lineGap: number;
  size: number;
}

export interface PageLayout {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  blocks: (TextBlock | ({ kind: "image" } & PageImage))[];
}

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;
const isBlank = (s: string) => !s.trim();

/** 两段文字之间是否要补空格：PDF 里的空格常常不是字符，而是两段文字之间的间距 */
function needsSpace(prev: string, next: string, gap: number, size: number) {
  if (/\s$/.test(prev) || /^\s/.test(next)) return false;
  const cjk = CJK.test(prev.slice(-1)) || CJK.test(next[0]);
  return gap > size * (cjk ? 0.9 : 0.18);
}

/** 按 PDF 中的书写顺序把文字连成行：基线明显变化或者回到左边时换行 */
export function groupLines(pieces: TextPiece[]): Line[] {
  const lines: Line[] = [];
  let cur: Line | null = null;
  for (const p of pieces) {
    if (isBlank(p.text) || p.size <= 0) continue;
    const size = cur ? Math.max(cur.size, p.size) : p.size;
    if (!cur || Math.abs(p.y - cur.y) > size * 0.5 || p.x < cur.right - size * 0.5) {
      cur = { pieces: [p], left: p.x, right: p.x + p.width, y: p.y, size: p.size };
      lines.push(cur);
      continue;
    }
    const last = cur.pieces[cur.pieces.length - 1];
    if (needsSpace(last.text, p.text, p.x - cur.right, size)) cur.pieces.push({ ...last, text: " ", width: 0 });
    cur.pieces.push(p);
    cur.right = Math.max(cur.right, p.x + p.width);
    // 行的字号取最大的那段（上标等小字不影响），基线以字号最大的为准
    if (p.size > cur.size) {
      cur.size = p.size;
      cur.y = p.y;
    }
  }
  return lines;
}

const lineText = (l: Line) => l.pieces.map((p) => p.text).join("");
const allBold = (l: Line) => l.pieces.every((p) => p.bold || isBlank(p.text));

/** 把行组成段落 */
export function groupBlocks(lines: Line[], textLeft: number, textRight: number): TextBlock[] {
  const blocks: TextBlock[] = [];
  const width = textRight - textLeft;
  let prevBottom: number | null = null;

  const finish = (lines: Line[]): TextBlock => {
    const size = Math.max(...lines.map((l) => l.size));
    const first = lines[0];
    const last = lines[lines.length - 1];
    const left = lines.length > 1 ? Math.min(...lines.slice(1).map((l) => l.left)) : first.left;
    const right = Math.max(...lines.map((l) => l.right));
    const center = (first.left + right) / 2;

    let align: TextBlock["align"] = "left";
    let indent = Math.max(0, left - textLeft);
    let firstLine = first.left - left;
    if (lines.length === 1) {
      if (first.left > textLeft + size * 2 && Math.abs(center - (textLeft + textRight) / 2) < size * 1.5) align = "center";
      else if (first.left > textLeft + width * 0.4 && Math.abs(right - textRight) < size) align = "right";
      else if (indent > size * 0.8 && indent < size * 4.5) {
        // 单行段落左边空出的距离当作首行缩进
        firstLine = indent;
        indent = 0;
      }
    } else if (lines.slice(1, -1).every((l) => textRight - l.right < size * 1.2) && textRight - first.right < size * 1.2) {
      align = "justify";
    }
    if (align === "center" || align === "right") indent = firstLine = 0;
    if (indent < size * 0.8) indent = 0;
    if (Math.abs(firstLine) < size * 0.5) firstLine = 0;

    const top = first.y - first.size;
    const lineGap = lines.length > 1 ? (last.y - first.y) / (lines.length - 1) : 0;
    const spaceBefore = prevBottom === null ? 0 : Math.max(0, Math.min(36, top - prevBottom - size * 0.25));
    prevBottom = last.y + last.size * 0.25;
    return { kind: "text", lines, top, align, indent, firstLine, spaceBefore, lineGap, size };
  };

  let cur: Line[] = [];
  for (const line of lines) {
    const prev = cur[cur.length - 1];
    if (prev && !continues(cur, line, textRight)) {
      blocks.push(finish(cur));
      cur = [];
    }
    cur.push(line);
  }
  if (cur.length) blocks.push(finish(cur));
  return blocks;
}

/** line 是否接着 para 这个段落 */
function continues(para: Line[], line: Line, textRight: number) {
  const prev = para[para.length - 1];
  const size = Math.max(prev.size, line.size);
  const gap = line.y - prev.y;
  if (gap <= 0 || gap > size * 1.9) return false;
  if (Math.abs(prev.size - line.size) > size * 0.15) return false;
  if (allBold(prev) !== allBold(line)) return false;
  // 上一行没写到右边，说明段落在这里结束
  if (textRight - prev.right > size * 2.5) return false;
  if (para.length >= 2) {
    // 行距与前几行一致、左边对齐
    const lastGap = prev.y - para[para.length - 2].y;
    if (Math.abs(gap - lastGap) > size * 0.3) return false;
    return Math.abs(line.left - prev.left) < size;
  }
  // 第二行：与第一行左对齐，或者第一行有首行缩进
  return Math.abs(line.left - prev.left) < size || (prev.left - line.left > 0 && prev.left - line.left < size * 4.5);
}

/** 按字数统计最常见的字号，作为正文字号 */
export function bodySize(lines: Line[]) {
  const count = new Map<number, number>();
  for (const l of lines)
    for (const p of l.pieces) {
      const s = Math.round(p.size * 2) / 2;
      count.set(s, (count.get(s) ?? 0) + p.text.length);
    }
  let best = 12;
  let max = 0;
  for (const [s, n] of count) if (n > max) [best, max] = [s, n];
  return best;
}

/** 根据字号判断标题级别，0 表示正文 */
export function headingLevel(block: TextBlock, body: number) {
  const r = block.size / body;
  const chars = block.lines.reduce((n, l) => n + lineText(l).trim().length, 0);
  if (chars > 80) return 0;
  if (r >= 1.6) return 1;
  if (r >= 1.3) return 2;
  if (r >= 1.12 || (r >= 1.02 && block.lines.length === 1 && allBold(block.lines[0]))) return 3;
  return 0;
}

/** 一页的排版：文字分段，图片插到所在位置 */
export function layoutPage(width: number, height: number, pieces: TextPiece[], images: PageImage[] = []): PageLayout {
  const lines = groupLines(pieces);
  // 盖住整页的图片在有文字时是背景（或扫描件上叠加的文字层），不需要
  const pictures = images.filter((img) => img.width > 8 && img.height > 8 && !(lines.length && img.width * img.height > width * height * 0.8));

  const lefts = [...lines.map((l) => l.left), ...pictures.map((i) => i.x)];
  const rights = [...lines.map((l) => l.right), ...pictures.map((i) => i.x + i.width)];
  const tops = [...lines.map((l) => l.y - l.size), ...pictures.map((i) => i.y)];
  const bottoms = [...lines.map((l) => l.y + l.size * 0.3), ...pictures.map((i) => i.y + i.height)];
  const clamp = (v: number) => Math.round(Math.max(18, Math.min(144, v)));
  const margin = lefts.length
    ? {
        left: clamp(Math.min(...lefts)),
        right: clamp(width - Math.max(...rights)),
        top: clamp(Math.min(...tops)),
        bottom: clamp(height - Math.max(...bottoms)),
      }
    : { top: 72, right: 72, bottom: 72, left: 72 };
  const textLeft = lines.length ? Math.min(...lines.map((l) => l.left)) : margin.left;
  const textRight = lines.length ? Math.max(...lines.map((l) => l.right)) : width - margin.right;

  const blocks: PageLayout["blocks"] = groupBlocks(lines, textLeft, textRight);
  for (const img of [...pictures].sort((a, b) => a.y - b.y)) {
    const at = blocks.findIndex((b) => (b.kind === "text" ? b.top : b.y) > img.y);
    blocks.splice(at < 0 ? blocks.length : at, 0, { kind: "image", ...img });
  }
  return { width, height, margin, blocks };
}

/** 把一行行文字连成段落里的文字：中文直接相连，英文补空格，行尾连字符去掉 */
function blockRuns(block: TextBlock, body: number, heading: number): IRunOptions[] {
  const runs: IRunOptions[] = [];
  const push = (text: string, p: TextPiece) => {
    const size = Math.round(p.size * 2);
    const bold = heading ? true : !!p.bold;
    const last = runs[runs.length - 1];
    if (last && last.size === size && !!last.bold === bold && !!last.italics === !!p.italic && last.font === p.font) {
      (last as { text: string }).text += text;
    } else {
      runs.push({ text, size, bold: bold || undefined, italics: p.italic || undefined, font: p.font });
    }
  };
  block.lines.forEach((line, i) => {
    if (i > 0) {
      const prevText = lineText(block.lines[i - 1]);
      const nextText = lineText(line);
      const tail = runs[runs.length - 1] as { text: string } | undefined;
      if (tail && /[a-z]-$/i.test(prevText) && /^[a-z]/.test(nextText)) tail.text = tail.text.slice(0, -1);
      else if (tail && !CJK.test(prevText.slice(-1)) && !CJK.test(nextText[0]) && !/\s$/.test(prevText)) tail.text += " ";
    }
    for (const p of line.pieces) push(p.text, p);
  });
  // 字号与正文相同时省略，用文档默认字号（size 按半磅存储）
  for (const r of runs) if (Math.abs((r.size as number) - body * 2) < 1) delete (r as { size?: number }).size;
  return runs;
}

const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
const twip = (pt: number) => Math.round(pt * 20);
/** 磅 → 像素（96 DPI），docx 的图片尺寸按像素给出 */
const px = (pt: number) => Math.round((pt * 96) / 72);

export async function buildDocx(pages: PageLayout[]): Promise<Uint8Array> {
  const allLines = pages.flatMap((p) => p.blocks.flatMap((b) => (b.kind === "text" ? b.lines : [])));
  const body = bodySize(allLines);
  const fonts = new Map<string, number>();
  for (const l of allLines) for (const p of l.pieces) if (p.font) fonts.set(p.font, (fonts.get(p.font) ?? 0) + p.text.length);
  const mainFont = [...fonts].sort((a, b) => b[1] - a[1])[0]?.[0];

  const sections = pages.map((page) => {
    const contentWidth = page.width - page.margin.left - page.margin.right;
    const children = page.blocks.map((b) => {
      if (b.kind === "image") {
        const scale = Math.min(1, contentWidth / b.width);
        return new Paragraph({
          alignment: b.x - page.margin.left > (contentWidth - b.width * scale) / 2 - 12 && b.width * scale < contentWidth * 0.9 ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [new ImageRun({ type: b.type, data: b.data, transformation: { width: px(b.width * scale), height: px(b.height * scale) } })],
        });
      }
      const level = headingLevel(b, body);
      const runs = blockRuns(b, body, level).map((r) => new TextRun({ ...r, font: r.font ?? mainFont }));
      // 行距：按原文的基线间距换算成「多倍行距」，单倍约为 1.25 倍字号
      const line = b.lineGap ? Math.round(Math.max(1, Math.min(2.5, b.lineGap / (b.size * 1.25))) * 240) : undefined;
      return new Paragraph({
        heading: level ? HEADINGS[level - 1] : undefined,
        alignment: ALIGN[b.align],
        indent: {
          left: b.indent ? twip(b.indent) : undefined,
          firstLine: b.firstLine > 0 ? twip(b.firstLine) : undefined,
          hanging: b.firstLine < 0 ? twip(-b.firstLine) : undefined,
        },
        spacing: { before: twip(b.spaceBefore), after: 0, line, lineRule: line ? LineRuleType.AUTO : undefined },
        children: runs,
      });
    });
    return {
      properties: {
        page: {
          size: { width: twip(page.width), height: twip(page.height) },
          margin: { top: twip(page.margin.top), right: twip(page.margin.right), bottom: twip(page.margin.bottom), left: twip(page.margin.left) },
        },
      },
      children: children.length ? children : [new Paragraph({})],
    };
  });

  const doc = new Document({
    creator: "Open Tools",
    styles: {
      default: { document: { run: { font: mainFont ?? "宋体", size: Math.round(body * 2) } } },
      // 标题的字号、粗细由每段文字自己指定，样式只用于导航窗格和目录
      paragraphStyles: [1, 2, 3].map((i) => ({
        id: `Heading${i}`,
        name: `heading ${i}`,
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { color: "000000" },
        paragraph: { keepNext: true, outlineLevel: i - 1 },
      })),
    },
    sections,
  });
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
}

/** PDF 字体名（如「ABCDEF+SimSun,Bold」）换成 Word 里的字体名；不认识的返回 undefined，使用默认字体 */
const FONTS: [RegExp, string][] = [
  [/^(simsun|nsimsun|songti|stsong|宋体)/i, "宋体"],
  [/^(simhei|stheiti|黑体)/i, "黑体"],
  [/^(kaiti|stkaiti|楷体)/i, "楷体"],
  [/^(fangsong|stfangsong|仿宋)/i, "仿宋"],
  [/^(microsoftyahei|微软雅黑)/i, "微软雅黑"],
  [/^(dengxian|等线)/i, "等线"],
  [/^times/i, "Times New Roman"],
  [/^(arial|helvetica)/i, "Arial"],
  [/^calibri/i, "Calibri"],
  [/^cambria/i, "Cambria"],
  [/^courier/i, "Courier New"],
  [/^georgia/i, "Georgia"],
  [/^verdana/i, "Verdana"],
  [/^tahoma/i, "Tahoma"],
  [/^consolas/i, "Consolas"],
];
export function wordFont(pdfName: string | undefined) {
  const name = (pdfName ?? "").replace(/^[A-Z]{6}\+/, "").replace(/\s+/g, "");
  return FONTS.find(([re]) => re.test(name))?.[1];
}
export const isBoldFont = (name = "") => /bold|black|heavy|semibold|demibold|粗/i.test(name);
export const isItalicFont = (name = "") => /italic|oblique/i.test(name);
