<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, reactive, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Download, Plus, RotateCw, X } from "lucide-vue-next";
import ColorPicker from "@/components/common/ColorPicker.vue";
import CheckAll from "@/components/common/CheckAll.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFileChecks } from "@/composables/useFileChecks";
import { useStoredRef } from "@/composables/useStoredRef";
import { useFitFrame } from "@/composables/useFitFrame";
import { saveFiles } from "@/utils/saveFile";
import { canvasToBytes, createCanvas, formatInfo, loadImage, outputFormatOf, replaceExtension } from "../utils";
import { anchorPosition, freeWatermarkPosition, tilePositions, type Anchor, type WatermarkTile } from "../effects";

/**
 * 图片水印：文字或图片水印，支持九宫格定位、拖动或平铺。
 * 每张图片有自己的水印配置，可批量下载。
 * 文字大小按图片短边的百分比计算，不同尺寸的图片效果一致。
 */
const { t } = useI18n();
type Point = { x: number; y: number };
const defaults = reactive({
  kind: useStoredRef<"text" | "image">("watermark.kind", "text"),
  text: useStoredRef("watermark.text", "© Open Tools"),
  fontSize: useStoredRef("watermark.fontSize", 5),
  color: useStoredRef("watermark.color", "#ffffff"),
  bold: useStoredRef("watermark.bold", true),
  shadow: useStoredRef("watermark.shadow", true),
  logo: shallowRef<HTMLImageElement | null>(null),
  logoSize: useStoredRef("watermark.logoSize", 20),
  opacity: useStoredRef("watermark.opacity", 70),
  rotation: useStoredRef("watermark.rotation", 0),
  anchor: useStoredRef<Anchor>("watermark.anchor", "br"),
  tiled: useStoredRef("watermark.tiled", false),
  margin: useStoredRef("watermark.margin", 3),
  spacing: useStoredRef("watermark.spacing", 12),
  position: null as Point | null,
  tileOrigin: null as WatermarkTile | null,
});
type WatermarkSettings = typeof defaults;

// ---------- 图片与 Logo ----------
interface Item {
  id: number;
  file: File;
  url: string;
  img: HTMLImageElement;
  settings: WatermarkSettings;
}
const items = shallowRef<Item[]>([]);
const selectedId = ref<number | null>(null);
let nextId = 1;
const selected = computed(() => items.value.find((i) => i.id === selectedId.value) ?? items.value[0] ?? null);
const { isChecked, toggle: toggleFile, checkedItems, allChecked, partlyChecked, toggleAll } = useFileChecks(items);
const settings = computed(() => selected.value?.settings ?? defaults);
type Transform = Partial<Pick<WatermarkSettings, "position" | "tileOrigin" | "fontSize" | "logoSize" | "rotation">>;
const draft = shallowRef<Transform | null>(null);
const previewSettings = computed(() => ({ ...settings.value, ...draft.value }));
const freePosition = computed(() => previewSettings.value.position);

const addFiles = async (files: File[]) => {
  const loaded: Item[] = [];
  const initialSettings = { ...defaults };
  for (const file of files) {
    try {
      const img = await loadImage(file);
      loaded.push({ id: nextId++, file, url: URL.createObjectURL(file), img, settings: reactive({ ...initialSettings }) });
    } catch {
      // 读取失败的文件直接跳过
    }
  }
  items.value = [...items.value, ...loaded];
  if (!selectedId.value && loaded[0]) selectedId.value = loaded[0].id;
};
const remove = (item: Item) => {
  URL.revokeObjectURL(item.url);
  items.value = items.value.filter((i) => i !== item);
  if (selectedId.value === item.id) selectedId.value = items.value[0]?.id ?? null;
};
onBeforeUnmount(() => items.value.forEach((i) => URL.revokeObjectURL(i.url)));

const onLogo = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  const target = settings.value;
  input.value = "";
  if (file) target.logo = await loadImage(file);
};

