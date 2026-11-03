<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Download, Plus, X } from "lucide-vue-next";
import ColorPicker from "@/components/common/ColorPicker.vue";
import CheckAll from "@/components/common/CheckAll.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFileChecks } from "@/composables/useFileChecks";
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
const { t } = useI18n();
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
const { isChecked, toggle: toggleFile, checkedItems, allChecked, partlyChecked, toggleAll } = useFileChecks(items);

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
    for (const item of checkedItems.value) {
      const format = outputFormatOf(item.file.type);
      files.push({
        name: replaceExtension(item.file.name.replace(/(\.[^.]+)?$/, `_${t("image.watermarkSuffix")}$1`), formatInfo(format).ext),
        data: await canvasToBytes(render(item.img), format, 0.92),
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
          <button :class="{ on: kind === 'text' }" @click="kind = 'text'">{{ t("image.textWatermark") }}</button>
          <button :class="{ on: kind === 'image' }" @click="kind = 'image'">{{ t("image.imageWatermark") }}</button>
        </div>

        <template v-if="kind === 'text'">
          <input v-model="text" class="field" :placeholder="t('image.watermarkText')" maxlength="60" />
          <div class="row">
            <ColorPicker v-model="color" :title="t('image.textColor')" />
            <label class="check"><input v-model="bold" type="checkbox" />{{ t("image.bold") }}</label>
            <label class="check"><input v-model="shadow" type="checkbox" />{{ t("image.shadow") }}</label>
          </div>
          <label class="slider">
            <span>{{ t("image.fontSize") }}</span>
            <input v-model.number="fontSize" type="range" min="1" max="20" step="0.5" />
            <em>{{ fontSize }}%</em>
          </label>
        </template>

        <template v-else>
          <label class="btn">
            <Plus :size="14" />{{ logo ? t("image.replaceLogo") : t("image.chooseLogo") }}
            <input type="file" accept="image/*" hidden @change="onLogo" />
          </label>
          <p class="tip">{{ t("image.logoTip") }}</p>
          <label class="slider">
            <span>{{ t("image.size") }}</span>
            <input v-model.number="logoSize" type="range" min="5" max="60" />
            <em>{{ logoSize }}%</em>
          </label>
        </template>
      </section>

      <section class="section">
        <label class="slider">
          <span>{{ t("image.opacity") }}</span>
          <input v-model.number="opacity" type="range" min="10" max="100" step="5" />
          <em>{{ opacity }}%</em>
        </label>
        <label class="slider">
          <span>{{ t("image.rotation") }}</span>
          <input v-model.number="rotation" type="range" min="-90" max="90" step="5" @dblclick="rotation = 0" />
          <em>{{ rotation }}°</em>
        </label>
      </section>

      <section class="section">
        <h3>
          {{ t("image.position") }}
          <label class="check push"><input v-model="tiled" type="checkbox" />{{ t("image.tiled") }}</label>
        </h3>
        <div v-if="!tiled" class="anchors">
          <button v-for="a in ANCHORS" :key="a" :class="{ on: anchor === a }" :title="t(`image.${a}`)" @click="anchor = a"><i /></button>
        </div>
        <label class="slider">
          <span>{{ tiled ? t("image.gap") : t("image.margin") }}</span>
          <input v-if="tiled" v-model.number="spacing" type="range" min="2" max="50" />
          <input v-else v-model.number="margin" type="range" min="0" max="15" />
          <em>{{ tiled ? spacing : margin }}%</em>
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
        <div class="frame" :style="frameStyle"><canvas ref="view" /></div>
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
