<script setup lang="ts">
import { recordToolUsage } from "@/composables/toolLibrary";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  ArrowUpRight,
  Check,
  Clipboard,
  Crop,
  Grid3x3,
  Minus,
  MousePointer2,
  Pencil,
  Pin,
  Redo2,
  RotateCw,
  Save,
  Square,
  Type,
  Undo2,
  X,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { bytesToBase64 } from "../screenshot";
import { clientRectToDesktop, desktopRectToClient, resizeHandleAt, resizeSelection, selectionHandles, windowAt, type ResizeHandle } from "../screenshotSelection";
import { hitMark, markBounds, markCenter, markControlBounds, markHandleAt, markHandles, markWorldBounds, markWorldPoint, moveMark, resizeMark, rotateMark, textFontSize, textLineHeight, type MarkHandle, type ScreenshotMark } from "../screenshotAnnotations";

type Tool = "select" | "pen" | "line" | "arrow" | "rect" | "text" | "mosaic";
type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Mark = ScreenshotMark;

const props = defineProps<{ draftId: string }>();
const activeDraftId = ref(props.draftId);
let unlisten: UnlistenFn | undefined;
let loadedDraftId = "";
const { t } = useI18n();
const canvas = ref<HTMLCanvasElement>();
const image = new Image();
const ready = ref(false);
const selection = ref<Rect>();
const hovered = ref<Rect>();
let windowRects: Rect[] = [];
let resizing: { handle: ResizeHandle; rect: Rect } | undefined;
let picking = false;
let candidate: Rect | undefined;
const cursor = ref("crosshair");
const tool = ref<Tool>("select");
const color = ref("#ff3b30");
const strokeWidth = ref(3);
const marks = ref<Mark[]>([]);
const undoStack = ref<Mark[][]>([]);
const redo = ref<Mark[][]>([]);
const selectedMark = ref<number>();
let moving: { index: number; original: Mark; bounds: Rect; recorded: boolean } | undefined;
let scaling: { index: number; original: Mark; handle: MarkHandle; recorded: boolean } | undefined;
let rotating: { index: number; original: Mark; recorded: boolean } | undefined;
const editor = ref<{ point: Point; text: string; color: string; width: number; fontSize?: number; rotation?: number; index?: number }>();
const textInput = ref<HTMLTextAreaElement>();
const drawing = ref<Mark>();
const start = ref<Point>();
const busy = ref(false);
const viewportWidth = ref(window.innerWidth);
const viewportHeight = ref(window.innerHeight);
const physicalViewport = ref<Rect>({ x: 0, y: 0, w: 1, h: 1 });

function snapshot(): Mark[] {
  return marks.value.map((mark) => ({ ...mark, points: mark.points.map((point) => ({ ...point })) }));
}
function remember() {
  undoStack.value.push(snapshot());
  if (undoStack.value.length > 50) undoStack.value.shift();
  redo.value = [];
}
function measureText(text: string, size: number): number {
  const ctx = canvas.value!.getContext("2d")!;
  ctx.save();
  ctx.font = `${size}px "Segoe UI", "Microsoft YaHei UI", sans-serif`;
  const width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}
function markAt(point: Point): number {
  for (let i = marks.value.length - 1; i >= 0; i--) {
    if (hitMark(marks.value[i], point, measureText)) return i;
  }
  return -1;
}