// ---------- 绘制 ----------

/** 预览和导出共用原图坐标，预览缩放只影响画布分辨率。 */
const draw = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, options: WatermarkSettings, previewScale = 1) => {
  const { kind, text, fontSize, color, bold, shadow, logo, logoSize, opacity, rotation, anchor, tiled, margin, spacing, position, tileOrigin } = options;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const short = Math.min(w, h);
  let markW = 0;
  let markH = 0;
  let bleed = 0;
  let drawMark: () => void;

  if (kind === "text") {
    if (!text.trim()) return null;
    const px = (fontSize / 100) * short;
    ctx.save();
    ctx.font = `${bold ? 600 : 400} ${px}px "Segoe UI", "Microsoft YaHei UI", sans-serif`;
    markW = ctx.measureText(text).width;
    markH = px * 1.2;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (shadow) {
      const blur = px * 0.15;
      const offset = px * 0.04;
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = blur * previewScale;
      ctx.shadowOffsetY = offset * previewScale;
      bleed = blur * 3 + offset;
    }
    drawMark = () => ctx.fillText(text, 0, 0);
  } else {
    if (!logo) return null;
    ctx.save();
    markW = (logoSize / 100) * w;
    markH = (markW * logo.naturalHeight) / logo.naturalWidth;
    drawMark = () => ctx.drawImage(logo, -markW / 2, -markH / 2, markW, markH);
  }

  const image = { width: w, height: h };
  const mark = { width: markW, height: markH };
  const angle = (rotation * Math.PI) / 180;
  const center = tiled ? null : position
    ? freeWatermarkPosition(position, image, mark, angle)
    : anchorPosition(anchor, image, mark, (margin / 100) * short);
  const origin = tileOrigin ? { ...tileOrigin, x: tileOrigin.x * w, y: tileOrigin.y * h } : undefined;
  const points = center ? [{ ...center, odd: false }] : tilePositions(image, mark, (spacing / 100) * short, origin, angle, bleed);

  ctx.globalAlpha = opacity / 100;
  for (const p of points) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    drawMark();
    ctx.restore();
  }
  ctx.restore();
  return { points, width: markW, height: markH, angle, rotation };
};

// ---------- 预览 ----------
const view = ref<HTMLCanvasElement>();
const previewSize = computed(() => (selected.value ? { width: selected.value.img.naturalWidth, height: selected.value.img.naturalHeight } : null));
const { observeArea, frameStyle, scale } = useFitFrame(previewSize);
const previewMark = shallowRef<ReturnType<typeof draw>>(null);
const focusPoint = shallowRef<Point | null>(null);
const overMark = ref(false);
const activeMark = computed(() => {
  const size = previewSize.value;
  const geometry = previewMark.value;
  if (!size || !geometry) return;
  const focus = focusPoint.value ?? { x: size.width / 2, y: size.height / 2 };
  const inside = ({ x, y }: Point) => x >= 0 && x <= size.width && y >= 0 && y <= size.height;
  // 拖出边界松手后，优先把手柄留在中心仍在图内的副本上。
  const recovering = !drag.value && !inside(focus);
  const candidates = recovering ? geometry.points.filter(inside) : geometry.points;
  let nearest: WatermarkTile | undefined;
  let distance = Infinity;
  for (const point of candidates.length ? candidates : geometry.points) {
    const next = (point.x - focus.x) ** 2 + (point.y - focus.y) ** 2;
    if (next < distance) {
      nearest = point;
      distance = next;
    }
  }
  return nearest;
});
const markStyle = computed(() => {
  const mark = previewMark.value;
  const center = activeMark.value;
  const size = previewSize.value;
  if (!mark || !center || !size) return;
  return {
    left: `${center.x / size.width * 100}%`,
    top: `${center.y / size.height * 100}%`,
    width: `${mark.width / size.width * 100}%`,
    height: `${mark.height / size.height * 100}%`,
    transform: `translate(-50%, -50%) rotate(${mark.rotation}deg)`,
  };
});

