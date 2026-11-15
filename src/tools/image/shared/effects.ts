/**
 * 拼接、马赛克、去背景、水印用到的计算。
 * 只处理数字和像素数组，不依赖浏览器，便于测试。
 */

export interface Size {
  width: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------- 拼接 ----------

export type StitchDirection = "horizontal" | "vertical" | "grid";

export interface StitchOptions {
  direction: StitchDirection;
  /** 宫格的列数 */
  columns: number;
  /** 图片之间的间距 */
  gap: number;
  /** 四周的外边距 */
  padding: number;
  /** 统一尺寸：横向拼接统一高度，纵向和宫格统一宽度（以最小的为准，不放大） */
  unify: boolean;
}

/** 计算拼接后的画布大小，以及每张图片画在哪里、画多大 */
export function stitchLayout(sizes: Size[], o: StitchOptions): { width: number; height: number; boxes: Box[] } {
  if (!sizes.length) return { width: 0, height: 0, boxes: [] };
  const { gap, padding } = o;

  if (o.direction === "horizontal") {
    const h = o.unify ? Math.min(...sizes.map((s) => s.height)) : 0;
    const scaled = sizes.map((s) => (o.unify ? { width: Math.round((s.width * h) / s.height), height: h } : s));
    const rowH = Math.max(...scaled.map((s) => s.height));
    let x = padding;
    const boxes = scaled.map((s) => {
      // 高度不一致时垂直居中
      const box = { x, y: padding + Math.round((rowH - s.height) / 2), w: s.width, h: s.height };
      x += s.width + gap;
      return box;
    });
    return { width: x - gap + padding, height: rowH + padding * 2, boxes };
  }

  if (o.direction === "vertical") {
    const w = o.unify ? Math.min(...sizes.map((s) => s.width)) : 0;
    const scaled = sizes.map((s) => (o.unify ? { width: w, height: Math.round((s.height * w) / s.width) } : s));
    const colW = Math.max(...scaled.map((s) => s.width));
    let y = padding;
    const boxes = scaled.map((s) => {
      // 宽度不一致时水平居中
      const box = { x: padding + Math.round((colW - s.width) / 2), y, w: s.width, h: s.height };
      y += s.height + gap;
      return box;
    });
    return { width: colW + padding * 2, height: y - gap + padding, boxes };
  }

  // 宫格：每格宽度相同，每行高度取这一行最高的图片，图片在格子里居中
  const columns = Math.max(1, Math.min(o.columns, sizes.length));
  const cellW = o.unify ? Math.min(...sizes.map((s) => s.width)) : Math.max(...sizes.map((s) => s.width));
  const scaled = sizes.map((s) => (o.unify ? { width: cellW, height: Math.round((s.height * cellW) / s.width) } : s));
  const rows = Math.ceil(scaled.length / columns);
  const rowHeights = Array.from({ length: rows }, (_, r) =>
    Math.max(...scaled.slice(r * columns, (r + 1) * columns).map((s) => s.height)),
  );
  const boxes: Box[] = [];
  let y = padding;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const s = scaled[r * columns + c];
      if (!s) break;
      const cellX = padding + c * (cellW + gap);
      boxes.push({
        x: cellX + Math.round((cellW - s.width) / 2),
        y: y + Math.round((rowHeights[r] - s.height) / 2),
        w: s.width,
        h: s.height,
      });
    }
    y += rowHeights[r] + gap;
  }
  return { width: padding * 2 + columns * cellW + (columns - 1) * gap, height: y - gap + padding, boxes };
}

/** 所有图片占据的范围（自由排列时「适应内容」用） */
export function contentBounds(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

// ---------- 马赛克 ----------

/**
 * 把区域内的像素变成马赛克（直接修改 data）。
 * 格子与图片左上角对齐，多次涂抹时格子会对齐，不会错位；
 * inside(cx, cy) 判断格子中心是否需要处理，用于画笔等非矩形区域。
 */
export function pixelate(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  area: Box,
  block: number,
  inside: (cx: number, cy: number) => boolean = () => true,
) {
  const b = Math.max(2, Math.round(block));
  const x0 = Math.max(0, Math.floor(area.x / b) * b);
  const y0 = Math.max(0, Math.floor(area.y / b) * b);
  const x1 = Math.min(width, area.x + area.w);
  const y1 = Math.min(height, area.y + area.h);

  for (let by = y0; by < y1; by += b) {
    for (let bx = x0; bx < x1; bx += b) {
      const ex = Math.min(bx + b, width);
      const ey = Math.min(by + b, height);
      if (!inside((bx + ex) / 2, (by + ey) / 2)) continue;

      let r = 0, g = 0, bl = 0, a = 0;
      const n = (ex - bx) * (ey - by);
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * width + x) * 4;
          r += data[i];
          g += data[i + 1];
          bl += data[i + 2];
          a += data[i + 3];
        }
      }
      [r, g, bl, a] = [r / n, g / n, bl / n, a / n];
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * width + x) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = bl;
          data[i + 3] = a;
        }
      }
    }
  }
}

