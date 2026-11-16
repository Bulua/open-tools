export interface EditPoint { x: number; y: number }
export type EditKind = "text" | "image" | "signature" | "highlight" | "rectangle" | "ellipse" | "line" | "arrow";
export interface PdfEditObject {
  id: number;
  page: number;
  kind: EditKind;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  strokeWidth: number;
  arrowHeadSize?: number;
  text?: string;
  fontId?: string;
  fontSize?: number;
  /** 原文的首行基线、行距和初始属性，避免点击就重新排版。 */
  baseline?: number;
  lineHeight?: number;
  originalState?: string;
  originalFontName?: string;
  textOriginX?: number;
  characterSpacing?: number;
  horizontalScale?: number;
  image?: string;
  /** 笔迹和线段的坐标相对于对象框，范围为 0～1。 */
  points?: EditPoint[];
  /** 被替换的原文段编号；删除和移动替换文字时仍需移除旧位置的原文。 */
  originalId?: string;
}
export interface PdfEditPage {
  width: number;
  height: number;
  /** PDF.js 的原始页面到可见页面坐标转换，包含旋转和裁切框偏移。 */
  transform: number[];
}

export function clampObject<T extends PdfEditObject>(item: T, page: PdfEditPage): T {
  const width = Math.min(page.width, Math.max(4, Number(item.width) || 4));
  const height = Math.min(page.height, Math.max(4, Number(item.height) || 4));
  return { ...item, width, height, x: Math.max(0, Math.min(page.width - width, Number(item.x) || 0)), y: Math.max(0, Math.min(page.height - height, Number(item.y) || 0)) };
}

/** 编辑历史只存数据；图片使用不可变 data URL，撤销时不会复制图片的二进制数据。 */
export function createEditHistory(limit = 60) {
  let past: PdfEditObject[][] = [], future: PdfEditObject[][] = [];
  return {
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    push(items: PdfEditObject[]) { past = [...past.slice(-(limit - 1)), cloneEditObjects(items)]; future = []; },
    undo(items: PdfEditObject[]) { const last = past.pop(); if (!last) return undefined; future.push(cloneEditObjects(items)); return cloneEditObjects(last); },
    redo(items: PdfEditObject[]) { const next = future.pop(); if (!next) return undefined; past.push(cloneEditObjects(items)); return cloneEditObjects(next); },
    clear() { past = []; future = []; },
  };
}

/** 仅按用户输入的换行分行，不因文本框宽度重新排版。 */
export function textLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

export const arrowHeadSize = (value?: number) => Math.min(96, Math.max(4, Number(value) || 24));

/** 预览和导出共用页面向下的坐标，箭头两翼允许超出线段的包围框。 */
export function arrowHeadPoints(item: PdfEditObject): EditPoint[] {
  const points = item.points ?? [{ x: 0, y: 1 }, { x: 1, y: 0 }];
  if (points.length < 2) return [];
  const start = points[0], end = points[points.length - 1];
  const x = end.x * item.width, y = end.y * item.height;
  const angle = Math.atan2((end.y - start.y) * item.height, (end.x - start.x) * item.width);
  const length = arrowHeadSize(item.arrowHeadSize);
  return [
    { x: x - length * Math.cos(angle - Math.PI / 6), y: y - length * Math.sin(angle - Math.PI / 6) },
    { x, y },
    { x: x - length * Math.cos(angle + Math.PI / 6), y: y - length * Math.sin(angle + Math.PI / 6) },
  ];
}

/** 预览测宽与导出使用相同的可选排版特性，避免字偶距或连字造成偏移。 */
export const PDF_TEXT_FEATURES = { kern: false, liga: false, clig: false, calt: false };

export const originalState = (item: PdfEditObject) => JSON.stringify([item.text, item.x, item.y, item.width, item.height, item.fontId, item.fontSize, item.color, item.opacity, item.baseline, item.lineHeight, item.textOriginX, item.characterSpacing, item.horizontalScale]);
export const pristineOriginal = (item: PdfEditObject) => !!item.originalId && !!item.originalState && originalState(item) === item.originalState;
export const cloneEditObjects = (items: PdfEditObject[]): PdfEditObject[] => items.map((item) => ({ ...item, points: item.points?.map((point) => ({ ...point })) }));
