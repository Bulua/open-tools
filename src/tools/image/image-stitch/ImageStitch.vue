<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronLeft, ChevronRight, Download, Focus, X } from "lucide-vue-next";
import ColorPicker from "@/components/common/ColorPicker.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import ZoomControls from "@/components/common/ZoomControls.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useFitFrame } from "@/composables/useFitFrame";
import { useZoomPan } from "@/composables/useZoomPan";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { saveFile } from "@/utils/saveFile";
import { showError } from "@/utils/errorToast";
import { IMAGE_FORMATS, canvasToBytes, formatInfo, loadImage, type ImageFormat } from "../shared/utils";
import { contentBounds, stitchLayout, type Box, type StitchDirection } from "../shared/effects";
import { snapBox, type Guides } from "../shared/snap";
import { longScreenshotLayout, toRowImage, type RowImage } from "./longshot";

/**
 * 图片拼接：多张图片横向、纵向、按宫格拼成一张，或自由摆放。
 * 在预览上拖动图片调整位置（自动排列时拖动会切换到自由摆放），拖动右下角缩放（保持比例）。
 * 拖动时对齐其他图片和画布的边缘、中线，显示参考线（按住 Alt 不吸附）；选中后方向键微调。
 * 滚轮放大预览、拖动空白处平移，方便精细调整。
 * 长截图：手机上连续截的多张图自动去掉重叠部分，状态栏、导航栏只保留一份（见 longshot.ts）。
 */
type Mode = StitchDirection | "free" | "long";
const { t } = useI18n();
const direction = useStoredRef<Mode>("stitch.direction", "vertical");
const columns = useStoredRef("stitch.columns", 2);
const unify = useStoredRef("stitch.unify", true);
const gap = useStoredRef("stitch.gap", 0);
const padding = useStoredRef("stitch.padding", 0);
const background = useStoredRef("stitch.background", "#ffffff");
const transparent = useStoredRef("stitch.transparent", false);
const format = useStoredRef<ImageFormat>("stitch.format", "image/png");
const quality = useStoredRef("stitch.quality", 90);

interface Item {
  id: number;
  name: string;
  url: string;
  img: HTMLImageElement;
}
const items = shallowRef<Item[]>([]);
let nextId = 1;
const dropZone = ref<InstanceType<typeof FileDropZone>>();

const addFiles = async (files: File[]) => {
  const loaded: Item[] = [];
  for (const file of files) {
    try {
      loaded.push({ id: nextId++, name: file.name, url: URL.createObjectURL(file), img: await loadImage(file) });
    } catch {
      // 读取失败的文件直接跳过
    }
  }
  items.value = [...items.value, ...loaded];
  if (direction.value === "free") placeMissing();
};
const remove = (item: Item) => {
  URL.revokeObjectURL(item.url);
  for (const key of rowCache.keys()) if (key.startsWith(`${item.id}:`)) rowCache.delete(key);
  items.value = items.value.filter((i) => i !== item);
  delete freeBoxes.value[item.id];
  selected.value = selected.value.filter((id) => id !== item.id);
};
const move = (index: number, step: -1 | 1) => {
  const list = [...items.value];
  const target = index + step;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  items.value = list;
};
onBeforeUnmount(() => items.value.forEach((i) => URL.revokeObjectURL(i.url)));

// ---------- 布局与绘制 ----------

/** 画布尺寸上限，超过时整体等比缩小（浏览器的 canvas 有大小限制） */
const MAX_SIDE = 16384;
const MAX_AREA = 100_000_000;

/** 自动排列（纵向 / 横向 / 宫格）的结果 */
const lastAuto = ref<StitchDirection>("vertical");
const autoLayout = computed(() => {
  const l = stitchLayout(
    items.value.map((i) => ({ width: i.img.naturalWidth, height: i.img.naturalHeight })),
    {
      direction: direction.value === "free" || direction.value === "long" ? lastAuto.value : direction.value,
      columns: columns.value,
      gap: gap.value,
      padding: padding.value,
      unify: unify.value,
    },
  );
  const scale = l.width ? Math.min(1, MAX_SIDE / l.width, MAX_SIDE / l.height, Math.sqrt(MAX_AREA / (l.width * l.height))) : 1;
  return { ...l, scale, outWidth: Math.round(l.width * scale), outHeight: Math.round(l.height * scale) };
});