async function editText(point: Point, index?: number) {
  commitText();
  const mark = index === undefined ? undefined : marks.value[index];
  editor.value = { point: mark ? { ...mark.points[0] } : point, text: mark?.text ?? "", color: mark?.color ?? color.value, width: mark?.width ?? strokeWidth.value, fontSize: mark?.fontSize, rotation: mark?.rotation, index };
  selectedMark.value = index;
  render();
  await nextTick();
  // 等当前鼠标默认行为结束后再聚焦，避免空输入框立即失焦并被提交移除。
  const current = editor.value;
  requestAnimationFrame(() => {
    if (editor.value === current) textInput.value?.focus({ preventScroll: true });
  });
}
function commitText() {
  const edit = editor.value;
  if (!edit) return;
  editor.value = undefined;
  const text = edit.text.replace(/\r/g, "");
  if (!text.trim() && edit.index === undefined) { render(); return; }
  if (edit.index !== undefined && marks.value[edit.index]?.text === text) { render(); return; }
  remember();
  if (!text.trim() && edit.index !== undefined) {
    marks.value.splice(edit.index, 1);
    selectedMark.value = undefined;
  } else {
    const mark: Mark = { tool: "text", points: [edit.point], text, color: edit.color, width: edit.width, fontSize: edit.fontSize, rotation: edit.rotation };
    const index = edit.index ?? marks.value.length;
    marks.value[index] = mark;
    selectedMark.value = index;
  }
  render();
}
function editorKeydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.isComposing) return;
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commitText(); }
  if (event.key === "Escape") { event.preventDefault(); editor.value = undefined; render(); }
}
function doubleClick(event: MouseEvent) {
  if (busy.value || !selection.value) return;
  const index = markAt({ x: event.clientX, y: event.clientY });
  if (index >= 0 && marks.value[index].tool === "text") void editText(marks.value[index].points[0], index);
}
const editorStyle = computed(() => {
  const edit = editor.value;
  if (!edit) return {};
  const fontSize = edit.fontSize ?? Math.max(14, edit.width * 6);
  const textBounds = markBounds({ tool: "text", points: [edit.point], text: edit.text, width: edit.width, fontSize, color: edit.color }, measureText);
  return {
    left: `${edit.point.x}px`, top: `${edit.point.y}px`, color: edit.color,
    fontSize: `${fontSize}px`, lineHeight: `${fontSize * 1.3}px`,
    width: `${Math.min(Math.max(150, ...edit.text.split("\n").map((line) => measureText(line, fontSize) + 12)), Math.max(24, (selection.value?.x ?? 0) + (selection.value?.w ?? innerWidth) - edit.point.x))}px`,
    height: `${Math.max(fontSize * 1.3 + 4, edit.text.split("\n").length * fontSize * 1.3 + 4)}px`,
    transform: `rotate(${edit.rotation ?? 0}deg)`, transformOrigin: `${textBounds.w / 2}px ${textBounds.h / 2}px`,
  };
});

const rotationControl = computed(() => {
  if (selectedMark.value === undefined || editor.value || !marks.value[selectedMark.value]) return undefined;
  const mark = marks.value[selectedMark.value];
  const rect = markControlBounds(mark, measureText);
  const attach = markWorldPoint(mark, { x: rect.x + rect.w / 2, y: rect.y }, measureText);
  const grip = markWorldPoint(mark, { x: rect.x + rect.w / 2, y: rect.y - 28 }, measureText);
  return { attach, grip: { x: Math.max(12, Math.min(viewportWidth.value - 12, grip.x)), y: Math.max(12, Math.min(viewportHeight.value - 12, grip.y)) } };
});

function beginRotation(event: PointerEvent) {
  if (event.button !== 0 || busy.value || selectedMark.value === undefined) return;
  const index = selectedMark.value;
  rotating = { index, original: snapshot()[index], recorded: false };
  start.value = pointOf(event);
  cursor.value = "grabbing";
  canvas.value?.setPointerCapture(event.pointerId);
}

const tools: { id: Tool; icon: typeof Crop; label: string }[] = [
  { id: "select", icon: Crop, label: "image.screenshotToolSelect" },
  { id: "pen", icon: Pencil, label: "image.screenshotToolPen" },
  { id: "line", icon: Minus, label: "image.screenshotToolLine" },
  { id: "arrow", icon: ArrowUpRight, label: "image.screenshotToolArrow" },
  { id: "rect", icon: Square, label: "image.screenshotToolRect" },
  { id: "text", icon: Type, label: "image.screenshotToolText" },
  { id: "mosaic", icon: Grid3x3, label: "image.screenshotToolMosaic" },
];

const toolbarStyle = computed(() => {
  const rect = selection.value;
  if (!rect) return {};
  const width = Math.min(760, window.innerWidth - 16);
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.x + rect.w - width));
  const below = rect.y + rect.h + 10;
  const top = below + 52 < window.innerHeight ? below : Math.max(8, rect.y - 58);
  return { left: `${left}px`, top: `${top}px`, width: `${width}px` };
});

