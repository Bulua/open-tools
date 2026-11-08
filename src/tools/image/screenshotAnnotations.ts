import { containsPoint, resizeSelection, selectionHandles, type ResizeHandle, type ShotPoint, type ShotRect } from "./screenshotSelection";

export interface ScreenshotMark {
  tool: "pen" | "line" | "arrow" | "rect" | "text" | "mosaic";
  points: ShotPoint[];
  color: string;
  width: number;
  text?: string;
  fontSize?: number;
  rotation?: number;
}

export const textFontSize = (mark: ScreenshotMark) => mark.fontSize ?? Math.max(14, mark.width * 6);
export const textLineHeight = (mark: ScreenshotMark) => textFontSize(mark) * 1.3;
export type MarkHandle = ResizeHandle | "start" | "end";

export function markBounds(mark: ScreenshotMark, measureText: (text: string, fontSize: number) => number): ShotRect {
  const xs = mark.points.map((point) => point.x);
  const ys = mark.points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  if (mark.tool === "text") {
    const lines = (mark.text ?? "").split("\n");
    return { x, y, w: Math.max(4, ...lines.map((line) => measureText(line, textFontSize(mark)))), h: lines.length * textLineHeight(mark) };
  }
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function segmentDistance(point: ShotPoint, a: ShotPoint, b: ShotPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

/** 线条按笔迹命中，空心矩形只命中边缘，避免把整个内部变成拖动区。 */
export function hitMark(mark: ScreenshotMark, point: ShotPoint, measureText: (text: string, fontSize: number) => number): boolean {
  point = markLocalPoint(mark, point, measureText);
  const rect = markBounds(mark, measureText);
  const tolerance = Math.max(6, mark.width / 2 + 3);
  if (mark.tool === "text" || mark.tool === "mosaic") {
    return containsPoint({ x: rect.x - 3, y: rect.y - 3, w: rect.w + 6, h: rect.h + 6 }, point);
  }
  if (mark.tool === "rect") {
    const { x, y, w, h } = rect;
    const corners = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
    return corners.some((corner, i) => segmentDistance(point, corner, corners[(i + 1) % 4]) <= tolerance);
  }
  return mark.points.some((end, i) => segmentDistance(point, mark.points[Math.max(0, i - 1)], end) <= tolerance);
}

export function moveMark(mark: ScreenshotMark, delta: ShotPoint): ScreenshotMark {
  return { ...mark, points: mark.points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y })) };
}

export function markControlBounds(mark: ScreenshotMark, measureText: (text: string, fontSize: number) => number): ShotRect {
  const rect = markBounds(mark, measureText);
  return { x: rect.x - Math.max(0, 12 - rect.w) / 2, y: rect.y - Math.max(0, 12 - rect.h) / 2, w: Math.max(12, rect.w), h: Math.max(12, rect.h) };
}

export function markHandles(mark: ScreenshotMark, measureText: (text: string, fontSize: number) => number): { handle: MarkHandle; x: number; y: number }[] {
  if (mark.tool === "line" || mark.tool === "arrow") {
    return [{ ...markWorldPoint(mark, mark.points[0], measureText), handle: "start" }, { ...markWorldPoint(mark, mark.points[mark.points.length - 1], measureText), handle: "end" }];
  }
  const handles = selectionHandles(markControlBounds(mark, measureText));
  // 文字只提供四角，缩放字号而不拉伸字形。
  return (mark.tool === "text" ? handles.filter((entry) => entry.handle.length === 2) : handles)
    .map((entry) => ({ ...markWorldPoint(mark, entry, measureText), handle: entry.handle }));
}

export function markHandleAt(mark: ScreenshotMark, point: ShotPoint, measureText: (text: string, fontSize: number) => number): MarkHandle | undefined {
  return markHandles(mark, measureText).find((entry) => Math.abs(entry.x - point.x) <= 6 && Math.abs(entry.y - point.y) <= 6)?.handle;
}

