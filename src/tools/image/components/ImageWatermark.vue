<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { Download, Plus, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useFitFrame } from "@/composables/useFitFrame";
import { saveFiles } from "@/utils/saveFile";
import { canvasToBytes, createCanvas, formatInfo, loadImage, outputFormatOf, replaceExtension } from "../utils";
import { anchorPosition, tilePositions, type Anchor } from "../effects";

/**
 * 图片水印：文字或图片水印，九宫格定位或平铺。
 * 支持多张图片使用同一水印，批量下载。
 * 文字大小按图片短边的百分比计算，不同尺寸的图片效果一致。
 */
const kind = useStoredRef<"text" | "image">("watermark.kind", "text");
const text = useStoredRef("watermark.text", "© Open Tools");
const fontSize = useStoredRef("watermark.fontSize", 5);
const color = useStoredRef("watermark.color", "#ffffff");
const bold = useStoredRef("watermark.bold", true);
const shadow = useStoredRef("watermark.shadow", true);
const logoSize = useStoredRef("watermark.logoSize", 20);
const opacity = useStoredRef("watermark.opacity", 70);
const rotation = useStoredRef("watermark.rotation", 0);
const anchor = useStoredRef<Anchor>("watermark.anchor", "br");
const tiled = useStoredRef("watermark.tiled", false);
const margin = useStoredRef("watermark.margin", 3);
const spacing = useStoredRef("watermark.spacing", 12);

// ---------- 图片与 Logo ----------
interface Item {
  id: number;
  file: File;
  url: string;
  img: HTMLImageElement;
}
const items = shallowRef<Item[]>([]);
const selectedId = ref<number | null>(null);
let nextId = 1;
const selected = computed(() => items.value.find((i) => i.id === selectedId.value) ?? items.value[0] ?? null);

const addFiles = async (files: File[]) => {
  const loaded: Item[] = [];
  for (const file of files) {
    try {
      loaded.push({ id: nextId++, file, url: URL.createObjectURL(file), img: await loadImage(file) });
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

const logo = shallowRef<HTMLImageElement | null>(null);
const onLogo = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) logo.value = await loadImage(file);
};

// ---------- 绘制 ----------

/** 给一张图片加水印，返回新画布 */
const render = (img: HTMLImageElement) => {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const { canvas, ctx } = createCanvas(w, h);
  ctx.drawImage(img, 0, 0);

  const short = Math.min(w, h);
  let markW = 0;
  let markH = 0;
  let drawMark: () => void;

  if (kind.value === "text") {
    if (!text.value.trim()) return canvas;
    const px = Math.max(8, (fontSize.value / 100) * short);
    ctx.font = `${bold.value ? 600 : 400} ${px}px "Segoe UI", "Microsoft YaHei UI", sans-serif`;
    markW = ctx.measureText(text.value).width;
    markH = px * 1.2;
    drawMark = () => {
      ctx.fillStyle = color.value;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (shadow.value) {
        // 淡淡的阴影，让水印在深色和浅色背景上都看得清
        ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
        ctx.shadowBlur = px * 0.15;
        ctx.shadowOffsetY = px * 0.04;
      }
      ctx.fillText(text.value, 0, 0);
    };
  } else {
    const l = logo.value;
    if (!l) return canvas;
    markW = (logoSize.value / 100) * w;
    markH = (markW * l.naturalHeight) / l.naturalWidth;
    drawMark = () => ctx.drawImage(l, -markW / 2, -markH / 2, markW, markH);
  }

  const points = tiled.value
    ? tilePositions({ width: w, height: h }, { width: markW, height: markH }, (spacing.value / 100) * short)
    : [anchorPosition(anchor.value, { width: w, height: h }, { width: markW, height: markH }, (margin.value / 100) * short)];

  ctx.globalAlpha = opacity.value / 100;
  for (const p of points) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((rotation.value * Math.PI) / 180);
    drawMark();
    ctx.restore();
  }
  return canvas;
};

// ---------- 预览 ----------
const view = ref<HTMLCanvasElement>();
const previewSize = computed(() => (selected.value ? { width: selected.value.img.naturalWidth, height: selected.value.img.naturalHeight } : null));
const { observeArea, frameStyle } = useFitFrame(previewSize);

let frame = 0;
const redraw = () => {
  // 拖动滑块时合并到下一帧再画，避免频繁重绘大图
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(async () => {
    await nextTick();
    const v = view.value;
    const item = selected.value;
    if (!v || !item) return;
    const result = render(item.img);
    v.width = result.width;
    v.height = result.height;
    v.getContext("2d")!.drawImage(result, 0, 0);
  });
};
watch(
  [selected, kind, text, fontSize, color, bold, shadow, logo, logoSize, opacity, rotation, anchor, tiled, margin, spacing],
  redraw,
);

// ---------- 导出 ----------
const saving = ref(false);
const download = async () => {
  saving.value = true;
  try {
    const files = [];
    for (const item of items.value) {
      const format = outputFormatOf(item.file.type);
      files.push({
        name: replaceExtension(item.file.name.replace(/(\.[^.]+)?$/, "_水印$1"), formatInfo(format).ext),
        data: await canvasToBytes(render(item.img), format, 0.92),
      });
    }
    await saveFiles(files, "水印图片.zip");
  } finally {
    saving.value = false;
  }
};

