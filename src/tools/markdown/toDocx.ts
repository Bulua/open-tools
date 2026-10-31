import { Lexer, type Token, type Tokens } from "marked";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type IRunOptions,
  type ParagraphChild,
} from "docx";

/**
 * Markdown → Word（.docx）。
 * 按 Markdown 的结构生成真正的 Word 元素：标题使用 Word 内置的「标题 1～6」样式（导航窗格、目录可用），
 * 列表使用 Word 的项目符号和编号，表格、代码块、引用、图片都转成对应的 Word 格式。
 */

export interface DocxOptions {
  /** 正文中文字体 */
  font: string;
  /** 正文字号（磅） */
  fontSize: number;
  /** 行距倍数 */
  lineSpacing: number;
  /**
   * 读取图片：返回图片数据和像素尺寸，读取失败返回 null（转换时显示为图片说明文字）。
   * 不提供时所有图片都显示为说明文字。
   */
  loadImage?: (src: string) => Promise<LoadedImage | null>;
}

export interface LoadedImage {
  data: Uint8Array;
  type: "png" | "jpg" | "gif" | "bmp";
  width: number;
  height: number;
}

export const DEFAULT_DOCX_OPTIONS: DocxOptions = { font: "宋体", fontSize: 11, lineSpacing: 1.5 };

/** 常用中文字号（磅） */
export const FONT_SIZES = [
  { label: "小五", value: 9 },
  { label: "五号", value: 10.5 },
  { label: "11 磅", value: 11 },
  { label: "小四", value: 12 },
  { label: "四号", value: 14 },
];

const CODE_FONT = "Consolas";
const LATIN_FONT = "Calibri";
const HEADING_SIZES = [22, 18, 15, 14, 12, 12];
/** A4 纸、左右各 2.54 cm 页边距时的版心宽度（像素，96 DPI） */
const CONTENT_WIDTH_PX = 602;

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: boolean;
  color?: string;
}

/** HTML 实体还原为字符（Markdown 里的 &amp; &lt; 等） */
const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const stripTags = (s: string) => decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));

class Converter {
  private orderedLists = 0;
  constructor(private options: DocxOptions) {}

  private run(text: string, style: InlineStyle): TextRun {
    const opts: IRunOptions = {
      text,
      bold: style.bold,
      italics: style.italics,
      strike: style.strike,
      color: style.color,
      ...(style.code
        ? {
            font: { ascii: CODE_FONT, hAnsi: CODE_FONT, eastAsia: this.options.font },
            shading: { type: ShadingType.CLEAR, fill: "F2F1EC", color: "auto" },
          }
        : {}),
      ...(style.link ? { style: "Hyperlink" } : {}),
    };
    return new TextRun(opts);
  }

  /** 文本里的换行变成 Word 的换行符 */
  private textRuns(text: string, style: InlineStyle): TextRun[] {
    return text.split("\n").map((line, i) => (i ? new TextRun({ text: line, break: 1 }) : this.run(line, style)));
  }

  async inline(tokens: Token[] | undefined, style: InlineStyle = {}): Promise<ParagraphChild[]> {
    const out: ParagraphChild[] = [];
    for (const t of tokens ?? []) {
      switch (t.type) {
        case "strong":
          out.push(...(await this.inline(t.tokens, { ...style, bold: true })));
          break;
        case "em":
          out.push(...(await this.inline(t.tokens, { ...style, italics: true })));
          break;
        case "del":
          out.push(...(await this.inline(t.tokens, { ...style, strike: true })));
          break;
        case "codespan":
          out.push(this.run(decodeEntities(t.text), { ...style, code: true }));
          break;
        case "br":
          out.push(new TextRun({ text: "", break: 1 }));
          break;
        case "link": {
          const children = (await this.inline(t.tokens, { ...style, link: true })).filter((c): c is TextRun => c instanceof TextRun);
          out.push(/^(https?|mailto):/i.test(t.href) ? new ExternalHyperlink({ link: t.href, children }) : (children[0] ?? this.run(t.text, style)));
          break;
        }
        case "image":
          out.push(await this.image(t as Tokens.Image));
          break;
        case "html":
          out.push(...this.textRuns(stripTags(t.text), style));
          break;
        case "text":
        case "escape":
          if ("tokens" in t && t.tokens?.length) out.push(...(await this.inline(t.tokens, style)));
          else out.push(...this.textRuns(decodeEntities(t.text), style));
          break;
        default:
          if ("text" in t && typeof t.text === "string") out.push(...this.textRuns(decodeEntities(t.text), style));
      }
    }
    return out;
  }