/** 以操作开始时的标注为基准计算，避免连续缩放累计误差。 */
function resizeUnrotatedMark(mark: ScreenshotMark, handle: MarkHandle, point: ShotPoint, clip: ShotRect, measureText: (text: string, fontSize: number) => number): ScreenshotMark {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const pointer = { x: clamp(point.x, clip.x, clip.x + clip.w), y: clamp(point.y, clip.y, clip.y + clip.h) };
  if (handle === "start" || handle === "end") {
    const points = mark.points.map((entry) => ({ ...entry }));
    const index = handle === "start" ? 0 : points.length - 1;
    const oldLength = Math.hypot(points[points.length - 1].x - points[0].x, points[points.length - 1].y - points[0].y);
    points[index] = pointer;
    const newLength = Math.hypot(points[points.length - 1].x - points[0].x, points[points.length - 1].y - points[0].y);
    return { ...mark, points, width: clamp(mark.width * newLength / Math.max(1, oldLength), .5, 40) };
  }
  const rect = markControlBounds(mark, measureText);
  if (mark.tool === "text") {
    const west = handle.includes("w");
    const north = handle.includes("n");
    const anchor = { x: west ? rect.x + rect.w : rect.x, y: north ? rect.y + rect.h : rect.y };
    const vector = { x: west ? -rect.w : rect.w, y: north ? -rect.h : rect.h };
    const factor = ((pointer.x - anchor.x) * vector.x + (pointer.y - anchor.y) * vector.y) / (rect.w * rect.w + rect.h * rect.h);
    const availableWidth = west ? anchor.x - clip.x : clip.x + clip.w - anchor.x;
    const availableHeight = north ? anchor.y - clip.y : clip.y + clip.h - anchor.y;
    const maxFactor = Math.min(availableWidth / rect.w, availableHeight / rect.h, 256 / textFontSize(mark));
    const fontSize = Math.max(8, textFontSize(mark) * Math.min(maxFactor, Math.max(8 / textFontSize(mark), factor)));
    const scaled = { ...mark, fontSize };
    const next = markBounds(scaled, measureText);
    return { ...scaled, points: [{ x: west ? anchor.x - next.w : anchor.x, y: north ? anchor.y - next.h : anchor.y }] };
  }
  const next = resizeSelection(
    { x: rect.x - clip.x, y: rect.y - clip.y, w: rect.w, h: rect.h }, handle,
    { x: pointer.x - clip.x, y: pointer.y - clip.y }, { w: clip.w, h: clip.h },
  );
  const sx = next.w / rect.w;
  const sy = next.h / rect.h;
  return {
    ...mark,
    points: mark.points.map((entry) => ({ x: clip.x + next.x + (entry.x - rect.x) * sx, y: clip.y + next.y + (entry.y - rect.y) * sy })),
    width: clamp(mark.width * Math.sqrt(sx * sy), .5, 40),
  };
}

export function markCenter(mark: ScreenshotMark, measureText: (text: string, fontSize: number) => number): ShotPoint {
  const rect = markBounds(mark, measureText);
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function rotatePoint(point: ShotPoint, center: ShotPoint, degrees: number): ShotPoint {
  const angle = degrees * Math.PI / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
}

export function markWorldPoint(mark: ScreenshotMark, point: ShotPoint, measureText: (text: string, fontSize: number) => number): ShotPoint {
  return rotatePoint(point, markCenter(mark, measureText), mark.rotation ?? 0);
}

export function markLocalPoint(mark: ScreenshotMark, point: ShotPoint, measureText: (text: string, fontSize: number) => number): ShotPoint {
  return rotatePoint(point, markCenter(mark, measureText), -(mark.rotation ?? 0));
}

export function markWorldBounds(mark: ScreenshotMark, measureText: (text: string, fontSize: number) => number): ShotRect {
  const rect = markBounds(mark, measureText);
  const corners = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y }, { x: rect.x, y: rect.y + rect.h }, { x: rect.x + rect.w, y: rect.y + rect.h }]
    .map((point) => markWorldPoint(mark, point, measureText));
  const x = Math.min(...corners.map((point) => point.x));
  const y = Math.min(...corners.map((point) => point.y));
  return { x, y, w: Math.max(...corners.map((point) => point.x)) - x, h: Math.max(...corners.map((point) => point.y)) - y };
}

export function resizeMark(mark: ScreenshotMark, handle: MarkHandle, point: ShotPoint, clip: ShotRect, measureText: (text: string, fontSize: number) => number): ScreenshotMark {
  const resized = resizeUnrotatedMark(mark, handle, markLocalPoint(mark, point, measureText), clip, measureText);
  const before = markCenter(mark, measureText);
  const after = markCenter(resized, measureText);
  // 缩放改变局部中心后补偿旋转位移，使固定的对边或端点仍留在原位置。
  const rotated = rotatePoint(after, before, mark.rotation ?? 0);
  return moveMark(resized, { x: rotated.x - after.x, y: rotated.y - after.y });
}

export function rotateMark(mark: ScreenshotMark, from: ShotPoint, to: ShotPoint, measureText: (text: string, fontSize: number) => number, snap = false): ScreenshotMark {
  const center = markCenter(mark, measureText);
  const delta = Math.atan2(to.y - center.y, to.x - center.x) - Math.atan2(from.y - center.y, from.x - center.x);
  let rotation = (mark.rotation ?? 0) + delta * 180 / Math.PI;
  if (snap) rotation = Math.round(rotation / 15) * 15;
  return { ...mark, rotation: ((rotation % 360) + 360) % 360 };
}