function normalized(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function inside(point: Point, rect = selection.value) {
  return Boolean(rect && point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h);
}

function arrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, width: number) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = Math.max(10, width * 4);
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawMark(ctx: CanvasRenderingContext2D, mark: Mark, scaleX = 1, scaleY = 1, source?: HTMLImageElement) {
  const center = markCenter(mark, measureText);
  ctx.save();
  ctx.scale(scaleX, scaleY);
  ctx.translate(center.x, center.y);
  ctx.rotate((mark.rotation ?? 0) * Math.PI / 180);
  ctx.translate(-center.x, -center.y);
  drawUnrotatedMark(ctx, mark, 1, 1, source);
  ctx.restore();
}

function drawUnrotatedMark(ctx: CanvasRenderingContext2D, mark: Mark, scaleX = 1, scaleY = 1, source?: HTMLImageElement) {
  const points = mark.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
  if (!points.length) return;
  ctx.save();
  ctx.strokeStyle = mark.color;
  ctx.fillStyle = mark.color;
  ctx.lineWidth = mark.width * Math.max(scaleX, scaleY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (mark.tool === "pen") {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  } else if (mark.tool === "line" || mark.tool === "arrow") {
    if (mark.tool === "arrow") arrow(ctx, points[0], points[points.length - 1], ctx.lineWidth);
    else {
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y); ctx.stroke();
    }
  } else if (mark.tool === "rect") {
    const rect = normalized(points[0], points[points.length - 1]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  } else if (mark.tool === "text") {
    ctx.scale(scaleX, scaleY);
    ctx.font = `${textFontSize(mark)}px "Segoe UI", "Microsoft YaHei UI", sans-serif`;
    ctx.textBaseline = "top";
    (mark.text ?? "").split("\n").forEach((line, index) => ctx.fillText(line, mark.points[0].x, mark.points[0].y + index * textLineHeight(mark)));
  } else if (mark.tool === "mosaic" && !source) {
    // 实时桌面不提前采样像素，只标明待处理范围；确认时才生成实际马赛克。
    const rect = normalized(points[0], points[points.length - 1]);
    ctx.globalAlpha = .35;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  } else if (mark.tool === "mosaic" && source) {
    const rect = normalized(points[0], points[points.length - 1]);
    const worldRect = markWorldBounds(mark, measureText);
    const block = 12;
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(worldRect.w / block));
    small.height = Math.max(1, Math.round(worldRect.h / block));
    const smallCtx = small.getContext("2d")!;
    const sample = clientRectToDesktop(worldRect, physicalViewport.value, { w: innerWidth, h: innerHeight });
    smallCtx.drawImage(source, sample.x, sample.y, sample.w, sample.h, 0, 0, small.width, small.height);
    // 旋转的是遮挡范围，像素从该范围下的真实画面采样，避免把桌面内容一起旋转。
    ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
    const center = markCenter(mark, measureText);
    ctx.translate(center.x, center.y);
    ctx.rotate(-(mark.rotation ?? 0) * Math.PI / 180);
    ctx.translate(-center.x, -center.y);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, worldRect.x, worldRect.y, worldRect.w, worldRect.h);
  }
  ctx.restore();
}