// ---------- 长截图 ----------

/** 算行特征时把图缩到的宽度（分段数） */
const ROW_BINS = 64;
/** 每张图的行特征，按「图片 id:统一宽度」缓存 */
const rowCache = new Map<string, RowImage>();
/** 宽度不一样的截图按第一张的宽度等比缩放；返回缩放后的行特征 */
const rowImageOf = (item: Item, width: number): RowImage => {
  const key = `${item.id}:${width}`;
  let rows = rowCache.get(key);
  if (!rows) {
    const { naturalWidth: w, naturalHeight: h } = item.img;
    const height = Math.max(1, Math.round((h * width) / w));
    const c = document.createElement("canvas");
    c.width = ROW_BINS;
    c.height = height;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(item.img, 0, 0, ROW_BINS, height);
    rows = toRowImage(ctx.getImageData(0, 0, ROW_BINS, height).data, ROW_BINS, height);
    rowCache.set(key, rows);
  }
  return rows;
};
/** 长截图的拼法（按第一张图的宽度换算的像素），只在长截图模式下计算 */
const longLayout = computed(() => {
  if (direction.value !== "long" || !items.value.length) return null;
  const width = items.value[0].img.naturalWidth;
  return { width, ...longScreenshotLayout(items.value.map((i) => rowImageOf(i, width))) };
});
/** 没找到重叠、直接接在后面的图片序号（从 1 开始） */
const unmatched = computed(() => (longLayout.value?.matched ?? []).flatMap((m, i) => (m ? [] : [i + 1])));
// 没对上的图片有变化时在窗口上方提示一次；只改背景、边距等不影响结果时不会重复提示
watch(
  () => unmatched.value.join(", "),
  (n) => n && showError(t("image.longUnmatched", { n }), t("image.longUnmatchedTitle")),
);

// ---------- 自由摆放 ----------

/**
 * 每张图片的位置和大小（输出像素，可以是负数），z 越大越靠上。
 * 画布不固定大小：导出范围就是所有图片合起来的外框加上外边距，图片拖到哪里都不会被裁掉。
 */
const freeBoxes = ref<Record<number, Box & { z: number }>>({});
/** 选中的图片：单击选中一张，在空白处拖出方框选中多张 */
const selected = ref<number[]>([]);
const isSelected = (id: number) => selected.value.includes(id);
const topZ = () => Math.max(0, ...Object.values(freeBoxes.value).map((b) => b.z));
const placedBoxes = () => items.value.map((i) => freeBoxes.value[i.id]).filter(Boolean);

/** 自由摆放时的导出范围：所有图片的外框，四周加外边距 */
const freeRegion = (): Box => {
  const b = contentBounds(placedBoxes());
  const p = padding.value;
  return { x: b.x - p, y: b.y - p, w: b.w + p * 2, h: b.h + p * 2 };
};

/**
 * 自由摆放时预览显示的范围（画布坐标）。拖动期间保持不变，导出范围变大变小时预览不会跟着跳；
 * 切换到自由摆放、添加图片、点击缩放比例时才重新对准导出范围。
 */
const view = ref<Box>({ x: 0, y: 0, w: 1200, h: 800 });
const fitView = () => {
  const r = freeRegion();
  // 四周留一点空白，贴边的图片和虚线框也看得清
  const m = Math.max(r.w, r.h) * 0.04;
  if (r.w > 0 && r.h > 0) view.value = { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 };
  resetView();
};
/** 「全部显示」：所有图片放到预览中间，缩放到刚好都能看见 */
const showAll = () => (direction.value === "free" ? fitView() : resetView());

/** 从当前的自动排列开始，方便在此基础上微调；预览范围和自动排列时一样，画面不动 */
const initFree = () => {
  const l = autoLayout.value;
  freeBoxes.value = Object.fromEntries(
    items.value.map((item, i) => {
      const b = l.boxes[i];
      return [item.id, { x: b.x * l.scale, y: b.y * l.scale, w: b.w * l.scale, h: b.h * l.scale, z: i }];
    }),
  );
  view.value = { x: 0, y: 0, w: l.outWidth || 1200, h: l.outHeight || 800 };
};

