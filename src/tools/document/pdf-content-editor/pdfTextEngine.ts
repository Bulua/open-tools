import * as mupdf from "mupdf";
import type { EmbeddedPdfFont, OriginalPdfText } from "./pdfTextTypes";

interface Glyph { char: string; origin: mupdf.Point; quad: mupdf.Quad; advance: number }
interface TextRun extends OriginalPdfText { glyphs: Glyph[] }

function readRuns(page: mupdf.PDFPage, index: number): TextRun[] {
  let invisibleLayer = false;
  const metrics = new Map<string, { size: number; scale: number; advance: number }>();
  const originKey = (origin: number[]) => origin.map((value) => Math.round(value * 100)).join(":");
  const inspect = (text: mupdf.Text, ctm: mupdf.Matrix) => text.walk({
    showGlyph(font, trm, glyph) {
      if (glyph < 0) return;
      const matrix = mupdf.Matrix.concat(trm, ctm), size = Math.hypot(matrix[2], matrix[3]);
      if (!size) return;
      metrics.set(originKey(matrix.slice(4)), { size, scale: Math.hypot(matrix[0], matrix[1]) / size, advance: font.advanceGlyph(glyph) * size });
    },
  });
  const detector = new mupdf.Device({
    fillText: inspect,
    strokeText(text, _stroke, ctm) { inspect(text, ctm); },
    ignoreText() { invisibleLayer = true; }, clipText() { invisibleLayer = true; }, clipStrokeText() { invisibleLayer = true; },
  });
  try { page.run(detector, mupdf.Matrix.identity); detector.close(); }
  finally { detector.destroy(); }
  const structured = page.toStructuredText("preserve-whitespace");
  const runs: TextRun[] = [];
  const bounds = page.getBounds();
  let line = -1, runLine = -1, run: TextRun | undefined, style = "", supported = true;
  try {
    structured.walk({
      beginTextBlock() { run = undefined; style = ""; },
      beginLine(bbox, wmode, direction) {
        line++;
        supported = !invisibleLayer && wmode === 0 && direction[0] > 0.99 && Math.abs(direction[1]) < 0.01;
        // 只合并同一文本块内紧邻的行，避免将标题、分栏或远处的文字误作一个段落。
        if (run && (run.supported !== supported || bbox[1] - bounds[1] > run.y + run.height + run.fontSize * 0.8 || bbox[0] - bounds[0] > run.x + run.width + run.fontSize * 0.7)) { run = undefined; style = ""; }
      },
      onChar(char, origin, font, size, quad, color) {
        const actual = metrics.get(originKey(origin));
        // 结构化文字的 size 是矩阵面积的平方根，水平压缩时并非原字号。
        size = actual?.size ?? size;
        const rgb = color.length === 1 ? [color[0], color[0], color[0]] : color;
        const hex = `#${rgb.slice(0, 3).map((n) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0")).join("")}`;
        const key = `${font.getName().replace(/^[A-Z]{6}\+/, "")}:${Math.round(size * 100) / 100}:${Math.round((actual?.scale ?? 1) * 1000)}:${hex}`;
        if (!run || style !== key) {
          run = { id: `${index}:${line}:${runs.length}`, page: index, text: "", x: Infinity, y: Infinity, width: 0, height: 0, fontSize: size, color: hex, supported, fontName: font.getName(), bold: font.isBold(), italic: font.isItalic(), baseline: origin[1] - bounds[1], originX: origin[0] - bounds[0], horizontalScale: actual?.scale ?? 1, glyphs: [] };
          runs.push(run); style = key;
        } else if (runLine !== line) {
          run.text += "\n";
          run.lineHeight ??= origin[1] - bounds[1] - run.baseline!;
        }
        runLine = line;
        const xs = [quad[0], quad[2], quad[4], quad[6]], ys = [quad[1], quad[3], quad[5], quad[7]];
        const right = Math.max(run.x + run.width, Math.max(...xs) - bounds[0]);
        const bottom = Math.max(run.y + run.height, Math.max(...ys) - bounds[1]);
        run.x = Math.min(run.x, Math.min(...xs) - bounds[0]); run.y = Math.min(run.y, Math.min(...ys) - bounds[1]);
        // 首个字符的 Infinity 初值不参与尺寸计算。
        run.width = Number.isFinite(right) ? right - run.x : Math.max(...xs) - bounds[0] - run.x;
        run.height = Number.isFinite(bottom) ? bottom - run.y : Math.max(...ys) - bounds[1] - run.y;
        run.text += char; run.glyphs.push({ char, origin: [...origin], quad: [...quad], advance: actual?.advance ?? 0 });
      },
    });
    // PDF 常把一个视觉行拆到不同文本块中；只合并同基线、同样式且间距很小的片段。
    const merged: TextRun[] = [];
    for (const current of runs) {
      const previous = [...merged].reverse().find((candidate) => candidate.supported && current.supported
        && !candidate.text.includes("\n") && !current.text.includes("\n")
        && Math.abs((candidate.baseline ?? 0) - (current.baseline ?? 0)) < current.fontSize * 0.15
        && candidate.fontName?.replace(/^[A-Z]{6}\+/, "") === current.fontName?.replace(/^[A-Z]{6}\+/, "")
        && Math.abs((candidate.horizontalScale ?? 1) - (current.horizontalScale ?? 1)) < 0.001
        && Math.abs(candidate.fontSize - current.fontSize) < current.fontSize * 0.02 && candidate.color === current.color
        && current.x >= candidate.x + candidate.width - 0.1 && current.x - candidate.x - candidate.width <= current.fontSize * 0.7);
      if (!previous) { merged.push(current); continue; }
      const gap = current.x - previous.x - previous.width;
      previous.text += (gap > current.fontSize * 0.15 && !previous.text.endsWith(" ") && !current.text.startsWith(" ") ? " " : "") + current.text;
      const right = current.x + current.width, bottom = Math.max(previous.y + previous.height, current.y + current.height);
      previous.y = Math.min(previous.y, current.y); previous.width = right - previous.x; previous.height = bottom - previous.y;
      previous.glyphs.push(...current.glyphs);
    }
    for (const run of merged) {
      // 从同一行相邻字符的实际原点恢复水平缩放和字距，不把字形边界当作文字原点。
      const pairs = run.glyphs.slice(0, -1).flatMap((glyph, index) => {
        const next = run.glyphs[index + 1];
        const distance = next.origin[0] - glyph.origin[0];
        return glyph.advance > 0 && distance > 0 && Math.abs(next.origin[1] - glyph.origin[1]) < run.fontSize * 0.1
          ? [{ width: glyph.advance, distance }] : [];
      });
      if (!pairs.length) continue;
      const scale = run.horizontalScale || 1;
      run.characterSpacing = pairs.reduce((sum, pair) => sum + pair.distance / scale - pair.width, 0) / pairs.length;
    }
    return merged;
  } finally { structured.destroy(); }
}

