/** 截图选区几何逻辑，所有输入使用同一坐标系。 */
export interface ShotPoint { x: number; y: number }
export interface ShotRect extends ShotPoint { w: number; h: number }
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** 客户区原点与桌面原点不一定相同，不能仅按整屏宽高比例换算。 */
export function desktopRectToClient(rect: ShotRect, viewport: ShotRect, cssSize: { w: number; h: number }): ShotRect {
  return {
    x: (rect.x - viewport.x) * cssSize.w / viewport.w,
    y: (rect.y - viewport.y) * cssSize.h / viewport.h,
    w: rect.w * cssSize.w / viewport.w,
    h: rect.h * cssSize.h / viewport.h,
  };
}

export function clientRectToDesktop(rect: ShotRect, viewport: ShotRect, cssSize: { w: number; h: number }): ShotRect {
  return {
    x: rect.x * viewport.w / cssSize.w + viewport.x,
    y: rect.y * viewport.h / cssSize.h + viewport.y,
    w: rect.w * viewport.w / cssSize.w,
    h: rect.h * viewport.h / cssSize.h,
  };
}

export function containsPoint(rect: ShotRect, point: ShotPoint): boolean {
  return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.w && point.y < rect.y + rect.h;
}

/** 窗口列表按 Z 序排列，优先命中遮挡在前面的窗口。 */
export function windowAt(point: ShotPoint, windows: ShotRect[]): ShotRect | undefined {
  return windows.find((rect) => containsPoint(rect, point));
}

export function selectionHandles(rect: ShotRect): { handle: ResizeHandle; x: number; y: number }[] {
  const { x, y, w, h } = rect;
  return [
    { handle: "nw", x, y }, { handle: "n", x: x + w / 2, y }, { handle: "ne", x: x + w, y },
    { handle: "e", x: x + w, y: y + h / 2 }, { handle: "se", x: x + w, y: y + h },
    { handle: "s", x: x + w / 2, y: y + h }, { handle: "sw", x, y: y + h }, { handle: "w", x, y: y + h / 2 },
  ];
}

export function resizeHandleAt(rect: ShotRect, point: ShotPoint, tolerance = 6): ResizeHandle | undefined {
  const corner = selectionHandles(rect).find((entry) => Math.abs(entry.x - point.x) <= tolerance && Math.abs(entry.y - point.y) <= tolerance);
  if (corner) return corner.handle;
  if (point.x >= rect.x && point.x <= rect.x + rect.w) {
    if (Math.abs(point.y - rect.y) <= tolerance) return "n";
    if (Math.abs(point.y - rect.y - rect.h) <= tolerance) return "s";
  }
  if (point.y >= rect.y && point.y <= rect.y + rect.h) {
    if (Math.abs(point.x - rect.x) <= tolerance) return "w";
    if (Math.abs(point.x - rect.x - rect.w) <= tolerance) return "e";
  }
}

/** 保持对边固定，并限制在屏幕内和最小尺寸以上。 */
export function resizeSelection(rect: ShotRect, handle: ResizeHandle, point: ShotPoint, bounds: { w: number; h: number }): ShotRect {
  let { x, y } = rect;
  let right = x + rect.w;
  let bottom = y + rect.h;
  const min = 4;
  if (handle.includes("w")) x = Math.max(0, Math.min(right - min, point.x));
  if (handle.includes("n")) y = Math.max(0, Math.min(bottom - min, point.y));
  if (handle.includes("e")) right = Math.min(bounds.w, Math.max(x + min, point.x));
  if (handle.includes("s")) bottom = Math.min(bounds.h, Math.max(y + min, point.y));
  return { x, y, w: right - x, h: bottom - y };
}
