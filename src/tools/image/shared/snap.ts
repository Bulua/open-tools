import type { Box } from "./effects";

/** 要显示的参考线：竖线的 x 坐标、横线的 y 坐标 */
export interface Guides {
  x: number[];
  y: number[];
}

/** 一个方向上的吸附：图片的起点、中线、终点靠近任一目标线时对齐过去 */
function snapAxis(pos: number, size: number, targets: number[], threshold: number) {
  const offsets = [0, size / 2, size];
  let best: number | null = null;
  for (const t of targets) {
    for (const o of offsets) {
      const d = t - (pos + o);
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  if (best === null) return { pos, lines: [] };
  const next = pos + best;
  // 对齐后同时重合的线都显示出来（例如左边和中线同时对上两张图片）
  const lines = [...new Set(targets.filter((t) => offsets.some((o) => Math.abs(t - (next + o)) < 0.5)))];
  return { pos: next, lines };
}

/**
 * 拖动图片时的智能参考线（像 PPT 那样）：图片的边缘、中线靠近其他图片的边缘、中线时吸附对齐，
 * 并返回要显示的参考线。threshold 是吸附距离（画布像素）。
 */
export function snapBox(box: Box, others: Box[], threshold: number) {
  const xs = others.flatMap((b) => [b.x, b.x + b.w / 2, b.x + b.w]);
  const ys = others.flatMap((b) => [b.y, b.y + b.h / 2, b.y + b.h]);
  const x = snapAxis(box.x, box.w, xs, threshold);
  const y = snapAxis(box.y, box.h, ys, threshold);
  return { x: x.pos, y: y.pos, guides: { x: x.lines, y: y.lines } as Guides };
}
