<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-vue-next";
import ColorPicker from "@/components/common/ColorPicker.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useFitFrame } from "@/composables/useFitFrame";
import { saveFile } from "@/utils/saveFile";
import { IMAGE_FORMATS, canvasToBytes, formatInfo, loadImage, type ImageFormat } from "../utils";
import { contentBounds, stitchLayout, type Box, type StitchDirection } from "../effects";

/**
 * 图片拼接：多张图片横向、纵向、按宫格拼成一张，或自由摆放。
 * 自由模式下可以在预览上拖动图片调整位置，拖动右下角缩放（保持比例）。
 */
type Mode = StitchDirection | "free";
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
  items.value = items.value.filter((i) => i !== item);
  delete freeBoxes.value[item.id];
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
      direction: direction.value === "free" ? lastAuto.value : direction.value,
      columns: columns.value,
      gap: gap.value,
      padding: padding.value,
      unify: unify.value,
    },
  );
  const scale = l.width ? Math.min(1, MAX_SIDE / l.width, MAX_SIDE / l.height, Math.sqrt(MAX_AREA / (l.width * l.height))) : 1;
  return { ...l, scale, outWidth: Math.round(l.width * scale), outHeight: Math.round(l.height * scale) };
});

// ---------- 自由摆放 ----------

/** 每张图片在画布上的位置和大小（输出像素），z 越大越靠上 */
const freeBoxes = ref<Record<number, Box & { z: number }>>({});
const freeSize = ref({ width: 1200, height: 800 });
const selectedId = ref<number | null>(null);
const topZ = () => Math.max(0, ...Object.values(freeBoxes.value).map((b) => b.z));

/** 从当前的自动排列开始，方便在此基础上微调 */
const initFree = () => {
  const l = autoLayout.value;
  freeSize.value = { width: l.outWidth || 1200, height: l.outHeight || 800 };
  freeBoxes.value = Object.fromEntries(
    items.value.map((item, i) => {
      const b = l.boxes[i];
      return [item.id, { x: b.x * l.scale, y: b.y * l.scale, w: b.w * l.scale, h: b.h * l.scale, z: i }];
    }),
  );
};

/** 新加入的图片放在左上角附近，缩小到画布的一半以内 */
const placeMissing = () => {
  let offset = 0;
  for (const item of items.value) {
    if (freeBoxes.value[item.id]) continue;
    const { naturalWidth: w, naturalHeight: h } = item.img;
    const s = Math.min(1, (freeSize.value.width * 0.5) / w, (freeSize.value.height * 0.5) / h);
    freeBoxes.value[item.id] = { x: 20 + offset, y: 20 + offset, w: w * s, h: h * s, z: topZ() + 1 };
    offset += 30;
  }
};

watch(direction, (mode, previous) => {
  if (mode !== "free") {
    lastAuto.value = mode;
    return;
  }
  if (previous && previous !== "free") lastAuto.value = previous;
  if (!Object.keys(freeBoxes.value).length) initFree();
  else placeMissing();
});

/** 画布缩小到刚好包住所有图片（四周留外边距） */
const fitContent = () => {
  const boxes = Object.values(freeBoxes.value);
  if (!boxes.length) return;
  const b = contentBounds(boxes);
  const p = padding.value;
  for (const box of boxes) {
    box.x += p - b.x;
    box.y += p - b.y;
  }
  freeSize.value = { width: Math.round(b.w + p * 2), height: Math.round(b.h + p * 2) };
};

const setFreeSize = (key: "width" | "height", e: Event) => {
  freeSize.value = { ...freeSize.value, [key]: Math.min(MAX_SIDE, Math.max(10, toNumber(e, MAX_SIDE))) };
};