/** 新加入的图片依次放在已有图片的右边，太大的缩小到和已有内容差不多大 */
const placeMissing = () => {
  const placed = placedBoxes();
  const b = placed.length ? contentBounds(placed) : { x: 0, y: 0, w: 0, h: 0 };
  const limit = Math.max(b.w, b.h, 1200);
  let x = placed.length ? b.x + b.w + 20 : 0;
  let added = false;
  for (const item of items.value) {
    if (freeBoxes.value[item.id]) continue;
    const { naturalWidth: w, naturalHeight: h } = item.img;
    const s = Math.min(1, limit / w, limit / h);
    freeBoxes.value[item.id] = { x, y: b.y, w: w * s, h: h * s, z: topZ() + 1 };
    x += w * s + 20;
    added = true;
  }
  if (added) fitView();
};

watch(direction, (mode) => mode !== "free" && mode !== "long" && (lastAuto.value = mode), { immediate: true });

/** 点击排列方式；切换到自由摆放时沿用之前摆好的位置，第一次时从自动排列开始 */
const setMode = (mode: Mode) => {
  if (mode === direction.value) return;
  direction.value = mode;
  if (mode === "free") {
    if (!placedBoxes().length) initFree();
    else placeMissing();
    fitView();
  } else resetView();
};

/** 恢复为之前自动排列的位置 */
const rearrange = () => {
  initFree();
  fitView();
};

/** 拖动时显示的参考线（画布像素） */
const guides = ref<Guides>({ x: [], y: [] });
const noGuides = () => (guides.value = { x: [], y: [] });
/** 吸附距离（屏幕像素），放大预览后同样好对准 */
const SNAP_PX = 6;

/** 自动排列时开始拖动：以当前排列为起点切换到自由摆放 */
const toFree = () => {
  if (direction.value === "free" || direction.value === "long") return;
  lastAuto.value = direction.value;
  direction.value = "free";
  initFree();
};

/** 图片当前显示的位置（画布坐标）：自由摆放时取摆放位置，自动排列时取排列结果 */
const shownBox = (id: number, index: number): Box | undefined => (direction.value === "free" ? freeBoxes.value[id] : layout.value.boxes[index]);

/** 预览框对应的范围（画布坐标）：自由摆放时是 view，自动排列时就是整张拼图 */
const viewBox = computed<Box>(() => (direction.value === "free" ? view.value : { x: 0, y: 0, w: layout.value.width, h: layout.value.height }));

const frameEl = ref<HTMLElement>();
/** 屏幕坐标换算成画布坐标 */
const toCanvas = (clientX: number, clientY: number) => {
  const r = frameEl.value!.getBoundingClientRect();
  const v = viewBox.value;
  return { x: v.x + ((clientX - r.left) / r.width) * v.w, y: v.y + ((clientY - r.top) / r.height) * v.h };
};

/** 画布坐标的方框在预览框里的位置（百分比，可以超出预览框） */
const place = (b: Box) => {
  const v = viewBox.value;
  return {
    left: `${((b.x - v.x) / v.w) * 100}%`,
    top: `${((b.y - v.y) / v.h) * 100}%`,
    width: `${(b.w / v.w) * 100}%`,
    height: `${(b.h / v.h) * 100}%`,
  };
};

/** 输入框里打字时不响应快捷键 */
const inField = (target: EventTarget | null) => !!(target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]");

/**
 * 拖动移动选中的图片（多张一起移动），或拖动右下角缩放（保持比例）。
 * 移动超过几个像素才算拖动：单击只改变选中，自动排列时也不会切换到自由摆放。
 */