  private async image(t: Tokens.Image): Promise<ParagraphChild> {
    const fallback = this.run(`[图片${t.text ? `：${t.text}` : ""}]`, { italics: true });
    const img = await this.options.loadImage?.(t.href).catch(() => null);
    if (!img || !img.width || !img.height) return fallback;
    // 超过版心宽度的图片按比例缩小
    const scale = Math.min(1, CONTENT_WIDTH_PX / img.width);
    return new ImageRun({
      type: img.type,
      data: img.data,
      transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) },
      altText: { name: t.text || "image", description: t.text, title: t.title ?? t.text },
    });
  }

  private async paragraph(tokens: Token[] | undefined, extra: Omit<IParagraphOptions, "children"> = {}) {
    return new Paragraph({ children: await this.inline(tokens), ...extra });
  }

  private codeBlock(text: string): Table {
    const lines = text.replace(/\n$/, "").split("\n");
    const font = { ascii: CODE_FONT, hAnsi: CODE_FONT, eastAsia: this.options.font };
    const none = { style: BorderStyle.NONE, size: 0, color: "auto" };
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: "F5F4EE", color: "auto" },
              margins: { top: 100, bottom: 100, left: 160, right: 160 },
              children: lines.map(
                (line) =>
                  new Paragraph({
                    spacing: { before: 0, after: 0, line: 276 },
                    children: [new TextRun({ text: line || " ", font, size: Math.round(this.options.fontSize * 1.8) })],
                  }),
              ),
            }),
          ],
        }),
      ],
    });
  }

  private async table(t: Tokens.Table): Promise<Table> {
    const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBDB6" };
    const alignOf = (a: string | null) =>
      a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT;
    const cell = async (c: Tokens.TableCell, header: boolean, col: number) =>
      new TableCell({
        shading: header ? { type: ShadingType.CLEAR, fill: "F0EEE6", color: "auto" } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: alignOf(t.align[col]),
            spacing: { before: 0, after: 0 },
            children: await this.inline(c.tokens, header ? { bold: true } : {}),
          }),
        ],
      });
    const rows = [
      new TableRow({ tableHeader: true, children: await Promise.all(t.header.map((c, i) => cell(c, true, i))) }),
      ...(await Promise.all(t.rows.map(async (r) => new TableRow({ children: await Promise.all(r.map((c, i) => cell(c, false, i))) })))),
    ];
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows,
    });
  }

  private async list(t: Tokens.List, level: number, instance: number): Promise<(Paragraph | Table)[]> {
    const out: (Paragraph | Table)[] = [];
    for (const item of t.items) {
      let first = true;
      for (const child of item.tokens) {
        if (child.type === "list") {
          const nested = child as Tokens.List;
          out.push(...(await this.list(nested, Math.min(level + 1, 8), nested.ordered ? ++this.orderedLists : 0)));
          continue;
        }
        if (child.type !== "text" && child.type !== "paragraph") {
          out.push(...(await this.block(child)));
          continue;
        }
        const children = await this.inline((child as Tokens.Text).tokens ?? [child]);
        if (first && item.task) children.unshift(new TextRun({ text: item.checked ? "☑ " : "☐ " }));
        out.push(
          new Paragraph({
            children,
            spacing: { after: 60 },
            // 同一项里的第二段不再显示符号，只缩进对齐
            ...(first
              ? t.ordered
                ? { numbering: { reference: "ordered", level, instance } }
                : { bullet: { level } }
              : { indent: { left: 720 * (level + 1) } }),
          }),
        );
        first = false;
      }
    }
    return out;
  }

  async block(t: Token): Promise<(Paragraph | Table)[]> {
    switch (t.type) {
      case "heading":
        return [await this.paragraph(t.tokens, { style: `Heading${Math.min(t.depth, 6)}` })];
      case "paragraph":
        return [await this.paragraph(t.tokens)];
      case "code":
        return [this.codeBlock(t.text), new Paragraph({ spacing: { after: 0 }, children: [] })];
      case "blockquote": {
        const inner: (Paragraph | Table)[] = [];
        for (const child of t.tokens ?? []) {
          if (child.type === "paragraph" || child.type === "text") {
            inner.push(
              new Paragraph({
                children: await this.inline(child.tokens, { color: "6B6A65" }),
                indent: { left: 240 },
                border: { left: { style: BorderStyle.SINGLE, size: 18, color: "D9D6CC", space: 10 } },
              }),
            );
          } else inner.push(...(await this.block(child)));
        }
        return inner;
      }
      case "list":
        return this.list(t as Tokens.List, 0, (t as Tokens.List).ordered ? ++this.orderedLists : 0);
      case "table":
        return [await this.table(t as Tokens.Table), new Paragraph({ spacing: { after: 0 }, children: [] })];
      case "hr":
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D9D6CC", space: 1 } }, children: [] })];
      case "html": {
        const text = stripTags(t.text).trim();
        return text ? [new Paragraph({ children: this.textRuns(text, {}) })] : [];
      }
      case "space":
      case "def":
        return [];
      default:
        return "text" in t && typeof t.text === "string" ? [new Paragraph({ children: this.textRuns(decodeEntities(t.text), {}) })] : [];
    }
  }
}

/** 把 Markdown 转成 .docx 文件内容 */
export async function markdownToDocx(markdown: string, options: DocxOptions = DEFAULT_DOCX_OPTIONS): Promise<Uint8Array> {
  const tokens = new Lexer({ gfm: true }).lex(markdown);
  const converter = new Converter(options);
  const children: (Paragraph | Table)[] = [];
  for (const t of tokens) children.push(...(await converter.block(t)));

  const font = { ascii: LATIN_FONT, hAnsi: LATIN_FONT, eastAsia: options.font };
  const size = Math.round(options.fontSize * 2);
  const line = Math.round(options.lineSpacing * 240);

  const doc = new Document({
    creator: "Open Tools",
    styles: {
      default: {
        document: { run: { font, size }, paragraph: { spacing: { line, after: 120 } } },
      },
      paragraphStyles: HEADING_SIZES.map((pt, i) => ({
        id: `Heading${i + 1}`,
        name: `heading ${i + 1}`,
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: { ascii: LATIN_FONT, hAnsi: LATIN_FONT, eastAsia: "黑体" }, size: pt * 2, bold: true, color: "1F1E1D" },
        paragraph: { spacing: { before: i < 2 ? 360 : 240, after: 120, line: 288 }, keepNext: true, outlineLevel: i },
      })),
      characterStyles: [{ id: "Hyperlink", name: "Hyperlink", basedOn: "DefaultParagraphFont", run: { color: "1F5FAD", underline: {} } }],
    },
    numbering: {
      config: [
        {
          reference: "ordered",
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children: children.length ? children : [new Paragraph({ children: [] })],
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

/** 文件名：a.md → a.docx */
export const docxNameOf = (name: string) => `${name.replace(/\.(md|markdown|txt)$/i, "") || "文档"}.docx`;