/** 拖动移动，或拖动右下角缩放（保持比例） */
const startDrag = (e: PointerEvent, item: Item, mode: "move" | "resize") => {
  const box = freeBoxes.value[item.id];
  const frameEl = (e.currentTarget as HTMLElement).closest(".frame") as HTMLElement | null;
  if (!box || !frameEl) return;
  e.preventDefault();
  selectedId.value = item.id;
  box.z = topZ() + 1;

  const scale = freeSize.value.width / frameEl.getBoundingClientRect().width;
  const start = { ...box };
  const [sx, sy] = [e.clientX, e.clientY];
  const ratio = start.h / start.w;

  const onMove = (ev: PointerEvent) => {
    const dx = (ev.clientX - sx) * scale;
    const dy = (ev.clientY - sy) * scale;
    if (mode === "move") {
      // 至少留 20 像素在画布内，防止图片被拖丢
      box.x = Math.min(freeSize.value.width - 20, Math.max(20 - start.w, start.x + dx));
      box.y = Math.min(freeSize.value.height - 20, Math.max(20 - start.h, start.y + dy));
    } else {
      const w = Math.max(20, start.w + Math.max(dx, dy / ratio));
      box.w = w;
      box.h = w * ratio;
    }
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
};

/** 自由模式下图片框在预览上的位置（百分比，跟随预览缩放） */
const boxStyle = (id: number) => {
  const b = freeBoxes.value[id];
  if (!b) return {};
  const { width, height } = freeSize.value;
  return {
    left: `${(b.x / width) * 100}%`,
    top: `${(b.y / height) * 100}%`,
    width: `${(b.w / width) * 100}%`,
    height: `${(b.h / height) * 100}%`,
    zIndex: b.z + 1,
  };
};

// ---------- 最终布局 ----------
const layout = computed(() => {
  if (direction.value !== "free") return autoLayout.value;
  const { width, height } = freeSize.value;
  return {
    width,
    height,
    boxes: items.value.map((i) => freeBoxes.value[i.id] ?? { x: 0, y: 0, w: 0, h: 0 }),
    scale: 1,
    outWidth: width,
    outHeight: height,
  };
});

const canvas = ref<HTMLCanvasElement>();
const outSize = computed(() => (items.value.length ? { width: layout.value.outWidth, height: layout.value.outHeight } : null));
const { observeArea, frameStyle } = useFitFrame(outSize);

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
  if (await saveFile(bytes, `拼接图片.${formatInfo(format.value).ext}`)) {
    saved.value = true;
    setTimeout(() => (saved.value = false), 1500);
  }
};

const DIRECTIONS: { value: Mode; label: string }[] = [
  { value: "vertical", label: "纵向" },
  { value: "horizontal", label: "横向" },
  { value: "grid", label: "宫格" },
  { value: "free", label: "自由" },
];
const toNumber = (e: Event, max: number) => Math.min(max, Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)));
</script>

