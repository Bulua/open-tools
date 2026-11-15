/** 裁剪框的计算（拖动、缩放、固定比例），纯函数，便于测试。坐标单位为图片像素 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** move 拖动整个框；nw/ne/sw/se 拖动四个角 */
export type CropHandle = "move" | "nw" | "ne" | "sw" | "se";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const roundRect = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

/** 初始裁剪框：居中，占图片 80%，有比例时按比例 */
export function initialCrop(width: number, height: number, ratio: number | null): Rect {
  let w = width * 0.8;
  let h = height * 0.8;
  if (ratio) {
    w = Math.min(w, h * ratio);
    h = w / ratio;
  }
  return roundRect({ x: (width - w) / 2, y: (height - h) / 2, w, h });
}

/**
 * 根据拖动距离计算新的裁剪框。
 * 拖动角时对角固定不动；框不会超出图片，也不会小于 minSize。
 */
export function updateCrop(
  start: Rect,
  handle: CropHandle,
  dx: number,
  dy: number,
  width: number,
  height: number,
  ratio: number | null,
  minSize = 16,
): Rect {
  if (handle === "move") {
    return roundRect({
      ...start,
      x: clamp(start.x + dx, 0, width - start.w),
      y: clamp(start.y + dy, 0, height - start.h),
    });
  }

  const dirX = handle.includes("e") ? 1 : -1;
  const dirY = handle.includes("s") ? 1 : -1;
  // 固定不动的对角
  const ax = dirX > 0 ? start.x : start.x + start.w;
  const ay = dirY > 0 ? start.y : start.y + start.h;
  const maxW = dirX > 0 ? width - ax : ax;
  const maxH = dirY > 0 ? height - ay : ay;

  let w = clamp(start.w + dirX * dx, minSize, maxW);
  let h = clamp(start.h + dirY * dy, minSize, maxH);
  if (ratio) {
    // 按比例收缩到同时满足宽高限制
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
  }
  return roundRect({ x: dirX > 0 ? ax : ax - w, y: dirY > 0 ? ay : ay - h, w, h });
}

/** 能放进图片的最大裁剪框，居中；不固定比例时就是整张图 */
export function fullCrop(width: number, height: number, ratio: number | null): Rect {
  let w = width;
  let h = height;
  if (ratio) {
    w = Math.min(w, h * ratio);
    h = w / ratio;
  }
  return roundRect({ x: (width - w) / 2, y: (height - h) / 2, w, h });
}

/** 导出尺寸的设置：按裁剪框的百分比缩放，或者直接指定宽高（不保持比例时） */
export type OutputSize = { scale: number } | { w: number; h: number };

/** 按裁剪框和尺寸设置算出导出图片的宽高，至少 1 像素 */
export function outputSize(crop: Rect, size: OutputSize): { w: number; h: number } {
  if ("scale" in size) {
    return { w: Math.max(1, Math.round((crop.w * size.scale) / 100)), h: Math.max(1, Math.round((crop.h * size.scale) / 100)) };
  }
  return { w: Math.max(1, Math.round(size.w)), h: Math.max(1, Math.round(size.h)) };
}

/**
 * 用户在宽或高输入框里填了数字后的尺寸设置。
 * 保持比例时换算成百分比，之后改裁剪框，导出尺寸跟着按比例变；不保持比例时固定宽高，只改填的那一边。
 */
export function sizeFromInput(crop: Rect, current: OutputSize, axis: "w" | "h", value: number, keepRatio: boolean): OutputSize {
  const v = Math.max(1, Math.round(value) || 1);
  if (keepRatio) return { scale: (v / crop[axis]) * 100 };
  const now = outputSize(crop, current);
  return axis === "w" ? { w: v, h: now.h } : { w: now.w, h: v };
}