const startDrag = (e: PointerEvent, item: Item, mode: "move" | "resize") => {
  // 按住空格时交给预览区域平移
  if (e.button !== 0 || spaceDown.value || !frameEl.value) return;
  e.stopPropagation();
  e.preventDefault();
  // 按在没选中的图片上只选它；按在已选中的图片上，所有选中的一起拖动
  const inGroup = isSelected(item.id) && selected.value.length > 1;
  if (!isSelected(item.id) || mode === "resize") selected.value = [item.id];

  const [sx, sy] = [e.clientX, e.clientY];
  let started = false;
  let moving: { box: Box & { z: number }; start: Box }[] = [];
  let scale = 1;
  const begin = () => {
    started = true;
    toFree();
    moving = items.value
      .filter((i) => isSelected(i.id))
      .map((i) => freeBoxes.value[i.id])
      .filter(Boolean)
      .map((box) => ({ box, start: { x: box.x, y: box.y, w: box.w, h: box.h } }));
    // 拖动的图片放到最上层，它们之间的上下顺序不变
    const z = topZ();
    [...moving].sort((m1, m2) => m1.box.z - m2.box.z).forEach((m, k) => (m.box.z = z + 1 + k));
    // 预览放大后 1 个屏幕像素对应的画布像素更少
    scale = viewBox.value.w / frameEl.value!.getBoundingClientRect().width;
  };

  const onMove = (ev: PointerEvent) => {
    if (!started) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) <= 3) return;
      begin();
    }
    if (!moving.length) return;
    const dx = (ev.clientX - sx) * scale;
    const dy = (ev.clientY - sy) * scale;
    if (mode === "resize") {
      const { box, start } = moving[0];
      const ratio = start.h / start.w;
      box.w = Math.max(20, start.w + Math.max(dx, dy / ratio));
      box.h = box.w * ratio;
      return;
    }
    // 多张一起移动时，按它们合起来的外框对齐
    const g = contentBounds(moving.map((m) => m.start));
    let x = g.x + dx;
    let y = g.y + dy;
    if (ev.altKey) noGuides();
    else {
      const others = items.value.filter((i) => !isSelected(i.id)).map((i) => freeBoxes.value[i.id]).filter(Boolean);
      const s = snapBox({ x, y, w: g.w, h: g.h }, others, SNAP_PX * scale);
      ({ x, y } = s);
      guides.value = s.guides;
    }
    for (const m of moving) {
      m.box.x = m.start.x + x - g.x;
      m.box.y = m.start.y + y - g.y;
    }
  };
  const onUp = () => {
    noGuides();
    // 单击已选中的多张中的一张（没有拖动）：只选它
    if (!started && inGroup) selected.value = [item.id];
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
};

/** 方向键微调选中的图片，按住 Shift 一次移动 10 像素 */
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
useWindowEvent("keydown", (e) => {
  const step = ARROWS[e.key];
  if (!step || !selected.value.length || inField(e.target)) return;
  e.preventDefault();
  toFree();
  const n = e.shiftKey ? 10 : 1;
  for (const id of selected.value) {
    const b = freeBoxes.value[id];
    if (!b) continue;
    b.x += step[0] * n;
    b.y += step[1] * n;
  }
});

/** 按住空格拖动预览平移（和常见的设计软件一样），空白处直接拖动是框选 */
const spaceDown = ref(false);
useWindowEvent("keydown", (e) => {
  if (e.code !== "Space" || !items.value.length || inField(e.target)) return;
  e.preventDefault();
  spaceDown.value = true;
});
useWindowEvent("keyup", (e) => e.code === "Space" && (spaceDown.value = false));
useWindowEvent("blur", () => (spaceDown.value = false));

/** 在空白处拖出的选框（画布坐标） */
const marquee = ref<Box | null>(null);
let marqueeDrag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;

const onAreaDown = (e: PointerEvent) => {
  if (e.button !== 0 || !frameEl.value) return;
  // 长截图不能单独选中、移动某张图，拖动直接平移预览
  if (spaceDown.value || direction.value === "long") return onDown(e);
  const p = toCanvas(e.clientX, e.clientY);
  marqueeDrag = { ...p, sx: e.clientX, sy: e.clientY, moved: false };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
};