let frame = 0;
const redraw = () => {
  // 拖动滑块时合并到下一帧再画，避免频繁重绘大图
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const v = view.value;
    const item = selected.value;
    if (!v || !item || !scale.value) {
      previewMark.value = null;
      return;
    }
    const resolution = Math.min(1, scale.value * (window.devicePixelRatio || 1));
    const w = item.img.naturalWidth;
    const h = item.img.naturalHeight;
    const width = Math.max(1, Math.round(w * resolution));
    const height = Math.max(1, Math.round(h * resolution));
    if (v.width !== width) v.width = width;
    if (v.height !== height) v.height = height;
    const ctx = v.getContext("2d")!;
    ctx.setTransform(width / w, 0, 0, height / h, 0, 0);
    ctx.clearRect(0, 0, w, h);
    previewMark.value = draw(ctx, item.img, previewSettings.value, resolution);
  });
};
watch([previewSettings, scale], redraw, { flush: "post" });
onBeforeUnmount(() => cancelAnimationFrame(frame));

// ---------- 预览操作 ----------
type DragMode = "move" | "scale" | "rotate";
const drag = shallowRef<{
  pointerId: number;
  item: Item;
  mode: DragMode;
  start: Point;
  pivot: WatermarkTile;
  size: number;
  rotation: number;
} | null>(null);

function previewPoint(event: PointerEvent): Point | undefined {
  const rect = view.value?.getBoundingClientRect();
  const size = previewSize.value;
  if (!rect?.width || !rect.height || !size) return;
  return {
    x: (event.clientX - rect.left) * size.width / rect.width,
    y: (event.clientY - rect.top) * size.height / rect.height,
  };
}

function hitMark(point: Point) {
  const mark = previewMark.value;
  if (!mark) return;
  const cos = Math.cos(mark.angle);
  const sin = Math.sin(mark.angle);
  // 从最后绘制的水印开始命中，重叠时选择上层。
  for (let i = mark.points.length - 1; i >= 0; i--) {
    const center = mark.points[i];
    const x = point.x - center.x;
    const y = point.y - center.y;
    if (Math.abs(x * cos + y * sin) <= mark.width / 2 && Math.abs(-x * sin + y * cos) <= mark.height / 2) return center;
  }
}

function startDrag(event: PointerEvent, mode: DragMode, pivot = activeMark.value) {
  const item = selected.value;
  if (event.button !== 0 || drag.value || !item || !pivot) return;
  const point = previewPoint(event);
  if (!point) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  focusPoint.value = pivot;
  const { kind, fontSize, logoSize, rotation } = item.settings;
  drag.value = {
    pointerId: event.pointerId, item, mode, start: point, pivot,
    size: kind === "text" ? fontSize : logoSize,
    rotation,
  };
}

function selectMark(event: PointerEvent) {
  if (event.button !== 0) return;
  const point = previewPoint(event);
  const mark = point && hitMark(point);
  if (mark) startDrag(event, "move", mark);
  else focusPoint.value = null;
}