function render() {
  const el = canvas.value;
  if (!el || !ready.value) return;
  if (el.width !== innerWidth) el.width = innerWidth;
  if (el.height !== innerHeight) el.height = innerHeight;
  const ctx = el.getContext("2d")!;
  ctx.clearRect(0, 0, el.width, el.height);
  const rect = selection.value ?? hovered.value;
  if (rect) {
    ctx.save();
    ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
    for (let i = 0; i < marks.value.length; i++) {
      if (editor.value?.index !== i) drawMark(ctx, marks.value[i]);
    }
    if (drawing.value) drawMark(ctx, drawing.value);
    ctx.restore();
  }
  if (selectedMark.value !== undefined && marks.value[selectedMark.value] && !editor.value) {
    const mark = marks.value[selectedMark.value];
    const markRect = markControlBounds(mark, measureText);
    ctx.save();
    const styles = getComputedStyle(document.documentElement);
    ctx.strokeStyle = styles.getPropertyValue("--accent");
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    const center = markCenter(mark, measureText);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((mark.rotation ?? 0) * Math.PI / 180);
    ctx.translate(-center.x, -center.y);
    ctx.strokeRect(markRect.x, markRect.y, markRect.w, markRect.h);
    ctx.restore();
    ctx.setLineDash([]);
    ctx.fillStyle = styles.getPropertyValue("--surface");
    ctx.lineWidth = 2;
    for (const handle of markHandles(mark, measureText)) {
      ctx.fillRect(handle.x - 4, handle.y - 4, 8, 8);
      ctx.strokeRect(handle.x - 4, handle.y - 4, 8, 8);
    }
    const control = rotationControl.value;
    if (control) {
      ctx.beginPath(); ctx.moveTo(control.attach.x, control.attach.y); ctx.lineTo(control.grip.x, control.grip.y); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, .48)";
  ctx.beginPath(); ctx.rect(0, 0, el.width, el.height);
  if (rect) ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.fill("evenodd");
  if (rect) {
    const styles = getComputedStyle(document.documentElement);
    ctx.strokeStyle = styles.getPropertyValue("--accent").trim();
    ctx.lineWidth = 3;
    ctx.strokeRect(rect.x + 1.5, rect.y + 1.5, Math.max(0, rect.w - 3), Math.max(0, rect.h - 3));
    if (selection.value && !picking) {
      ctx.fillStyle = styles.getPropertyValue("--surface").trim();
      ctx.lineWidth = 2;
      for (const handle of selectionHandles(rect)) {
        ctx.fillRect(handle.x - 4, handle.y - 4, 8, 8);
        ctx.strokeRect(handle.x - 4, handle.y - 4, 8, 8);
      }
    }
  }
  ctx.restore();
}

function pointOf(event: PointerEvent): Point {
  return {
    x: Math.max(0, Math.min(window.innerWidth, event.clientX)),
    y: Math.max(0, Math.min(window.innerHeight, event.clientY)),
  };
}

function pointerDown(event: PointerEvent) {
  if (event.button !== 0 || busy.value || !ready.value) return;
  commitText();
  const point = pointOf(event);
  // 标注控制点优先于整张截图的边框，避免拖错对象。
  const selected = selectedMark.value;
  if (selected !== undefined && marks.value[selected] && selection.value) {
    const handle = markHandleAt(marks.value[selected], point, measureText);
    if (handle) {
      scaling = { index: selected, original: snapshot()[selected], handle, recorded: false };
      start.value = point;
      canvas.value?.setPointerCapture(event.pointerId);
      return;
    }
  }
  if (selection.value) {
    const handle = resizeHandleAt(selection.value, point);
    if (handle) {
      resizing = { handle, rect: { ...selection.value } };
      start.value = point;
      canvas.value?.setPointerCapture(event.pointerId);
      return;
    }
  }
  if (selection.value && inside(point)) {
    const index = markAt(point);
    if (index >= 0) {
      const original = snapshot()[index];
      moving = { index, original, bounds: markWorldBounds(original, measureText), recorded: false };
      selectedMark.value = index;
      start.value = point;
      canvas.value?.setPointerCapture(event.pointerId);
      cursor.value = "move";
      render();
      return;
    }
  }
  selectedMark.value = undefined;
  if (!selection.value || tool.value === "select") {
    picking = true;
    candidate = targetAt(point);
    start.value = point;
    selection.value = undefined;
    hovered.value = candidate;
    marks.value = [];
    undoStack.value = [];
    redo.value = [];
    canvas.value?.setPointerCapture(event.pointerId);
    render();
    return;
  }
  if (!inside(point)) return;
  if (tool.value === "text") {
    void editText(point);
    return;
  }
  start.value = point;
  drawing.value = { tool: tool.value as Mark["tool"], points: [point], color: color.value, width: strokeWidth.value };
  canvas.value?.setPointerCapture(event.pointerId);
}

function pointerMove(event: PointerEvent) {
  const point = pointOf(event);
  if (!ready.value || busy.value) return;
  if (!start.value) {
    const selected = selectedMark.value;
    const markHandle = selected === undefined || !marks.value[selected] ? undefined : markHandleAt(marks.value[selected], point, measureText);
    if (markHandle) {
      cursor.value = markHandle === "start" || markHandle === "end" ? "crosshair" : `${markHandle}-resize`;
      return;
    }
    const handle = selection.value && resizeHandleAt(selection.value, point);
    cursor.value = handle ? `${handle}-resize` : selection.value && inside(point) && markAt(point) >= 0 ? "move" : tool.value === "text" ? "text" : "crosshair";
    if (!selection.value) {
      hovered.value = targetAt(point);
      render();
    }
    return;
  }
  if (rotating) {
    if (!rotating.recorded) {
      if (Math.hypot(point.x - start.value.x, point.y - start.value.y) < 2) return;
      remember(); rotating.recorded = true;
    }
    marks.value[rotating.index] = rotateMark(rotating.original, start.value, point, measureText, event.shiftKey);
    render();
    return;
  }
  if (scaling && selection.value) {
    if (!scaling.recorded) {
      if (Math.hypot(point.x - start.value.x, point.y - start.value.y) < 2) return;
      remember();
      scaling.recorded = true;
    }
    marks.value[scaling.index] = resizeMark(scaling.original, scaling.handle, point, selection.value, measureText);
    render();
    return;
  }
  if (moving && selection.value) {
    if (!moving.recorded) {
      if (Math.hypot(point.x - start.value.x, point.y - start.value.y) < 2) return;
      remember();
      moving.recorded = true;
    }
    const { bounds } = moving;
    const dx = Math.max(selection.value.x - bounds.x, Math.min(selection.value.x + selection.value.w - bounds.x - bounds.w, point.x - start.value.x));
    const dy = Math.max(selection.value.y - bounds.y, Math.min(selection.value.y + selection.value.h - bounds.y - bounds.h, point.y - start.value.y));
    marks.value[moving.index] = moveMark(moving.original, { x: dx, y: dy });
    render();
    return;
  }
  if (resizing) {
    selection.value = resizeSelection(resizing.rect, resizing.handle, point, { w: innerWidth, h: innerHeight });
    render();
    return;
  }
  if (picking) {
    if (Math.hypot(point.x - start.value.x, point.y - start.value.y) > 3) {
      selection.value = normalized(start.value, point);
      hovered.value = undefined;
    }
    render();
    return;
  }
  if (tool.value === "select" || !drawing.value) selection.value = normalized(start.value, point);
  else if (drawing.value.tool === "pen") drawing.value.points.push(point);
  else drawing.value.points = [start.value, point];
  render();
}

function pointerUp(event: PointerEvent) {
  if (!start.value) return;
  pointerMove(event);
  canvas.value?.releasePointerCapture(event.pointerId);
  if (picking && !selection.value && candidate) selection.value = { ...candidate };
  if (drawing.value && drawing.value.points.length > 1) {
    remember();
    marks.value.push(drawing.value);
    selectedMark.value = marks.value.length - 1;
  }
  drawing.value = undefined;
  start.value = undefined;
  picking = false;
  resizing = undefined;
  moving = undefined;
  scaling = undefined;
  rotating = undefined;
  hovered.value = undefined;
  if (selection.value && (selection.value.w < 4 || selection.value.h < 4)) selection.value = undefined;
  else if (selection.value && tool.value === "select") tool.value = "rect";
  render();
}

function targetAt(point: Point): Rect | undefined {
  return windowAt(point, windowRects.map((rect) => desktopRectToClient(rect, physicalViewport.value, { w: innerWidth, h: innerHeight })));
}

function undo() {
  commitText();
  const previous = undoStack.value.pop();
  if (previous) { redo.value.push(snapshot()); marks.value = previous; }
  selectedMark.value = undefined;
  render();
}
function redoMark() {
  const next = redo.value.pop();
  if (next) { undoStack.value.push(snapshot()); marks.value = next; }
  selectedMark.value = undefined;
  render();
}

async function exportedPng(): Promise<Blob> {
  const rect = selection.value!;
  const scaleX = physicalViewport.value.w / innerWidth;
  const scaleY = physicalViewport.value.h / innerHeight;
  const crop = clientRectToDesktop(rect, physicalViewport.value, { w: innerWidth, h: innerHeight });
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(rect.w * scaleX));
  out.height = Math.max(1, Math.round(rect.h * scaleY));
  const ctx = out.getContext("2d")!;
  ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
  ctx.save();
  ctx.translate(-rect.x * scaleX, -rect.y * scaleY);
  for (const mark of marks.value) drawMark(ctx, mark, scaleX, scaleY, image);
  ctx.restore();
  return new Promise((resolve, reject) => out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))), "image/png"));
}

