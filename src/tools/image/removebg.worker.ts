import { colorDistances, removeBackground, type Rgb } from "./effects";

/**
 * 在后台线程按颜色去背景，大图计算时界面也不会卡住。
 * 原图和 AI 蒙版只传一次；颜色距离会缓存，追加颜色时只计算新的那一种，调容差、柔化时不用重算。
 */
type Request =
  | { type: "image"; data: Uint8ClampedArray; width: number; height: number }
  | { type: "mask"; mask: Uint8ClampedArray | null }
  | { type: "run"; id: number; colors: Rgb[]; seeds: number[]; tolerance: number; feather: number; contiguous: boolean };

let image: { data: Uint8ClampedArray; width: number; height: number } | null = null;
let mask: Uint8ClampedArray | null = null;
/** 已经算过距离的颜色，与 distances 对应 */
let cachedColors: Rgb[] = [];
let distances: Float32Array | null = null;

const sameColor = (a: Rgb, b: Rgb) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

function distancesFor(colors: Rgb[]) {
  const data = image!.data;
  const extends_ = distances && cachedColors.length <= colors.length && cachedColors.every((c, i) => sameColor(c, colors[i]));
  if (extends_) colorDistances(data, colors.slice(cachedColors.length), distances!);
  else distances = colorDistances(data, colors);
  cachedColors = colors;
  return distances!;
}

self.onmessage = (e: MessageEvent<Request>) => {
  const req = e.data;
  if (req.type === "image") {
    image = { data: req.data, width: req.width, height: req.height };
    mask = null;
    cachedColors = [];
    distances = null;
    return;
  }
  if (req.type === "mask") {
    mask = req.mask;
    return;
  }
  if (!image) return;
  const { data, width, height } = image;
  const pixels = removeBackground(data, width, height, {
    colors: req.colors,
    tolerance: req.tolerance,
    feather: req.feather,
    contiguous: req.contiguous,
    mask: mask ?? undefined,
    seeds: req.seeds,
    distances: req.colors.length ? distancesFor(req.colors) : undefined,
  });
  self.postMessage({ id: req.id, pixels }, { transfer: [pixels.buffer] });
};