// ---------- 去背景 ----------

export type Rgb = [number, number, number];

const MAX_DISTANCE = Math.sqrt(3 * 255 * 255);

/**
 * 统计四条边上的颜色，返回最主要的几种作为背景色（从多到少）。
 * 相近的颜色会合并；占边缘像素不到 5% 的颜色忽略（多半是主体碰到了边缘）。
 */
export function detectBackgroundColors(data: Uint8ClampedArray, width: number, height: number, max = 3): Rgb[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n++;
    buckets.set(key, bucket);
  };
  for (let x = 0; x < width; x++) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    add(0, y);
    add(width - 1, y);
  }
  const total = (width + height) * 2;
  const picked: { r: number; g: number; b: number; n: number }[] = [];
  for (const bucket of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const c = { r: bucket.r / bucket.n, g: bucket.g / bucket.n, b: bucket.b / bucket.n, n: bucket.n };
    const near = picked.find((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < 40);
    if (near) near.n += c.n;
    else picked.push(c);
  }
  const result = picked
    .sort((a, b) => b.n - a.n)
    .filter((c, i) => i === 0 || c.n / total >= 0.05)
    .slice(0, max);
  return result.map((c) => [Math.round(c.r), Math.round(c.g), Math.round(c.b)] as Rgb);
}

/** 边缘最主要的一种颜色 */
export const detectBackgroundColor = (data: Uint8ClampedArray, width: number, height: number): Rgb =>
  detectBackgroundColors(data, width, height, 1)[0];

export interface RemoveBackgroundOptions {
  /** 背景色，可以有多种；像素与其中任意一种接近就视为背景 */
  colors: Rgb[];
  /** 容差 0～100：颜色差距在这个范围内视为背景 */
  tolerance: number;
  /** 边缘柔化 0～100：在容差之外再留一段渐变，边缘更自然 */
  feather: number;
  /** 只去除相连的背景：从图片边缘和点击的位置出发扩散（避免把主体里相同颜色的部分也挖掉） */
  contiguous: boolean;
  /** 已有的透明度蒙版（如 AI 识别结果，0～255）；结果在它的基础上继续去除，扩散时也能穿过已透明的区域 */
  mask?: Uint8ClampedArray;
  /** 额外的扩散起点（像素序号 y × width + x），一般是用户点击的位置 */
  seeds?: number[];
  /** 预先算好的颜色距离（colorDistances 的结果），只调容差时不用重算 */
  distances?: Float32Array;
}

/**
 * 每个像素与最接近的那种背景色的距离的平方。
 * 传入 prev（已有颜色的结果）时只计算新增的颜色，原地更新 prev。
 */
export function colorDistances(data: Uint8ClampedArray, colors: Rgb[], prev?: Float32Array): Float32Array {
  const total = data.length >> 2;
  const out = prev ?? new Float32Array(total).fill(Infinity);
  for (const [cr, cg, cb] of colors) {
    for (let p = 0, i = 0; p < total; p++, i += 4) {
      const dr = data[i] - cr;
      const dg = data[i + 1] - cg;
      const db = data[i + 2] - cb;
      const d = dr * dr + dg * dg + db * db;
      if (d < out[p]) out[p] = d;
    }
  }
  return out;
}

/** 蒙版中低于这个值的像素视为已经透明，扩散时可以穿过 */
const CLEAR = 32;