const onAreaMove = (e: PointerEvent) => {
  if (onPanMove(e)) return;
  const d = marqueeDrag;
  if (!d || (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) <= 3)) return;
  d.moved = true;
  const p = toCanvas(e.clientX, e.clientY);
  const m = { x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), w: Math.abs(p.x - d.x), h: Math.abs(p.y - d.y) };
  marquee.value = m;
  // 和选框有重叠的图片都选中
  const hit = items.value
    .filter((item, i) => {
      const b = shownBox(item.id, i);
      return b && b.x < m.x + m.w && b.x + b.w > m.x && b.y < m.y + m.h && b.y + b.h > m.y;
    })
    .map((i) => i.id);
  selected.value = hit;
};

const onAreaUp = () => {
  onPanUp();
  const d = marqueeDrag;
  marqueeDrag = null;
  marquee.value = null;
  // 单击空白处：取消选中
  if (d && !d.moved) selected.value = [];
};

/** 图片框在预览上的位置（百分比，跟随预览缩放） */
const boxStyle = (id: number, index: number) => {
  const b = shownBox(id, index);
  if (!b) return {};
  return { ...place(b), zIndex: direction.value === "free" ? freeBoxes.value[id].z + 1 : 1 };
};

/** 1 个物理像素的线宽：不随预览放大变粗，高分屏上也是最细的线 */
const hairline = () => `${1 / (zoom.value * (window.devicePixelRatio || 1))}px`;

/** 参考线的位置（百分比），长度贯穿整个预览区域 */
const guideStyle = (axis: "x" | "y", value: number) => {
  const v = viewBox.value;
  return axis === "x" ? { left: `${((value - v.x) / v.w) * 100}%`, width: hairline() } : { top: `${((value - v.y) / v.h) * 100}%`, height: hairline() };
};

const marqueeStyle = (m: Box) => ({ ...place(m), borderWidth: `${1 / zoom.value}px` });

// ---------- 最终布局 ----------
/** 按画布尺寸上限算出的缩放比例 */
const fitScale = (w: number, h: number) => (w > 0 && h > 0 ? Math.min(1, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_AREA / (w * h))) : 1);

const layout = computed(() => {
  const long = longLayout.value;
  if (long) {
    const scale = fitScale(long.width, long.height);
    return {
      width: long.width,
      height: long.height,
      origin: { x: 0, y: 0 },
      boxes: [] as Box[],
      scale,
      outWidth: Math.max(1, Math.round(long.width * scale)),
      outHeight: Math.max(1, Math.round(long.height * scale)),
    };
  }
  if (direction.value !== "free") return { ...autoLayout.value, origin: { x: 0, y: 0 } };
  // 导出范围跟随内容；太大时和自动排列一样整体等比缩小
  const r = freeRegion();
  const scale = fitScale(r.w, r.h);
  return {
    width: r.w,
    height: r.h,
    origin: { x: r.x, y: r.y },
    boxes: items.value.map((i) => {
      const b = freeBoxes.value[i.id] ?? { x: 0, y: 0, w: 0, h: 0 };
      return { x: b.x - r.x, y: b.y - r.y, w: b.w, h: b.h };
    }),
    scale,
    outWidth: Math.max(1, Math.round(r.w * scale)),
    outHeight: Math.max(1, Math.round(r.h * scale)),
  };
});

const canvas = ref<HTMLCanvasElement>();
/** 拼好的图在预览框里的位置：自由摆放时就是导出范围，自动排列时填满预览框 */
const canvasStyle = computed(() => {
  if (direction.value !== "free") return {};
  const l = layout.value;
  return { position: "absolute" as const, ...place({ x: l.origin.x, y: l.origin.y, w: l.width, h: l.height }) };
});
const outSize = computed(() => (items.value.length ? { width: viewBox.value.w, height: viewBox.value.h } : null));
const { observeArea, frameStyle } = useFitFrame(outSize);
// 滚轮缩放预览（可以缩到比区域小，方便把图片拖到画布边上），按住空格拖动平移
const { MIN_ZOOM, MAX_ZOOM, zoom, panning, style: zoomStyle, reset: resetView, zoomAt, onWheel, onDown, onMove: onPanMove, onUp: onPanUp } = useZoomPan({ min: 0.1 });