async function finish(action: "copy" | "save" | "pin") {
  if (!selection.value || busy.value) return;
  commitText();
  busy.value = true;
  try {
    const base64 = await invoke<string>("screenshot_capture", { draftId: activeDraftId.value });
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const blob = await exportedPng();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await invoke("screenshot_finish", {
      draftId: activeDraftId.value,
      pngBase64: bytesToBase64(bytes),
      pin: action === "pin",
      copyToClipboard: action === "copy",
    });
    recordToolUsage();
  } catch (error) {
    busy.value = false;
    await invoke("screenshot_show", { draftId: activeDraftId.value }).catch(() => undefined);
    alert(error instanceof Error ? error.message : String(error));
  }
}

async function cancel() {
  if (busy.value) return;
  busy.value = true;
  await invoke("screenshot_cancel", { draftId: activeDraftId.value }).catch(() => undefined);
}

function keydown(event: KeyboardEvent) {
  if (event.target instanceof HTMLTextAreaElement || busy.value) return;
  if (event.key === "Escape") void cancel();
  if (event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redoMark() : undo(); }
  if ((event.key === "Delete" || event.key === "Backspace") && selectedMark.value !== undefined) {
    event.preventDefault(); remember(); marks.value.splice(selectedMark.value, 1); selectedMark.value = undefined; render();
  }
}