/** 返回去掉背景后的像素（新数组），背景变为透明 */
export function removeBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  o: RemoveBackgroundOptions,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(data);
  const total = width * height;
  const mask = o.mask;
  if (mask) for (let p = 0; p < total; p++) out[p * 4 + 3] = (data[p * 4 + 3] * mask[p]) / 255;
  if (!o.colors.length) return out;

  const dist = o.distances ?? colorDistances(data, o.colors);
  const t = (o.tolerance / 100) * MAX_DISTANCE;
  const f = (o.feather / 100) * MAX_DISTANCE * 0.5;
  const t2 = t * t;
  const limit2 = (t + f) * (t + f);
  // 颜色越接近背景越透明；容差内全透明，柔化范围内渐变（只有这一段才需要开方）
  const apply = (p: number) => {
    const d2 = dist[p];
    if (d2 >= limit2) return;
    const a = d2 <= t2 ? 0 : ((Math.sqrt(d2) - t) / f) * 255;
    if (a < out[p * 4 + 3]) out[p * 4 + 3] = a;
  };

  if (!o.contiguous) {
    for (let p = 0; p < total; p++) apply(p);
    return out;
  }

  // 从四条边和点击的位置出发，扩散到颜色接近背景、或已经透明的相连像素
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  let top = 0;
  const push = (p: number) => {
    if (visited[p]) return;
    visited[p] = 1;
    if (dist[p] < limit2 || (mask && mask[p] < CLEAR)) stack[top++] = p;
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  for (const p of o.seeds ?? []) if (p >= 0 && p < total) push(p);
  while (top) {
    const p = stack[--top];
    apply(p);
    const x = p % width;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (p >= width) push(p - width);
    if (p < total - width) push(p + width);
  }
  return out;
}

// ---------- 水印 ----------

/** 九宫格位置：tl 左上、t 上、tr 右上、l 左、c 中、r 右、bl 左下、b 下、br 右下 */
export type Anchor = "tl" | "t" | "tr" | "l" | "c" | "r" | "bl" | "b" | "br";

/** 水印中心点坐标 */
export function anchorPosition(anchor: Anchor, image: Size, mark: Size, margin: number) {
  const col = anchor.endsWith("l") ? 0 : anchor.endsWith("r") ? 2 : 1;
  const row = anchor.startsWith("t") ? 0 : anchor.startsWith("b") ? 2 : 1;
  const xs = [margin + mark.width / 2, image.width / 2, image.width - margin - mark.width / 2];
  const ys = [margin + mark.height / 2, image.height / 2, image.height - margin - mark.height / 2];
  return { x: xs[col], y: ys[row] };
}

/** 将相对中心换算成图片坐标，旋转后的水印能放下时保持在图片内。 */
export function freeWatermarkPosition(position: { x: number; y: number }, image: Size, mark: Size, angle: number) {
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const halfWidth = Math.min(image.width, mark.width * cos + mark.height * sin) / 2;
  const halfHeight = Math.min(image.height, mark.width * sin + mark.height * cos) / 2;
  return {
    x: Math.min(image.width - halfWidth, Math.max(halfWidth, position.x * image.width)),
    y: Math.min(image.height - halfHeight, Math.max(halfHeight, position.y * image.height)),
  };
}

export interface WatermarkTile {
  x: number;
  y: number;
  odd: boolean;
}

/** 从参考水印向四周平铺，保留其交错行方向。 */
export function tilePositions(image: Size, mark: Size, spacing: number, origin?: WatermarkTile, angle = 0, bleed = 0): WatermarkTile[] {
  const stepX = mark.width + spacing;
  const stepY = mark.height + spacing;
  const reach = Math.hypot(image.width, image.height);
  const reference = origin ?? { x: image.width / 2 - reach, y: image.height / 2 - reach, odd: false };
  const parity = Number(reference.odd);
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  // 只枚举旋转后仍可能与画布相交的水印，阴影可额外留出边界。
  const padX = (mark.width * cos + mark.height * sin) / 2 + bleed;
  const padY = (mark.width * sin + mark.height * cos) / 2 + bleed;
  const points: WatermarkTile[] = [];
  const firstRow = Math.floor((-padY - reference.y) / stepY) + 1;
  const lastRow = Math.ceil((image.height + padY - reference.y) / stepY) - 1;
  for (let row = firstRow; row <= lastRow; row++) {
    const odd = (row + parity) & 1;
    const start = reference.x + ((odd - parity) * stepX) / 2;
    const firstColumn = Math.floor((-padX - start) / stepX) + 1;
    const lastColumn = Math.ceil((image.width + padX - start) / stepX) - 1;
    for (let col = firstColumn; col <= lastColumn; col++) {
      points.push({ x: start + col * stepX, y: reference.y + row * stepY, odd: !!odd });
    }
  }
  return points;
}

/** 旋转任意角度后，能完整容纳图片的画布尺寸 */
export function rotatedSize(width: number, height: number, degrees: number): Size {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  // 误差范围内取整，避免 90° 时出现 1 像素的偏差
  const round = (n: number) => Math.round(n - 1e-9);
  return { width: round(width * cos + height * sin), height: round(width * sin + height * cos) };
}