const ANCHORS: { value: Anchor; label: string }[] = [
  { value: "tl", label: "左上" },
  { value: "t", label: "上方" },
  { value: "tr", label: "右上" },
  { value: "l", label: "左侧" },
  { value: "c", label: "居中" },
  { value: "r", label: "右侧" },
  { value: "bl", label: "左下" },
  { value: "b", label: "下方" },
  { value: "br", label: "右下" },
];
</script>

<template>
  <div class="watermark">
    <aside class="card panel">
      <section class="section">
        <div class="seg fill">
          <button :class="{ on: kind === 'text' }" @click="kind = 'text'">文字水印</button>
          <button :class="{ on: kind === 'image' }" @click="kind = 'image'">图片水印</button>
        </div>

        <template v-if="kind === 'text'">
          <input v-model="text" class="field" placeholder="水印文字" maxlength="60" />
          <div class="row">
            <input v-model="color" class="color" type="color" title="文字颜色" />
            <label class="check"><input v-model="bold" type="checkbox" />粗体</label>
            <label class="check"><input v-model="shadow" type="checkbox" />阴影</label>
          </div>
          <label class="slider">
            <span>字号</span>
            <input v-model.number="fontSize" type="range" min="1" max="20" step="0.5" />
            <em>{{ fontSize }}%</em>
          </label>
        </template>

        <template v-else>
          <label class="btn">
            <Plus :size="14" />{{ logo ? "更换 Logo" : "选择 Logo 图片" }}
            <input type="file" accept="image/*" hidden @change="onLogo" />
          </label>
          <p class="tip">建议使用背景透明的 PNG</p>
          <label class="slider">
            <span>大小</span>
            <input v-model.number="logoSize" type="range" min="5" max="60" />
            <em>{{ logoSize }}%</em>
          </label>
        </template>
      </section>

      <section class="section">
        <label class="slider">
          <span>透明度</span>
          <input v-model.number="opacity" type="range" min="10" max="100" step="5" />
          <em>{{ opacity }}%</em>
        </label>
        <label class="slider">
          <span>旋转</span>
          <input v-model.number="rotation" type="range" min="-90" max="90" step="5" @dblclick="rotation = 0" />
          <em>{{ rotation }}°</em>
        </label>
      </section>

      <section class="section">
        <h3>
          位置
          <label class="check push"><input v-model="tiled" type="checkbox" />平铺</label>
        </h3>
        <div v-if="!tiled" class="anchors">
          <button v-for="a in ANCHORS" :key="a.value" :class="{ on: anchor === a.value }" :title="a.label" @click="anchor = a.value"><i /></button>
        </div>
        <label class="slider">
          <span>{{ tiled ? "间距" : "边距" }}</span>
          <input v-if="tiled" v-model.number="spacing" type="range" min="2" max="50" />
          <input v-else v-model.number="margin" type="range" min="0" max="15" />
          <em>{{ tiled ? spacing : margin }}%</em>
        </label>
      </section>

      <section class="section">
        <button class="btn primary full" :disabled="saving || !items.length" @click="download">
          <Download :size="14" />{{ saving ? "处理中…" : items.length > 1 ? `下载全部 ${items.length} 张（ZIP）` : "下载图片" }}
        </button>
      </section>
    </aside>

    <section class="card stage">
      <div class="card-title">预览<span class="hint">{{ selected?.file.name }}</span></div>
      <FileDropZone
        v-if="!items.length"
        class="drop"
        accept="image/*"
        multiple
        title="拖入图片，或点击选择（可多选）"
        hint="多张图片会使用同一个水印，可以一起下载；也可以按 Ctrl + V 粘贴截图"
        @files="addFiles"
      />
      <div v-else :ref="observeArea" class="area">
        <div class="frame" :style="frameStyle"><canvas ref="view" /></div>
      </div>
      <div v-if="items.length" class="strip">
        <figure
          v-for="item in items"
          :key="item.id"
          class="thumb"
          :class="{ on: item.id === selected?.id }"
          :title="item.file.name"
          @click="selectedId = item.id"
        >
          <img :src="item.url" alt="" />
          <button class="remove" title="移除" @click.stop="remove(item)"><X :size="11" /></button>
        </figure>
        <FileDropZone compact class="add" accept="image/*" multiple title="" aria-label="继续添加图片" @files="addFiles" />
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
.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}
.section + .section {
  border-top: 1px solid var(--border);
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
.seg.fill {
  display: flex;
}
.seg.fill button {
  flex: 1;
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
.color {
  width: 32px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: none;
  cursor: pointer;
}
.slider {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.slider span {
  flex: 0 0 40px;
}
.slider input {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}
.slider em {
  flex: 0 0 34px;
  font-style: normal;
  text-align: right;
  color: var(--text-3);
}
.tip {
  margin: -4px 0 0;
  font-size: 12px;
  color: var(--text-3);
}
.btn {
  justify-content: center;
}
.btn.full {
  width: 100%;
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
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