const draw = async () => {
  await nextTick();
  const c = canvas.value;
  const l = layout.value;
  if (!c || !items.value.length) return;
  c.width = l.outWidth;
  c.height = l.outHeight;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  if (!transparent.value) {
    ctx.fillStyle = background.value;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.imageSmoothingQuality = "high";
  const long = longLayout.value;
  if (long) {
    // 每段从原图裁出对应的行；行号是按第一张的宽度换算的，画的时候换回原图像素
    for (const s of long.segments) {
      const img = items.value[s.index].img;
      const k = img.naturalWidth / long.width;
      ctx.drawImage(img, 0, s.sy * k, img.naturalWidth, s.sh * k, 0, s.dy * l.scale, l.outWidth, s.sh * l.scale);
    }
    return;
  }
  // 自由模式按 z 从下到上画，其他模式按列表顺序
  const order = items.value.map((item, i) => ({ item, box: l.boxes[i], z: freeBoxes.value[item.id]?.z ?? i }));
  if (direction.value === "free") order.sort((a, b) => a.z - b.z);
  for (const { item, box: b } of order) {
    ctx.drawImage(item.img, b.x * l.scale, b.y * l.scale, b.w * l.scale, b.h * l.scale);
  }
};
watch([items, layout, background, transparent], draw);
// 自由模式下拖动只改变某张图片的坐标，需要深度监听才能重画
watch(freeBoxes, draw, { deep: true });

// ---------- 导出 ----------

const saved = ref(false);
const download = async () => {
  if (!canvas.value) return;
  const bytes = await canvasToBytes(canvas.value, format.value, quality.value / 100);
  if (await saveFile(bytes, `${t("image.stitchName")}.${formatInfo(format.value).ext}`)) {
    saved.value = true;
    setTimeout(() => (saved.value = false), 1500);
  }
};

const DIRECTIONS = computed<{ value: Mode; label: string; title?: string }[]>(() => [
  { value: "vertical", label: t("image.vertical") },
  { value: "horizontal", label: t("image.horizontal") },
  { value: "grid", label: t("image.grid") },
  { value: "free", label: t("image.free") },
  { value: "long", label: t("image.longShot"), title: t("image.longShotTitle") },
]);
const toNumber = (e: Event, max: number) => Math.min(max, Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)));
</script>

