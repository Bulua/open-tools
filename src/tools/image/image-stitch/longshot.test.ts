import { describe, expect, it } from "vitest";
import { longScreenshotLayout, toRowImage, type LongLayout, type RowImage } from "./longshot";

const BINS = 32;

/** 固定种子的随机数，测试结果每次一样 */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** 生成若干行：有内容的行每段亮度随机，blank 范围内是纯白 */
function makeRows(count: number, seed: number, blank: [number, number][] = []): number[][] {
  const rand = random(seed);
  return Array.from({ length: count }, (_, y) =>
    blank.some(([s, e]) => y >= s && y < e) ? Array(BINS).fill(255) : Array.from({ length: BINS }, () => Math.round(rand() * 255)),
  );
}

function toImage(rows: number[][]): RowImage {
  return { height: rows.length, bins: BINS, rows: Float32Array.from(rows.flat()) };
}

/** 状态栏：时间每张不一样（只改动开头两段） */
const statusBar = (minute: number) => makeRows(40, 7).map((r) => [minute * 20, minute * 20, ...r.slice(2)]);
const navBar = makeRows(60, 11);

/** 模拟在页面上滚动到 offset 处截一张图：状态栏 + 页面可见部分 + 导航栏 */
function screenshot(page: number[][], offset: number, view: number, minute = 0) {
  return [...statusBar(minute), ...page.slice(offset, offset + view), ...navBar];
}

/** 按拼法把输出的每一行还原出来 */
function render(layout: LongLayout, shots: number[][][]) {
  const out: number[][] = Array(layout.height);
  for (const s of layout.segments) for (let i = 0; i < s.sh; i++) out[s.dy + i] = shots[s.index][s.sy + i];
  return out;
}

describe("longScreenshotLayout", () => {
  const page = makeRows(2400, 1, [[900, 1000]]);
  const VIEW = 600;

  it("去掉重叠部分，状态栏和导航栏只保留一份", () => {
    const offsets = [0, 350, 820, 1300];
    const shots = offsets.map((o, i) => screenshot(page, o, VIEW, i));
    const layout = longScreenshotLayout(shots.map(toImage));
    expect(layout.matched).toEqual([true, true, true, true]);
    expect(render(layout, shots)).toEqual([...statusBar(0), ...page.slice(0, 1300 + VIEW), ...navBar]);
  });

  it("重复的截图不会多拼一次", () => {
    const shots = [screenshot(page, 0, VIEW), screenshot(page, 0, VIEW, 1), screenshot(page, 400, VIEW)];
    const layout = longScreenshotLayout(shots.map(toImage));
    expect(render(layout, shots)).toEqual([...statusBar(0), ...page.slice(0, 400 + VIEW), ...navBar]);
  });

  it("没有重叠时直接接在后面", () => {
    const shots = [screenshot(page, 0, VIEW), screenshot(page, 1500, VIEW)];
    const layout = longScreenshotLayout(shots.map(toImage));
    expect(layout.matched).toEqual([true, false]);
    expect(render(layout, shots)).toEqual([...statusBar(0), ...page.slice(0, VIEW), ...page.slice(1500, 1500 + VIEW), ...navBar]);
  });

  it("只有一张时原样输出", () => {
    const layout = longScreenshotLayout([toImage(screenshot(page, 0, VIEW))]);
    expect(layout.segments).toEqual([{ index: 0, sy: 0, sh: 40 + VIEW + 60, dy: 0 }]);
  });
});

describe("toRowImage", () => {
  it("每个像素换算成亮度", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const img = toRowImage(data, 2, 1);
    expect(img.bins).toBe(2);
    expect(img.rows[0]).toBeCloseTo(255);
    expect(img.rows[1]).toBe(0);
  });
});