function resized() {
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
  render();
}

async function loadDraft(id: string) {
  if (loadedDraftId === id) return;
  loadedDraftId = id;
  activeDraftId.value = id;
  ready.value = false;
  busy.value = false;
  selection.value = undefined;
  hovered.value = undefined;
  windowRects = [];
  resizing = undefined;
  picking = false;
  candidate = undefined;
  marks.value = [];
  undoStack.value = [];
  selectedMark.value = undefined;
  moving = undefined;
  scaling = undefined;
  rotating = undefined;
  editor.value = undefined;
  redo.value = [];
  drawing.value = undefined;
  start.value = undefined;
  tool.value = "select";
  try {
    await nextTick();
    const el = canvas.value;
    el?.getContext("2d")?.clearRect(0, 0, el.width, el.height);
    await invoke("screenshot_show", { draftId: id });
    const targets = await invoke<{ width: number; height: number; windows: Rect[]; viewport: Rect }>("screenshot_targets", { draftId: id });
    windowRects = targets.windows;
    physicalViewport.value = targets.viewport;
    ready.value = true;
    await nextTick();
    resized();
    await invoke("screenshot_show", { draftId: id });
  } catch (error) {
    alert(String(error));
    void cancel();
  }
}

onMounted(async () => {
  window.addEventListener("keydown", keydown);
  window.addEventListener("resize", resized);
  unlisten = await listen<string>("screenshot-start", (event) => void loadDraft(event.payload));
  // 首次启动时事件可能早于监听器，注册后再读取当前截图以补齐。
  const id = await invoke<string | null>("screenshot_active");
  if (id) await loadDraft(id);
});
onBeforeUnmount(() => {
  unlisten?.();
  window.removeEventListener("keydown", keydown);
  window.removeEventListener("resize", resized);
});
</script>