<template>
  <div class="stitch">
    <!-- 左：设置 -->
    <aside class="card settings">
      <div class="card-title">{{ t("image.stitchSettings") }}</div>

      <section class="section">
        <h3>{{ t("image.layout") }}</h3>
        <div class="seg fill modes">
          <button v-for="d in DIRECTIONS" :key="d.value" :class="{ on: direction === d.value }" :title="d.title" @click="setMode(d.value)">
            {{ d.label }}
          </button>
        </div>
        <label v-if="direction === 'grid'" class="row">
          <span>{{ t("image.perRow") }}</span>
          <input class="field small" type="number" min="1" max="10" :value="columns" @change="columns = Math.max(1, toNumber($event, 10))" />
          <span>{{ t("image.perRowUnit") }}</span>
        </label>
        <template v-if="direction === 'long'">
          <p class="tip">{{ t("image.longTip") }}</p>
        </template>
        <label v-else-if="direction !== 'free'" class="check">
          <input v-model="unify" type="checkbox" />{{ direction === "horizontal" ? t("image.unifyHeight") : t("image.unifyWidth") }}
        </label>
        <template v-else>
          <div class="row">
            <button class="btn small subtle" :title="t('image.rearrangeTitle')" @click="rearrange">{{ t("image.rearrange") }}</button>
          </div>
          <p class="tip">{{ t("image.freeTip") }}</p>
        </template>
      </section>

      <section v-if="direction !== 'long'" class="section">
        <h3>{{ t("image.spacing") }}</h3>
        <div class="row">
          <template v-if="direction !== 'free'">
            <span>{{ t("image.between") }}</span>
            <input class="field small" type="number" min="0" :value="gap" @change="gap = toNumber($event, 500)" />
          </template>
          <span>{{ t("image.padding") }}</span>
          <input class="field small" type="number" min="0" :value="padding" @change="padding = toNumber($event, 500)" />
        </div>
      </section>

      <section v-if="direction !== 'long'" class="section">
        <h3>{{ t("image.background") }}</h3>
        <div class="row">
          <ColorPicker v-model="background" :disabled="transparent" />
          <span class="mono">{{ transparent ? t("image.transparent") : background }}</span>
          <label class="check push"><input v-model="transparent" type="checkbox" />{{ t("image.transparent") }}</label>
        </div>
      </section>

      <section class="section">
        <h3>{{ t("image.export") }}</h3>
        <div class="seg fill">
          <button v-for="f in IMAGE_FORMATS" :key="f.value" :class="{ on: format === f.value }" @click="format = f.value">
            {{ f.label }}
          </button>
        </div>
        <label v-if="formatInfo(format).lossy" class="slider">
          <span>{{ t("image.quality") }}</span>
          <input v-model.number="quality" type="range" min="10" max="100" step="5" />
          <em>{{ quality }}%</em>
        </label>
        <p v-if="items.length" class="tip">
          {{ t("image.outputSize", { w: layout.outWidth, h: layout.outHeight }) }}
          <template v-if="layout.scale < 1">{{ t("image.scaledDown") }}</template>
          <template v-if="transparent && format === 'image/jpeg'"><br />{{ t("image.jpgNoAlpha") }}</template>
        </p>
        <button class="btn primary full" :disabled="!items.length" @click="download">
          <Download :size="14" />{{ saved ? t("image.saved") : t("image.downloadStitched") }}
        </button>
      </section>
    </aside>

    <!-- 右：预览 + 图片顺序 -->
    <section class="card main">
      <FileDropZone
        v-if="!items.length"
        ref="dropZone"
        class="drop"
        accept="image/*"
        multiple
        :title="t('image.dropMany')"
        :hint="t('image.stitchDropHint')"
        @files="addFiles"
      />

      <template v-else>
        <div class="card-title">
          {{ t("image.preview") }}
          <span class="hint">{{ direction === "free" ? t("image.freeHint") : direction === "long" ? t("image.longHint") : t("image.dragToFree") }}</span>
          <button class="btn small subtle" :title="t('image.showAllTitle')" @click="showAll"><Focus :size="14" />{{ t("image.showAll") }}</button>
          <ZoomControls :zoom="zoom" :min="MIN_ZOOM" :max="MAX_ZOOM" @zoom="zoomAt" @reset="showAll" />
        </div>
        <div
          :ref="observeArea"
          class="area checker"
          :class="{ panning, grab: spaceDown }"
          @wheel.prevent="onWheel"
          @pointerdown="onAreaDown"
          @pointermove="onAreaMove"
          @pointerup="onAreaUp"
          @pointercancel="onAreaUp"
        >
          <div ref="frameEl" class="frame" :style="[frameStyle, zoomStyle]">
            <canvas ref="canvas" :class="{ region: direction === 'free' }" :style="canvasStyle" />
            <!-- 每张图片上覆盖一个可拖动的框；自动排列时拖动会切换到自由摆放 -->
            <div
              v-for="(item, i) in direction === 'long' ? [] : items"
              :key="item.id"
              class="free-box"
              :class="{ selected: isSelected(item.id) }"
              :style="boxStyle(item.id, i)"
              :title="item.name"
              @pointerdown="startDrag($event, item, 'move')"
            >
              <span v-if="direction === 'free' && selected.length === 1 && isSelected(item.id)" class="handle" :title="t('image.dragResize')" @pointerdown.stop="startDrag($event, item, 'resize')" />
            </div>
            <!-- 对齐参考线 -->
            <i v-for="x in guides.x" :key="'x' + x" class="guide v" :style="guideStyle('x', x)" />
            <i v-for="y in guides.y" :key="'y' + y" class="guide h" :style="guideStyle('y', y)" />
            <div v-if="marquee" class="marquee" :style="marqueeStyle(marquee)" />
          </div>
        </div>

        <!-- 图片顺序：左右移动、移除、继续添加 -->
        <div class="strip">
          <figure v-for="(item, i) in items" :key="item.id" class="thumb">
            <img :src="item.url" :alt="item.name" :title="item.name" />
            <span class="index">{{ i + 1 }}</span>
            <div class="thumb-actions">
              <button v-if="direction !== 'free'" :title="t('image.moveForward')" :disabled="i === 0" @click="move(i, -1)"><ChevronLeft :size="12" /></button>
              <button :title="t('image.remove')" @click="remove(item)"><X :size="12" /></button>
              <button v-if="direction !== 'free'" :title="t('image.moveBack')" :disabled="i === items.length - 1" @click="move(i, 1)"><ChevronRight :size="12" /></button>
            </div>
          </figure>
          <FileDropZone ref="dropZone" compact class="add" accept="image/*" multiple title="" :aria-label="t('image.addImages')" @files="addFiles" />
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.stitch {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  gap: 14px;
}

