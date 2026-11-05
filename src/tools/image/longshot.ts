/**
 * 长截图拼接：把手机上连续滚动截下的多张图拼成一张，去掉相邻两张重叠的部分，
 * 顶部状态栏、底部导航栏这类每张都一样的固定区域只保留一份。
 *
 * 不直接比较原图像素，而是把每一行缩成若干段的平均亮度（行特征）再比较：
 * 计算量小，对 JPG 压缩的细小差别也不敏感。
 */

/** 一张图的行特征：rows[y * bins + i] 是第 y 行第 i 段的平均亮度（0~255） */
export interface RowImage {
  height: number;
  bins: number;
  rows: Float32Array;
}

/** 输出里的一段：取第 index 张图的 [sy, sy + sh) 行，画到输出的 dy 处 */
export interface LongSegment {
  index: number;
  sy: number;
  sh: number;
  dy: number;
}

export interface LongLayout {
  height: number;
  segments: LongSegment[];
  /** 第 k 张和上一张有没有找到重叠（第 0 张总是 true）；没找到时直接接在后面 */
  matched: boolean[];
}

/**
 * 从 RGBA 像素算出行特征。像素的宽度就是分段数：调用方先把图缩到很窄（例如 64 像素宽）再取像素，
 * 每一列就是原图一段的平均颜色。
 */
export function toRowImage(data: Uint8ClampedArray, width: number, height: number): RowImage {
  const rows = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const o = p * 4;
    rows[p] = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
  }
  return { height, bins: width, rows };
}

/** 两行的平均差（每段亮度差的平均） */
function rowDiff(a: RowImage, ya: number, b: RowImage, yb: number): number {
  const n = a.bins;
  const oa = ya * n;
  const ob = yb * n;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a.rows[oa + i] - b.rows[ob + i]);
  return sum / n;
}

/**
 * 两行看作同一行：只有少数几段不同也算。状态栏里的时间、电量每张截图都可能不一样，
 * 只占很窄的几段，不能因此认不出状态栏。
 */
function sameRow(a: RowImage, ya: number, b: RowImage, yb: number): boolean {
  const n = a.bins;
  const oa = ya * n;
  const ob = yb * n;
  let differ = 0;
  for (let i = 0; i < n; i++) if (Math.abs(a.rows[oa + i] - b.rows[ob + i]) > 16) differ++;
  return differ <= n / 6;
}

/** 一行有没有内容：左右亮度有起伏（纯色的空白行用来对齐不可靠） */
function hasDetail(img: RowImage, y: number): boolean {
  const n = img.bins;
  const o = y * n;
  let sum = 0;
  for (let i = 1; i < n; i++) sum += Math.abs(img.rows[o + i] - img.rows[o + i - 1]);
  return sum / (n - 1) > 1.5;
}

/** 固定区域最多占图片高度的比例 */
const MAX_FIXED = 1 / 3;
/** 判断重叠时最多比较的行数（均匀抽取），图片很高时也不会太慢 */
const MAX_SAMPLES = 160;
/** 重叠部分里至少要有这么多行有内容才可信 */
const MIN_DETAIL_ROWS = 6;
/** 平均差小于这个值算对上了 */
const MATCH_THRESHOLD = 4;

/** 所有相邻两张从顶部（或底部）开始相同的行数，取最小值 */
function fixedRows(images: RowImage[], fromBottom: boolean): number {
  const limit = Math.floor(Math.min(...images.map((i) => i.height)) * MAX_FIXED);
  let result = limit;
  for (let k = 1; k < images.length && result > 0; k++) {
    const a = images[k - 1];
    const b = images[k];
    let n = 0;
    while (n < result) {
      const ya = fromBottom ? a.height - 1 - n : n;
      const yb = fromBottom ? b.height - 1 - n : n;
      if (!sameRow(a, ya, b, yb)) break;
      n++;
    }
    result = n;
  }
  return result;
}

/**
 * 找 b 相对 a 滚动了多少行：b 中间区域的第 top + i 行对上 a 的第 top + d + i 行。
 * 返回 d，找不到返回 -1。区域是 [top, height - bottom)。
 */
function findScroll(a: RowImage, b: RowImage, top: number, bottom: number): number {
  const lenA = a.height - top - bottom;
  const lenB = b.height - top - bottom;
  if (lenA <= 0 || lenB <= 0) return -1;
  // 只用 b 里有内容的行来比较
  const detail: number[] = [];
  for (let i = 0; i < lenB; i++) if (hasDetail(b, top + i)) detail.push(i);
  if (detail.length < MIN_DETAIL_ROWS) return -1;

  const minOverlap = Math.max(8, Math.round(lenB * 0.03));
  let best = -1;
  let bestScore = MATCH_THRESHOLD;
  for (let d = 0; d <= lenA - minOverlap; d++) {
    const overlap = Math.min(lenA - d, lenB);
    // detail 是递增的，取出落在重叠范围里的那些
    let count = 0;
    while (count < detail.length && detail[count] < overlap) count++;
    if (count < MIN_DETAIL_ROWS) continue;
    const step = Math.max(1, count / MAX_SAMPLES);
    const samples = Math.floor(count / step);
    // 累计的差已经超过目前最好的结果就不用再算了
    const limit = bestScore * samples;
    let sum = 0;
    for (let s = 0; s < samples && sum < limit; s++) {
      const i = detail[Math.floor(s * step)];
      sum += rowDiff(a, top + d + i, b, top + i);
    }
    const score = sum / samples;
    // 一样好时保留滚动距离小的（重叠多的）
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/**
 * 计算长截图的拼法。图片的宽度要先统一（行特征的高度按统一后的宽度换算），
 * 返回的行号、高度都是统一宽度后的像素。
 */
export function longScreenshotLayout(images: RowImage[]): LongLayout {
  if (!images.length) return { height: 0, segments: [], matched: [] };
  if (images.length === 1) {
    return { height: images[0].height, segments: [{ index: 0, sy: 0, sh: images[0].height, dy: 0 }], matched: [true] };
  }
  const top = fixedRows(images, false);
  const bottom = fixedRows(images, true);

  const first = images[0];
  const segments: LongSegment[] = [{ index: 0, sy: 0, sh: first.height - bottom, dy: 0 }];
  const matched = [true];
  /** 已经画到的输出高度 */
  let end = first.height - bottom;
  /** 上一张中间区域的第一行在输出里的位置 */
  let prevPos = top;

  for (let k = 1; k < images.length; k++) {
    const img = images[k];
    const d = findScroll(images[k - 1], img, top, bottom);
    matched.push(d >= 0);
    // 找不到重叠时直接接在已画内容的后面
    const pos = d >= 0 ? prevPos + d : end;
    const regionEnd = pos + img.height - top - bottom;
    const start = Math.max(end, pos);
    if (regionEnd > start) {
      segments.push({ index: k, sy: top + (start - pos), sh: regionEnd - start, dy: start });
      end = regionEnd;
    }
    prevPos = pos;
  }

  // 底部固定区域取最后一张
  const last = images.length - 1;
  if (bottom > 0) segments.push({ index: last, sy: images[last].height - bottom, sh: bottom, dy: end });
  return { height: end + bottom, segments, matched };
}