export function readOriginalPdfText(data: Uint8Array, pageIndex: number): OriginalPdfText[] {
  const document = new mupdf.PDFDocument(data);
  try {
    const page = document.loadPage(pageIndex);
    try { return readRuns(page, pageIndex).filter((run) => run.text.trim()).map(({ glyphs: _glyphs, ...run }) => run); }
    finally { page.destroy(); }
  } finally { document.destroy(); }
}

const glyphKey = (glyph: Glyph) => `${glyph.char}:${glyph.origin.map((n) => Math.round(n * 10)).join(":")}`;
function inventory(runs: TextRun[], omitted: Set<string>) {
  const counts = new Map<string, number>();
  for (const run of runs) if (!omitted.has(run.id)) for (const glyph of run.glyphs) {
    const key = glyphKey(glyph); counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** 在副本中只删除所选原文，保留图片、底色和线条；校验后才返回新文件。 */
export function removeOriginalPdfText(data: Uint8Array, ids: string[]): Uint8Array {
  if (!ids.length) return data.slice();
  const document = new mupdf.PDFDocument(data);
  try {
    const wanted = new Set(ids);
    const byPage = new Map<number, Set<string>>();
    for (const id of wanted) {
      const page = Number(id.split(":")[0]);
      if (!Number.isInteger(page) || page < 0 || page >= document.countPages()) throw new Error("PDF_TEXT_STALE");
      const set = byPage.get(page) ?? new Set(); set.add(id); byPage.set(page, set);
    }
    for (const [index, selected] of byPage) {
      const page = document.loadPage(index);
      try {
        // 不应用文档中已经存在的删改标记，以免修改范围超出用户当前选择。
        if (page.getAnnotations().some((annot) => annot.getType() === "Redact")) throw new Error("PDF_TEXT_UNSAFE");
        const before = readRuns(page, index), targets = before.filter((run) => selected.has(run.id));
        if (targets.length !== selected.size) throw new Error("PDF_TEXT_STALE");
        if (targets.some((run) => !run.supported)) throw new Error("PDF_TEXT_UNSUPPORTED");
        const expected = inventory(before, selected);
        for (const run of targets) {
          const annotation = page.createAnnotation("Redact");
          // 字符中心的窄四边形足以命中文字，并减少触及相邻行的机会。
          annotation.setQuadPoints(run.glyphs.map(({ quad: q }) => {
            const mix = (a: number, b: number, ratio: number) => a + (b - a) * ratio;
            return [mix(q[0], q[4], 0.4), mix(q[1], q[5], 0.4), mix(q[2], q[6], 0.4), mix(q[3], q[7], 0.4), mix(q[0], q[4], 0.6), mix(q[1], q[5], 0.6), mix(q[2], q[6], 0.6), mix(q[3], q[7], 0.6)] as mupdf.Quad;
          }));
          annotation.update();
        }
        page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE);
        const after = inventory(readRuns(page, index), new Set());
        if (after.size !== expected.size || [...expected].some(([key, count]) => after.get(key) !== count)) throw new Error("PDF_TEXT_UNSAFE");
      } finally { page.destroy(); }
    }
    const buffer = document.saveToBuffer("garbage=4,compress");
    try { return buffer.asUint8Array().slice(); } finally { buffer.destroy(); }
  } finally { document.destroy(); }
}

/** 复用 PDF 内可直接加载的 TrueType/OpenType 字体；原始 CFF 流不能直接当作浏览器字体。 */
export function readEmbeddedPdfFonts(data: Uint8Array, pageIndex: number): EmbeddedPdfFont[] {
  const document = new mupdf.PDFDocument(data), fonts: EmbeddedPdfFont[] = [];
  const visited = new Set<number>();
  const visit = (resources: mupdf.PDFObject, depth = 0) => {
    if (depth > 12 || resources.isNull()) return;
    resources.get("Font").forEach((font) => {
      const number = font.asIndirect();
      if (number && visited.has(number)) return;
      if (number) visited.add(number);
      const descendant = font.get("DescendantFonts", 0);
      const actual = descendant.isNull() ? font : descendant;
      const descriptor = actual.get("FontDescriptor");
      if (descriptor.isNull()) return;
      const stream = descriptor.get("FontFile2").isNull() ? descriptor.get("FontFile3") : descriptor.get("FontFile2");
      if (!stream.isStream()) return;
      const buffer = stream.readStream();
      try {
        const bytes = buffer.asUint8Array().slice();
        const signature = String.fromCharCode(...bytes.slice(0, 4));
        if (signature === "OTTO" || signature === "true" || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) {
          fonts.push({ name: font.get("BaseFont").asName() || actual.get("BaseFont").asName(), bytes });
        }
      } finally { buffer.destroy(); }
    });
    resources.get("XObject").forEach((object) => {
      const number = object.asIndirect();
      if (number && visited.has(number)) return;
      if (number) visited.add(number);
      if (object.get("Subtype").asName() === "Form") visit(object.get("Resources"), depth + 1);
    });
  };
  try { const page = document.loadPage(pageIndex); try { visit(page.getObject().getInheritable("Resources")); } finally { page.destroy(); } return fonts; }
  finally { document.destroy(); }
}