<template>
  <main class="overlay" @contextmenu.prevent>
    <canvas ref="canvas" :style="{ cursor }" @mousedown.prevent @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @dblclick="doubleClick" />
    <textarea v-if="editor" ref="textInput" v-model="editor.text" class="text-editor" :style="editorStyle" :aria-label="t('image.screenshotTextPrompt')" :placeholder="t('image.screenshotTextPrompt')" :title="t('image.screenshotTextEditHint')" spellcheck="false" @pointerdown.stop @dblclick.stop @blur="commitText" @keydown="editorKeydown" />
    <button v-if="rotationControl && !busy" class="rotation-control" :style="{ left: `${rotationControl.grip.x}px`, top: `${rotationControl.grip.y}px` }" :title="t('image.screenshotRotate')" :aria-label="t('image.screenshotRotate')" @pointerdown.stop.prevent="beginRotation"><RotateCw :size="14" /></button>
    <div v-if="ready && !selection" class="hint"><MousePointer2 :size="17" />{{ t("image.screenshotSelectHint") }}</div>
    <div v-if="selection" class="size-label" :style="{ left: `${selection.x}px`, top: `${Math.max(4, selection.y - 28)}px` }">
      {{ Math.round(selection.w * physicalViewport.w / viewportWidth) }} × {{ Math.round(selection.h * physicalViewport.h / viewportHeight) }}
    </div>
    <div v-if="selection" class="shot-toolbar" :style="toolbarStyle" @pointerdown.stop>
      <button v-for="entry in tools" :key="entry.id" :class="{ on: tool === entry.id }" :title="t(entry.label)" @click="tool = entry.id">
        <component :is="entry.icon" :size="17" />
      </button>
      <span class="divider" />
      <input v-model="color" type="color" :title="t('image.screenshotColor')" />
      <select v-model="strokeWidth" :title="t('image.screenshotWidth')"><option :value="2">2</option><option :value="3">3</option><option :value="5">5</option><option :value="8">8</option></select>
      <button :disabled="!undoStack.length" :title="t('image.screenshotUndo')" @click="undo"><Undo2 :size="17" /></button>
      <button :disabled="!redo.length" :title="t('image.screenshotRedo')" @click="redoMark"><Redo2 :size="17" /></button>
      <span class="divider" />
      <button :title="t('image.screenshotCopy')" @click="finish('copy')"><Clipboard :size="17" /></button>
      <button :title="t('image.screenshotSave')" @click="finish('save')"><Save :size="17" /></button>
      <button :title="t('image.screenshotPin')" @click="finish('pin')"><Pin :size="17" /></button>
      <button :title="t('image.screenshotCancel')" @click="cancel"><X :size="17" /></button>
      <button class="done" :title="t('image.screenshotDone')" @click="finish('copy')"><Check :size="18" /></button>
    </div>
  </main>
</template>

<style scoped>
.overlay, canvas { position: fixed; inset: 0; width: 100%; height: 100%; }
.overlay { background: transparent; cursor: crosshair; user-select: none; }
canvas { touch-action: none; }
.rotation-control { position: fixed; z-index: 4; width: 22px; height: 22px; padding: 0; transform: translate(-50%, -50%); display: grid; place-items: center; border: 1px solid var(--accent); border-radius: 50%; background: var(--surface); color: var(--accent); cursor: grab; touch-action: none; }
.text-editor { position: fixed; z-index: 4; padding: 0; margin: 0; border: 1px dashed var(--accent); outline: none; border-radius: 2px; background: var(--surface); font-family: "Segoe UI", "Microsoft YaHei UI", sans-serif; resize: none; overflow: hidden; white-space: pre; user-select: text; cursor: text; }
.hint { position: fixed; left: 50%; top: 28px; transform: translateX(-50%); display: flex; align-items: center; gap: 7px; padding: 8px 13px; border-radius: 8px; color: #fff; background: rgba(20,20,20,.84); box-shadow: 0 6px 24px rgba(0,0,0,.25); font-size: 13px; }
.size-label { position: fixed; padding: 3px 7px; color: #fff; background: rgba(0,0,0,.72); border-radius: 4px; font: 12px var(--font-mono); pointer-events: none; }
.shot-toolbar { position: fixed; z-index: 3; height: 46px; padding: 5px 6px; display: flex; align-items: center; gap: 2px; border: 1px solid rgba(255,255,255,.16); border-radius: 9px; background: #262626; color: #eee; box-shadow: 0 10px 32px rgba(0,0,0,.35); cursor: default; }
.shot-toolbar button { width: 34px; height: 34px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 6px; background: transparent; color: #d6d6d6; }
.shot-toolbar button:hover, .shot-toolbar button.on { background: #414141; color: #fff; }
.shot-toolbar button.on { box-shadow: inset 0 0 0 1px var(--accent); }
.shot-toolbar button:disabled { opacity: .3; }
.shot-toolbar button.done { margin-left: 2px; background: var(--accent); color: var(--surface); }
.divider { width: 1px; height: 25px; margin: 0 3px; background: #505050; }
.shot-toolbar input[type="color"] { width: 28px; height: 28px; padding: 2px; border: 0; border-radius: 5px; background: #414141; }
.shot-toolbar select { height: 28px; border: 1px solid #555; border-radius: 5px; background: #303030; color: #eee; }
</style>