function moveDrag(event: PointerEvent) {
  const point = previewPoint(event);
  if (!point) return;
  const active = drag.value;
  if (!active) {
    overMark.value = event.target === event.currentTarget && !!hitMark(point);
    return;
  }
  if (active.pointerId !== event.pointerId) return;
  const { item, mode, start, pivot } = active;
  if (!draft.value && start.x === point.x && start.y === point.y) return;
  const x = pivot.x + (mode === "move" ? point.x - start.x : 0);
  const y = pivot.y + (mode === "move" ? point.y - start.y : 0);
  const position = { x: x / item.img.naturalWidth, y: y / item.img.naturalHeight };
  const transform: Transform = item.settings.tiled
    ? { tileOrigin: { ...position, odd: pivot.odd } }
    : { position: { x: clamp(position.x, 0, 1), y: clamp(position.y, 0, 1) } };
  if (mode === "scale") {
    const before = Math.hypot(start.x - pivot.x, start.y - pivot.y);
    const ratio = Math.hypot(point.x - pivot.x, point.y - pivot.y) / Math.max(1, before);
    if (item.settings.kind === "text") transform.fontSize = clamp(Math.round(active.size * ratio * 2) / 2, 1, 20);
    else transform.logoSize = clamp(Math.round(active.size * ratio), 5, 60);
  } else if (mode === "rotate") {
    const before = Math.atan2(start.y - pivot.y, start.x - pivot.x);
    const after = Math.atan2(point.y - pivot.y, point.x - pivot.x);
    const degrees = Math.round(active.rotation + (after - before) * 180 / Math.PI);
    transform.rotation = ((degrees + 180) % 360 + 360) % 360 - 180;
  }
  focusPoint.value = { x, y };
  draft.value = transform;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function endDrag(event: PointerEvent) {
  const active = drag.value;
  if (active?.pointerId !== event.pointerId) return;
  if (event.type === "pointerup") {
    moveDrag(event);
    Object.assign(active.item.settings, draft.value);
  }
  cancelDrag();
}

function cancelDrag() {
  drag.value = null;
  draft.value = null;
}

watch([selected, () => settings.value.kind, () => settings.value.tiled], () => {
  cancelDrag();
  focusPoint.value = null;
  overMark.value = false;
});
watch(previewMark, (mark) => {
  if (!mark) focusPoint.value = null;
});
onDeactivated(cancelDrag);

function chooseAnchor(value: Anchor) {
  cancelDrag();
  settings.value.position = null;
  settings.value.anchor = value;
}

// ---------- 导出 ----------
const saving = ref(false);
const download = async () => {
  saving.value = true;
  try {
    const jobs = checkedItems.value.map((item) => ({ item, options: { ...item.settings } }));
    const files = [];
    for (const { item, options } of jobs) {
      const format = outputFormatOf(item.file.type);
      const { canvas, ctx } = createCanvas(item.img.naturalWidth, item.img.naturalHeight);
      draw(ctx, item.img, options);
      files.push({
        name: replaceExtension(item.file.name.replace(/(\.[^.]+)?$/, `_${t("image.watermarkSuffix")}$1`), formatInfo(format).ext),
        data: await canvasToBytes(canvas, format, 0.92),
      });
    }
    await saveFiles(files, t("image.watermarkZip"));
  } finally {
    saving.value = false;
  }
};

/** 九个位置，名称见文案 image.tl 等 */
const ANCHORS: Anchor[] = ["tl", "t", "tr", "l", "c", "r", "bl", "b", "br"];
</script>

<template>
  <div class="watermark">
    <aside class="card panel">
      <section class="section">
        <div class="seg fill">
          <button :class="{ on: settings.kind === 'text' }" @click="settings.kind = 'text'">{{ t("image.textWatermark") }}</button>
          <button :class="{ on: settings.kind === 'image' }" @click="settings.kind = 'image'">{{ t("image.imageWatermark") }}</button>
        </div>

        <template v-if="settings.kind === 'text'">
          <input v-model="settings.text" class="field" :placeholder="t('image.watermarkText')" maxlength="60" />
          <div class="row">
            <ColorPicker v-model="settings.color" :title="t('image.textColor')" />
            <label class="check"><input v-model="settings.bold" type="checkbox" />{{ t("image.bold") }}</label>
            <label class="check"><input v-model="settings.shadow" type="checkbox" />{{ t("image.shadow") }}</label>
          </div>
          <label class="slider">
            <span>{{ t("image.fontSize") }}</span>
            <input v-model.number="settings.fontSize" type="range" min="1" max="20" step="0.5" />
            <em>{{ settings.fontSize }}%</em>
          </label>
        </template>

        <template v-else>
          <label class="btn">
            <Plus :size="14" />{{ settings.logo ? t("image.replaceLogo") : t("image.chooseLogo") }}
            <input type="file" accept="image/*" hidden @change="onLogo" />
          </label>
          <p class="tip">{{ t("image.logoTip") }}</p>
          <label class="slider">
            <span>{{ t("image.size") }}</span>
            <input v-model.number="settings.logoSize" type="range" min="5" max="60" />
            <em>{{ settings.logoSize }}%</em>
          </label>
        </template>
      </section>

      <section class="section">
        <label class="slider">
          <span>{{ t("image.opacity") }}</span>
          <input v-model.number="settings.opacity" type="range" min="10" max="100" step="5" />
          <em>{{ settings.opacity }}%</em>
        </label>
        <label class="slider">
          <span>{{ t("image.rotation") }}</span>
          <input v-model.number="settings.rotation" type="range" min="-180" max="180" step="1" @dblclick="settings.rotation = 0" />
          <em>{{ settings.rotation }}°</em>
        </label>
      </section>

      <section class="section">
        <h3>
          {{ t("image.position") }}
          <label class="check push"><input v-model="settings.tiled" type="checkbox" />{{ t("image.tiled") }}</label>
        </h3>
        <div v-if="!settings.tiled" class="anchors">
          <button v-for="a in ANCHORS" :key="a" :class="{ on: !freePosition && settings.anchor === a }" :title="t(`image.${a}`)" @click="chooseAnchor(a)"><i /></button>
        </div>
        <p class="tip">{{ t(settings.tiled ? "image.watermarkTileDragHint" : "image.watermarkDragHint") }}</p>
        <label class="slider">
          <span>{{ settings.tiled ? t("image.gap") : t("image.margin") }}</span>
          <input v-if="settings.tiled" v-model.number="settings.spacing" type="range" min="2" max="50" />
          <input v-else v-model.number="settings.margin" type="range" min="0" max="15" :disabled="!!freePosition" />
          <em>{{ settings.tiled ? settings.spacing : settings.margin }}%</em>
        </label>
      </section>

      <section class="section">
        <button class="btn primary full" :disabled="saving || !checkedItems.length" @click="download">
          <Download :size="14" />{{
            saving
              ? t("image.processing")
              : items.length && !checkedItems.length
                ? t("image.checkToDownload")
                : items.length > 1
                  ? t("image.downloadSelected", { n: checkedItems.length })
                  : t("image.downloadImage")
          }}
        </button>
      </section>
    </aside>

    <section class="card stage">
      <div class="card-title">
        {{ t("image.preview") }}<span class="hint">{{ selected?.file.name }}</span>
        <CheckAll v-if="items.length > 1" class="all" :checked="allChecked" :partly="partlyChecked" :disabled="saving" @toggle="toggleAll">
          {{ t("image.selectedCount", { checked: checkedItems.length, total: items.length }) }}
        </CheckAll>
      </div>
      <FileDropZone
        v-if="!items.length"
        class="drop"
        accept="image/*"
        multiple
        :title="t('image.dropImages')"
        :hint="t('image.watermarkDropHint')"
        @files="addFiles"
      />
      <div v-else :ref="observeArea" class="area">
        <div class="frame" :style="frameStyle">
          <canvas ref="view" />
          <div
            v-if="markStyle"
            class="mark-overlay"
            :class="{ tiled: settings.tiled, 'over-mark': overMark, dragging: drag?.mode === 'move' }"
            aria-hidden="true"
            @pointerdown.self="selectMark"
            @pointermove="moveDrag"
            @pointerleave="overMark = false"
            @pointerup="endDrag"
            @pointercancel="endDrag"
            @lostpointercapture="endDrag"
          >
            <div
              class="mark-target"
              :class="{ 'has-handles': focusPoint }"
              :style="markStyle"
              @pointerdown.self="startDrag($event, 'move')"
            >
              <template v-if="focusPoint">
                <span class="mark-handle rotate-handle" :title="t('image.watermarkRotateHandle')" @pointerdown.stop="startDrag($event, 'rotate')">
                  <RotateCw :size="12" />
                </span>
                <span class="mark-handle scale-handle" :title="t('image.dragResize')" @pointerdown.stop="startDrag($event, 'scale')" />
              </template>
            </div>
          </div>
        </div>
      </div>
      <div v-if="items.length" class="strip">
        <figure
          v-for="item in items"
          :key="item.id"
          class="thumb"
          :class="{ on: item.id === selected?.id, unchecked: !isChecked(item) }"
          :title="item.file.name"
          @click="selectedId = item.id"
        >
          <img :src="item.url" alt="" />
          <input type="checkbox" class="file-check pick" :title="t('image.checkHint')" :checked="isChecked(item)" :disabled="saving" @click.stop @change="toggleFile(item)" />
          <button class="remove" :title="t('image.remove')" @click.stop="remove(item)"><X :size="11" /></button>
        </figure>
        <FileDropZone compact class="add" accept="image/*" multiple title="" :aria-label="t('image.addImages')" @files="addFiles" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.watermark {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.stage {
  flex: 1;
  min-width: 0;
  min-height: 420px;
}
.card-title .hint {
  margin-left: 6px;
  font-weight: 400;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.drop {
  flex: 1;
  margin: 12px;
}
.area {
  position: relative;
  flex: 1;
  min-height: 200px;
  margin: 12px 12px 0;
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
.mark-overlay {
  position: absolute;
  inset: 0;
}
.mark-overlay.tiled {
  touch-action: none;
}
.mark-target {
  position: absolute;
  touch-action: none;
  cursor: grab;
}
.mark-target.has-handles {
  outline: 1px solid var(--accent);
}
.mark-overlay.over-mark {
  cursor: grab;
}
.mark-overlay.dragging,
.mark-overlay.dragging .mark-target {
  cursor: grabbing;
}
.mark-handle {
  position: absolute;
  display: grid;
  place-items: center;
  border: 1px solid var(--accent);
  background: var(--surface);
  color: var(--accent);
  touch-action: none;
}
.rotate-handle {
  left: 50%;
  bottom: calc(100% + 4px);
  width: 20px;
  height: 20px;
  transform: translateX(-50%);
  border-radius: 50%;
  cursor: grab;
}
.rotate-handle:active {
  cursor: grabbing;
}
.scale-handle {
  right: -5px;
  bottom: -5px;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  cursor: nwse-resize;
}

.strip {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  padding: 12px;
  overflow-x: auto;
}
.thumb {
  position: relative;
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  margin: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
}
.thumb.on {
  border-color: var(--accent);
}
.thumb.unchecked img {
  opacity: 0.4;
}
.pick {
  position: absolute;
  left: 4px;
  top: 4px;
}
.card-title .all {
  margin-left: auto;
  font-weight: 400;
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.remove {
  position: absolute;
  right: 3px;
  top: 3px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  opacity: 0;
}
.thumb:hover .remove {
  opacity: 1;
}
.add {
  flex: 0 0 64px;
  min-height: 64px;
  padding: 0;
  justify-content: center;
}

.panel {
  flex: 0 0 272px;
  align-self: flex-start;
}
h3 {
  display: flex;
  align-items: center;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.push {
  margin-left: auto;
  font-weight: 400;
}
.field {
  height: 32px;
  font-size: 13px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.slider span {
  flex: 0 0 40px;
}
.tip {
  margin: -4px 0 0;
}
.btn {
  justify-content: center;
}

/* 九宫格位置选择 */
.anchors {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 132px;
  padding: 4px;
  border-radius: 8px;
  background: var(--active);
}
.anchors button {
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 5px;
  background: none;
}
.anchors button i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--text-3);
}
.anchors button:hover {
  background: var(--hover);
}
.anchors button.on {
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.anchors button.on i {
  background: var(--accent);
}
</style>