/* ---------- 左侧设置 ---------- */
.settings {
  overflow-y: auto;
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
}
.field.small {
  width: 56px;
  height: 28px;
  padding: 0 6px;
  font-size: 12px;
}
.field.small.wide {
  width: 72px;
}

/* 自由模式下可拖动的图片框 */
.free-box {
  position: absolute;
  cursor: move;
  touch-action: none;
}
.free-box:hover {
  outline: 1px dashed rgba(201, 100, 66, 0.7);
}
.free-box.selected {
  outline: 2px solid var(--accent);
}
.handle {
  position: absolute;
  right: -7px;
  bottom: -7px;
  width: 14px;
  height: 14px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: var(--shadow);
  cursor: nwse-resize;
  opacity: 0;
}
.free-box:hover .handle,
.free-box.selected .handle {
  opacity: 1;
}
.mono {
  font-family: var(--font-mono);
}
.push {
  margin-left: auto;
}
/* 五种排列方式放在一行，按钮收窄一些 */
.modes button {
  padding: 0 4px;
}
.tip {
  line-height: 1.6;
}

/* ---------- 右侧预览 ---------- */
.main {
  min-height: 420px;
}
.drop {
  margin: 12px;
}
.area {
  position: relative;
  flex: 1;
  min-height: 200px;
  margin: 12px 12px 0;
  border-radius: 8px;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}
.area.grab,
.area.grab .free-box {
  cursor: grab;
}
.area.panning {
  cursor: grabbing;
}
/* 框选时拖出的方框 */
.marquee {
  position: absolute;
  z-index: 100000;
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  pointer-events: none;
}
.card-title .hint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
  color: var(--text-3);
}
/* 对齐参考线：图片可以拖到预览框外，线也延伸到外面，贯穿整个预览区域 */
.guide {
  position: absolute;
  z-index: 100000;
  background: var(--guide);
  pointer-events: none;
}
.guide.v {
  top: -1000%;
  bottom: -1000%;
}
.guide.h {
  left: -1000%;
  right: -1000%;
}
/* 自由摆放时标出导出范围（透明背景时也看得出边界） */
.frame canvas.region {
  outline: 1px dashed var(--border-strong);
}
.frame {
  position: absolute;
  inset: 0;
  margin: auto;
}
.frame canvas {
  display: block;
  width: 100%;
  height: 100%;
  box-shadow: var(--shadow);
}
.checker {
  background-color: var(--bg);
  background-image:
    linear-gradient(45deg, var(--active) 25%, transparent 25%),
    linear-gradient(-45deg, var(--active) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--active) 75%),
    linear-gradient(-45deg, transparent 75%, var(--active) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}

.strip {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  padding: 12px;
  overflow-x: auto;
}
.thumb {
  position: relative;
  flex-shrink: 0;
  width: 84px;
  height: 84px;
  margin: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.index {
  position: absolute;
  left: 4px;
  top: 4px;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
.thumb-actions {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  padding: 3px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.5));
  opacity: 0;
  transition: opacity 0.15s;
}
.thumb:hover .thumb-actions {
  opacity: 1;
}
.thumb-actions button {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.9);
  color: #141413;
}
.thumb-actions button:disabled {
  opacity: 0.35;
}
.add {
  flex: 0 0 84px;
  min-height: 84px;
  padding: 0;
  justify-content: center;
}
</style>
