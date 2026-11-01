<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { Brush, Download, RefreshCw, SquareDashed, Undo2 } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useFitFrame } from "@/composables/useFitFrame";
import { saveFile } from "@/utils/saveFile";
import { canvasToBytes, createCanvas, formatInfo, loadImage, outputFormatOf, type ImageFormat } from "../utils";
import { pixelate, type Box } from "../effects";

/**
 * 图片马赛克：框选或画笔涂抹，把区域打上马赛克或模糊。
 * 每次操作生成新画布记入历史，可以撤销。
 */
const effect = useStoredRef<"mosaic" | "blur">("mosaic.effect", "mosaic");
const tool = useStoredRef<"rect" | "brush">("mosaic.tool", "rect");
const strength = useStoredRef("mosaic.strength", 16);
const brushSize = useStoredRef("mosaic.brush", 40);

const fileName = ref("");
const fileType = ref<ImageFormat>("image/png");
const loadError = ref("");
const history = shallowRef<HTMLCanvasElement[]>([]);
const current = computed(() => history.value[history.value.length - 1] ?? null);

const onFiles = async ([file]: File[]) => {
  loadError.value = "";
  try {
    const img = await loadImage(file);
    const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    fileName.value = file.name;
    fileType.value = outputFormatOf(file.type);
    history.value = [canvas];
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
};

const undo = () => history.value.length > 1 && (history.value = history.value.slice(0, -1));
const reset = () => (history.value = history.value.slice(0, 1));

// ---------- 预览 ----------
const view = ref<HTMLCanvasElement>();
const { observeArea, frameStyle, scale } = useFitFrame(current);

/** 把画布内容画到预览上 */
const paint = (src: HTMLCanvasElement) => {
  const v = view.value;
  if (!v) return;
  if (v.width !== src.width || v.height !== src.height) {
    v.width = src.width;
    v.height = src.height;
  }
  v.getContext("2d")!.drawImage(src, 0, 0);
};
watch(current, async (src) => {
  await nextTick();
  if (src) paint(src);
});

// ---------- 处理一个区域 ----------

/** 在 target 上处理区域；inside 判断某点是否在画笔范围内 */
const applyEffect = (target: HTMLCanvasElement, area: Box, inside?: (x: number, y: number) => boolean) => {
  const ctx = target.getContext("2d", { willReadFrequently: true })!;
  const box = {
    x: Math.max(0, Math.floor(area.x)),
    y: Math.max(0, Math.floor(area.y)),
    w: Math.min(target.width, Math.ceil(area.x + area.w)) - Math.max(0, Math.floor(area.x)),
    h: Math.min(target.height, Math.ceil(area.y + area.h)) - Math.max(0, Math.floor(area.y)),
  };
  if (box.w <= 0 || box.h <= 0) return;

  if (effect.value === "mosaic") {
    // 读取比区域稍大的一块，保证格子完整
    const b = strength.value;
    const rx = Math.floor(box.x / b) * b;
    const ry = Math.floor(box.y / b) * b;
    const rw = Math.min(target.width, Math.ceil((box.x + box.w) / b) * b) - rx;
    const rh = Math.min(target.height, Math.ceil((box.y + box.h) / b) * b) - ry;
    const image = ctx.getImageData(rx, ry, rw, rh);
    const local = { x: box.x - rx, y: box.y - ry, w: box.w, h: box.h };
    pixelate(image.data, rw, rh, local, b, inside ? (cx, cy) => inside(cx + rx, cy + ry) : undefined);
    ctx.putImageData(image, rx, ry);
  } else {
    // 模糊：先复制一份（画布不能可靠地带滤镜画到自己身上），再在区域（或画笔圆形）内用模糊后的图像覆盖
    const copy = clone(target);
    ctx.save();
    ctx.beginPath();
    if (inside) ctx.arc(area.x + area.w / 2, area.y + area.h / 2, area.w / 2, 0, Math.PI * 2);
    else ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.filter = `blur(${Math.max(2, strength.value / 2)}px)`;
    ctx.drawImage(copy, 0, 0);
    ctx.restore();
  }
};

const clone = (src: HTMLCanvasElement) => {
  const { canvas, ctx } = createCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  return canvas;
};

// ---------- 鼠标操作 ----------
const selection = ref<Box | null>(null);
const brushCursor = ref<{ x: number; y: number } | null>(null);

/** 屏幕坐标 → 图片像素坐标 */
const toImage = (e: PointerEvent) => {
  const rect = view.value!.getBoundingClientRect();
  const s = current.value!.width / rect.width;
  return { x: (e.clientX - rect.left) * s, y: (e.clientY - rect.top) * s };
};

const onPointerDown = (e: PointerEvent) => {
  if (!current.value || !view.value) return;
  e.preventDefault();
  (e.target as Element).setPointerCapture(e.pointerId);
  const start = toImage(e);

  if (tool.value === "rect") {
    selection.value = { x: start.x, y: start.y, w: 0, h: 0 };
    const move = (ev: PointerEvent) => {
      const p = toImage(ev);
      selection.value = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    };
    const up = () => {
      view.value?.removeEventListener("pointermove", move);
      const sel = selection.value;
      selection.value = null;
      if (sel && sel.w > 2 && sel.h > 2) {
        const next = clone(current.value!);
        applyEffect(next, sel);
        history.value = [...history.value, next];
      }
    };
    view.value.addEventListener("pointermove", move);
    view.value.addEventListener("pointerup", up, { once: true });
    return;
  }

  // 画笔：在一张新画布上连续涂抹，松开后记入历史
  const next = clone(current.value);
  const r = brushSize.value / 2;
  // 马赛克格子只要被笔刷碰到就处理：格子中心离笔刷中心不超过「半径 + 半个格子的对角线」
  const reach = effect.value === "mosaic" ? r + strength.value * 0.71 : r;
  const stamp = (p: { x: number; y: number }) => {
    applyEffect(next, { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 }, (x, y) => Math.hypot(x - p.x, y - p.y) <= reach);
  };
  stamp(start);
  paint(next);
  const move = (ev: PointerEvent) => {
    stamp(toImage(ev));
    paint(next);
  };
  const up = () => {
    view.value?.removeEventListener("pointermove", move);
    history.value = [...history.value, next];
  };
  view.value.addEventListener("pointermove", move);
  view.value.addEventListener("pointerup", up, { once: true });
};

const onHover = (e: PointerEvent) => {
  if (tool.value !== "brush" || !view.value) return (brushCursor.value = null);
  const rect = view.value.getBoundingClientRect();
  brushCursor.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

/** 框选区域在预览上的位置 */
const selectionStyle = computed(() => {
  const sel = selection.value;
  if (!sel || !scale.value) return null;
  return { left: `${sel.x * scale.value}px`, top: `${sel.y * scale.value}px`, width: `${sel.w * scale.value}px`, height: `${sel.h * scale.value}px` };
});

// ---------- 导出 ----------
const saved = ref(false);
const download = async () => {
  if (!current.value) return;
  const bytes = await canvasToBytes(current.value, fileType.value, 0.92);
  const base = fileName.value.replace(/\.[^.]+$/, "") || "image";
  if (await saveFile(bytes, `${base}_马赛克.${formatInfo(fileType.value).ext}`)) {
    saved.value = true;
    setTimeout(() => (saved.value = false), 1500);
  }
};
</script>

<template>
  <div class="mosaic">
    <aside class="card panel">
      <section class="section">
        <h3>效果</h3>
        <div class="seg fill">
          <button :class="{ on: effect === 'mosaic' }" @click="effect = 'mosaic'">马赛克</button>
          <button :class="{ on: effect === 'blur' }" @click="effect = 'blur'">模糊</button>
        </div>
        <label class="slider">
          <span>强度</span>
          <input v-model.number="strength" type="range" min="4" max="60" step="2" />
          <em>{{ strength }}</em>
        </label>
      </section>

      <section class="section">
        <h3>选区</h3>
        <div class="seg fill">
          <button :class="{ on: tool === 'rect' }" @click="tool = 'rect'"><SquareDashed :size="14" />框选</button>
          <button :class="{ on: tool === 'brush' }" @click="tool = 'brush'"><Brush :size="14" />画笔</button>
        </div>
        <label v-if="tool === 'brush'" class="slider">
          <span>笔刷</span>
          <input v-model.number="brushSize" type="range" min="10" max="200" step="5" />
          <em>{{ brushSize }}</em>
        </label>
      </section>

      <section class="section">
        <p class="tip">{{ current ? `已处理 ${history.length - 1} 处，导出为原格式（${formatInfo(fileType).label}）` : "放入图片后，在图片上框选或涂抹" }}</p>
        <button class="btn primary full" :disabled="!current" @click="download"><Download :size="14" />{{ saved ? "已保存" : "下载图片" }}</button>
      </section>
    </aside>

    <section class="card stage">
      <header class="card-title">
        <span class="file" :title="fileName">{{ fileName || "未选择图片" }}</span>
        <template v-if="current">
          <span class="hint">{{ tool === "rect" ? "在图片上拖动框选区域" : "按住鼠标在图片上涂抹" }}</span>
          <button class="btn small subtle" :disabled="history.length < 2" @click="undo"><Undo2 :size="14" />撤销</button>
          <button class="btn small subtle" :disabled="history.length < 2" @click="reset">重置</button>
          <label class="btn small subtle">
            <RefreshCw :size="14" />更换
            <input type="file" accept="image/*" hidden @change="onFiles([...(($event.target as HTMLInputElement).files ?? [])])" />
          </label>
        </template>
      </header>
      <FileDropZone
        v-if="!current"
        class="drop"
        accept="image/*"
        title="拖入图片，或点击选择"
        hint="框选或涂抹需要遮挡的区域（人脸、车牌、手机号等）；也可以按 Ctrl + V 粘贴截图"
        @files="onFiles"
      >
        <span v-if="loadError" class="load-error">{{ loadError }}</span>
      </FileDropZone>
      <div v-else :ref="observeArea" class="area">
        <div class="frame" :style="frameStyle">
          <canvas
            ref="view"
            :class="`tool-${tool}`"
            @pointerdown="onPointerDown"
            @pointermove="onHover"
            @pointerleave="brushCursor = null"
          />
          <div v-if="selectionStyle" class="selection" :style="selectionStyle" />
          <div
            v-if="brushCursor"
            class="brush-cursor"
            :style="{
              left: `${brushCursor.x}px`,
              top: `${brushCursor.y}px`,
              width: `${brushSize * scale}px`,
              height: `${brushSize * scale}px`,
            }"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mosaic {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.stage {
  flex: 1;
  min-width: 0;
  min-height: 380px;
}
.card-title .file {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-title .hint {
  flex: 1;
  font-weight: 400;
  color: var(--text-3);
  white-space: nowrap;
}
.btn.small {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.area {
  position: relative;
  flex: 1;
  min-height: 200px;
  margin: 12px;
  overflow: hidden;
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
  touch-action: none;
}
canvas.tool-rect {
  cursor: crosshair;
}
/* 画笔模式隐藏系统光标，用下面的圆圈表示笔刷大小 */
canvas.tool-brush {
  cursor: none;
}
.selection {
  position: absolute;
  border: 1.5px dashed #fff;
  outline: 1px solid rgba(0, 0, 0, 0.4);
  background: rgba(201, 100, 66, 0.15);
  pointer-events: none;
}
.brush-cursor {
  position: absolute;
  transform: translate(-50%, -50%);
  border: 1.5px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}

.drop {
  flex: 1;
  margin: 12px;
}
.panel {
  flex: 0 0 260px;
  align-self: flex-start;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
}
.section + .section {
  border-top: 1px solid var(--border);
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.seg.fill {
  display: flex;
}
.seg.fill button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.slider {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.slider input {
  flex: 1;
  accent-color: var(--accent);
}
.slider em {
  flex: 0 0 28px;
  font-style: normal;
  text-align: right;
  color: var(--text-3);
}
.tip {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
.btn.full {
  justify-content: center;
}
.load-error {
  margin-top: 8px;
  color: var(--danger);
}
</style>