<template>
  <div class="stitch">
    <!-- 左：设置 -->
    <aside class="card settings">
      <div class="card-title">拼接设置</div>

      <section class="section">
        <h3>排列方式</h3>
        <div class="seg fill">
          <button v-for="d in DIRECTIONS" :key="d.value" :class="{ on: direction === d.value }" @click="direction = d.value">
            {{ d.label }}
          </button>
        </div>
        <label v-if="direction === 'grid'" class="row">
          <span>每行</span>
          <input class="field small" type="number" min="1" max="10" :value="columns" @change="columns = Math.max(1, toNumber($event, 10))" />
          <span>张</span>
        </label>
        <label v-if="direction !== 'free'" class="check">
          <input v-model="unify" type="checkbox" />{{ direction === "horizontal" ? "统一高度" : "统一宽度" }}
        </label>
        <template v-else>
          <div class="row">
            <span>画布</span>
            <input class="field small wide" type="number" min="10" :value="freeSize.width" @change="setFreeSize('width', $event)" />
            <span>×</span>
            <input class="field small wide" type="number" min="10" :value="freeSize.height" @change="setFreeSize('height', $event)" />
          </div>
          <div class="row">
            <button class="btn small" title="画布缩小到刚好包住所有图片" @click="fitContent">适应内容</button>
            <button class="btn small subtle" title="恢复为之前自动排列的位置" @click="initFree">重新排列</button>
          </div>
          <p class="tip">在右侧拖动图片调整位置，拖动右下角圆点缩放</p>
        </template>
      </section>

      <section class="section">
        <h3>间距</h3>
        <div class="row">
          <template v-if="direction !== 'free'">
            <span>图片间</span>
            <input class="field small" type="number" min="0" :value="gap" @change="gap = toNumber($event, 500)" />
          </template>
          <span>外边距</span>
          <input class="field small" type="number" min="0" :value="padding" @change="padding = toNumber($event, 500)" />
        </div>
      </section>

      <section class="section">
        <h3>背景</h3>
        <div class="row">
          <ColorPicker v-model="background" :disabled="transparent" />
          <span class="mono">{{ transparent ? "透明" : background }}</span>
          <label class="check push"><input v-model="transparent" type="checkbox" />透明</label>
        </div>
      </section>

      <section class="section">
        <h3>导出</h3>
        <div class="seg fill">
          <button v-for="f in IMAGE_FORMATS" :key="f.value" :class="{ on: format === f.value }" @click="format = f.value">
            {{ f.label }}
          </button>
        </div>
        <label v-if="formatInfo(format).lossy" class="slider">
          <span>质量</span>
          <input v-model.number="quality" type="range" min="10" max="100" step="5" />
          <em>{{ quality }}%</em>
        </label>
        <p v-if="items.length" class="tip">
          输出 {{ layout.outWidth }} × {{ layout.outHeight }}
          <template v-if="layout.scale < 1">（图片太大，已自动缩小）</template>
          <template v-if="transparent && format === 'image/jpeg'"><br />JPG 不支持透明，背景会是白色</template>
        </p>
        <button class="btn primary full" :disabled="!items.length" @click="download">
          <Download :size="14" />{{ saved ? "已保存" : "下载拼接图" }}
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
        title="拖入多张图片，或点击选择"
        hint="按添加顺序拼接，之后可以调整顺序；也可以按 Ctrl + V 粘贴截图"
        @files="addFiles"
      />

      <template v-else>
        <div class="card-title">预览</div>
        <div :ref="observeArea" class="area checker" @pointerdown.self="selectedId = null">
          <div class="frame" :style="frameStyle">
            <canvas ref="canvas" />
            <!-- 自由模式：每张图片上覆盖一个可拖动的框 -->
            <template v-if="direction === 'free'">
              <div
                v-for="item in items"
                :key="item.id"
                class="free-box"
                :class="{ selected: selectedId === item.id }"
                :style="boxStyle(item.id)"
                :title="item.name"
                @pointerdown="startDrag($event, item, 'move')"
              >
                <span class="handle" title="拖动缩放" @pointerdown.stop="startDrag($event, item, 'resize')" />
              </div>
            </template>
          </div>
        </div>

        <!-- 图片顺序：左右移动、移除、继续添加 -->
        <div class="strip">
          <figure v-for="(item, i) in items" :key="item.id" class="thumb">
            <img :src="item.url" :alt="item.name" :title="item.name" />
            <span class="index">{{ i + 1 }}</span>
            <div class="thumb-actions">
              <button v-if="direction !== 'free'" title="前移" :disabled="i === 0" @click="move(i, -1)"><ChevronLeft :size="12" /></button>
              <button title="移除" @click="remove(item)"><X :size="12" /></button>
              <button v-if="direction !== 'free'" title="后移" :disabled="i === items.length - 1" @click="move(i, 1)"><ChevronRight :size="12" /></button>
            </div>
          </figure>
          <FileDropZone ref="dropZone" compact class="add" accept="image/*" multiple title="" aria-label="继续添加图片" @files="addFiles" />
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
