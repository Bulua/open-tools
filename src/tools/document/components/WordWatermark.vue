<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { Download, FileText, Plus, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFiles } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import DocxPreview from "./DocxPreview.vue";
import { DEFAULT_WATERMARK, addWatermark, watermarkBoxes, watermarkedName, type PageGeometry, type WatermarkImage, type WatermarkOptions } from "../docxWatermark";

/**
 * Word 添加水印：生成 Word 原生水印（与「设计 → 水印」相同），可以在 Word 中修改或删除。
 * 多个文档使用同一水印，一起下载。
 */
const d = DEFAULT_WATERMARK;
const kind = useStoredRef<WatermarkOptions["kind"]>("docxWatermark.kind", d.kind);
const text = useStoredRef("docxWatermark.text", d.text);
const font = useStoredRef("docxWatermark.font", d.font);
const color = useStoredRef("docxWatermark.color", d.color);
const bold = useStoredRef("docxWatermark.bold", d.bold);
const size = useStoredRef("docxWatermark.size", d.size);
const opacity = useStoredRef("docxWatermark.opacity", 50);
const layout = useStoredRef<WatermarkOptions["layout"]>("docxWatermark.layout", d.layout);
const tiled = useStoredRef("docxWatermark.tiled", d.tiled);
const imageScale = useStoredRef("docxWatermark.imageScale", d.imageScale);
const washout = useStoredRef("docxWatermark.washout", d.washout);
const replace = useStoredRef("docxWatermark.replace", d.replace);
const image = shallowRef<(WatermarkImage & { url: string }) | null>(null);

const FONTS = ["宋体", "黑体", "微软雅黑", "楷体", "仿宋", "Arial"];
const PRESETS = ["内部资料", "机密", "严禁复制", "样本", "草稿"];
const SIZES = [
  { label: "自动", value: 0 },
  { label: "36", value: 36 },
  { label: "54", value: 54 },
  { label: "72", value: 72 },
  { label: "96", value: 96 },
];

const options = computed<WatermarkOptions>(() => ({
  kind: kind.value,
  text: text.value,
  font: font.value,
  color: color.value,
  bold: bold.value,
  size: size.value,
  opacity: opacity.value / 100,
  layout: layout.value,
  tiled: tiled.value,
  image: image.value ?? undefined,
  imageScale: imageScale.value,
  washout: washout.value,
  replace: replace.value,
}));

// ---------- 文档 ----------
interface Item {
  id: number;
  file: File;
  data: Uint8Array;
}
const items = shallowRef<Item[]>([]);
const selectedId = ref<number | null>(null);
let nextId = 1;
const selected = computed(() => items.value.find((i) => i.id === selectedId.value) ?? items.value[0] ?? null);

const addFiles = async (files: File[]) => {
  const added: Item[] = [];
  for (const file of files) {
    if (/\.docx$/i.test(file.name)) added.push({ id: nextId++, file, data: new Uint8Array(await file.arrayBuffer()) });
  }
  items.value = [...items.value, ...added];
  if (!selectedId.value && added[0]) selectedId.value = added[0].id;
  error.value = files.some((f) => /\.doc$/i.test(f.name)) ? "旧版 .doc 文件请先在 Word 中「另存为」.docx 再添加" : "";
};
const remove = (item: Item) => {
  items.value = items.value.filter((i) => i !== item);
  if (selectedId.value === item.id) selectedId.value = items.value[0]?.id ?? null;
};

// ---------- 水印图片 ----------
const onImage = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const bitmap = await createImageBitmap(file);
  let blob: Blob = file;
  // Word 水印图片使用 PNG 或 JPEG，其他格式转成 PNG
  if (file.type !== "image/png" && file.type !== "image/jpeg") {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    blob = (await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"))) ?? file;
  }
  if (image.value) URL.revokeObjectURL(image.value.url);
  image.value = {
    data: new Uint8Array(await blob.arrayBuffer()),
    type: blob.type === "image/jpeg" ? "jpeg" : "png",
    width: bitmap.width,
    height: bitmap.height,
    url: URL.createObjectURL(blob),
  };
  bitmap.close();
};

// ---------- 预览：在每一页上叠加水印 ----------
const pt = (v: string) => parseFloat(v) || 0;
const decorate = computed(() => {
  const o = options.value;
  return (page: HTMLElement) => {
    const s = page.style;
    const geometry: PageGeometry = {
      width: pt(s.width),
      height: pt(s.minHeight || s.height),
      left: pt(s.paddingLeft),
      right: pt(s.paddingRight),
      top: pt(s.paddingTop),
      bottom: pt(s.paddingBottom),
    };
    if (!geometry.width || !geometry.height) return;
    if (o.kind === "text" ? !o.text.trim() : !o.image) return;
    const layer = document.createElement("div");
    layer.className = "decoration";
    layer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0";
    // 文档没有记录分页位置时，预览会把一节排成很长的一页，按页面高度重复显示水印
    const repeat = Math.max(1, Math.round(page.offsetHeight / ((geometry.height * 96) / 72)));
    const boxes = watermarkBoxes(o, geometry).map((b) => ({
      ...b,
      x: b.x ?? geometry.left + (geometry.width - geometry.left - geometry.right - b.width) / 2,
      y: b.y ?? geometry.top + (geometry.height - geometry.top - geometry.bottom - b.height) / 2,
    }));
    const placed = Array.from({ length: repeat }, (_, i) => boxes.map((b) => ({ ...b, y: b.y + i * geometry.height }))).flat();
    for (const { x, y, ...b } of placed) {
      const el = document.createElement(o.kind === "image" ? "img" : "div");
      el.style.cssText = `position:absolute;left:${x}pt;top:${y}pt;width:${b.width}pt;height:${b.height}pt;`;
      if (el instanceof HTMLImageElement) {
        el.src = image.value?.url ?? "";
        el.style.opacity = o.washout ? "0.3" : "1";
      } else {
        el.textContent = o.text;
        el.style.cssText +=
          `display:flex;align-items:center;justify-content:center;white-space:nowrap;line-height:1;` +
          `font-family:"${o.font}";font-size:${b.height}pt;font-weight:${o.bold ? 700 : 400};color:${o.color};opacity:${o.opacity};` +
          (o.layout === "diagonal" ? "transform:rotate(-45deg);" : "");
      }
      layer.appendChild(el);
    }
    page.prepend(layer);
  };
});

// ---------- 导出 ----------
const saving = ref(false);
const error = ref("");
watch(options, () => (error.value = ""));

const download = async () => {
  saving.value = true;
  error.value = "";
  try {
    const files = items.value.map((item) => ({ name: watermarkedName(item.file.name), data: addWatermark(item.data, options.value) }));
    await saveFiles(files, "水印文档.zip");
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="docx-wm">
    <aside class="card panel">
      <section class="section">
        <h3>文档<span class="push">{{ items.length }} 个</span></h3>
        <ul class="files">
          <li v-for="item in items" :key="item.id" :class="{ on: item.id === selected?.id }" @click="selectedId = item.id">
            <FileText :size="14" class="icon" />
            <span class="name" :title="item.file.name">{{ item.file.name }}</span>
            <span class="size">{{ formatBytes(item.file.size) }}</span>
            <button class="icon-btn remove" title="移除" @click.stop="remove(item)"><X :size="13" /></button>
          </li>
        </ul>
        <FileDropZone compact accept=".docx,.doc" multiple :paste="false" title="继续添加文档" @files="addFiles" />
      </section>

      <section class="section">
        <div class="seg fill">
          <button :class="{ on: kind === 'text' }" @click="kind = 'text'">文字水印</button>
          <button :class="{ on: kind === 'image' }" @click="kind = 'image'">图片水印</button>
        </div>

        <template v-if="kind === 'text'">
          <input v-model="text" class="field" placeholder="水印文字" maxlength="40" />
          <div class="chips">
            <button v-for="p in PRESETS" :key="p" :class="{ on: text === p }" @click="text = p">{{ p }}</button>
          </div>
          <div class="row">
            <select v-model="font" class="field select" title="字体">
              <option v-for="f in FONTS" :key="f" :value="f">{{ f }}</option>
            </select>
            <input v-model="color" class="color" type="color" title="颜色" />
            <label class="check"><input v-model="bold" type="checkbox" />粗体</label>
          </div>
          <div class="row">
            <span class="label">字号</span>
            <div class="seg">
              <button v-for="s in SIZES" :key="s.value" :class="{ on: size === s.value }" @click="size = s.value">{{ s.label }}</button>
            </div>
          </div>
          <label class="slider">
            <span>透明度</span>
            <input v-model.number="opacity" type="range" min="10" max="100" step="5" />
            <em>{{ opacity }}%</em>
          </label>
        </template>

        <template v-else>
          <label class="btn">
            <img v-if="image" :src="image.url" alt="" class="logo" />
            <Plus v-else :size="14" />{{ image ? "更换图片" : "选择水印图片" }}
            <input type="file" accept="image/*" hidden @change="onImage" />
          </label>
          <label class="slider">
            <span>大小</span>
            <input v-model.number="imageScale" type="range" min="10" max="100" step="5" />
            <em>{{ imageScale }}%</em>
          </label>
          <label class="check"><input v-model="washout" type="checkbox" />冲蚀（变淡，不影响阅读正文）</label>
        </template>
      </section>

      <section class="section">
        <div class="row">
          <span class="label">版式</span>
          <div class="seg">
            <button :class="{ on: layout === 'diagonal' }" :disabled="kind === 'image'" @click="layout = 'diagonal'">斜式</button>
            <button :class="{ on: layout === 'horizontal' }" :disabled="kind === 'image'" @click="layout = 'horizontal'">水平</button>
          </div>
          <label class="check push"><input v-model="tiled" type="checkbox" />平铺</label>
        </div>
        <label class="check"><input v-model="replace" type="checkbox" />删除文档原有的水印</label>
      </section>

      <section class="section">
        <p v-if="error" class="error">{{ error }}</p>
        <button class="btn primary full" :disabled="saving || !items.length" @click="download">
          <Download :size="14" />{{ saving ? "处理中…" : items.length > 1 ? `下载全部 ${items.length} 个（ZIP）` : "下载加水印的文档" }}
        </button>
      </section>
    </aside>

    <section class="card stage">
      <div class="card-title">预览<span v-if="selected" class="hint">{{ selected.file.name }} · 预览排版与 Word 可能略有差异</span></div>
      <FileDropZone
        v-if="!items.length"
        class="drop"
        accept=".docx,.doc"
        multiple
        title="拖入 Word 文档（.docx），或点击选择（可多选）"
        hint="添加的是 Word 原生水印，每一页都有，之后可以在 Word 的「设计 → 水印」中修改或删除"
        :paste="false"
        @files="addFiles"
      />
      <DocxPreview v-else :data="selected?.data ?? null" :decorate="decorate" />
    </section>
  </div>
</template>

<style scoped>
.drop {
  flex: 1;
  margin: 12px;
}
.docx-wm {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.stage {
  flex: 1;
  min-width: 0;
}
.card-title .hint {
  margin-left: 6px;
  font-weight: 400;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel {
  flex: 0 0 300px;
  align-self: flex-start;
  max-height: 100%;
  overflow: auto;
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
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.push {
  margin-left: auto;
  font-weight: 400;
  color: var(--text-3);
}
.files {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 180px;
  overflow: auto;
}
.files li {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 4px 0 8px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}
.files li:hover {
  background: var(--hover);
}
.files li.on {
  background: var(--accent-soft);
}
.icon {
  flex-shrink: 0;
  color: var(--text-3);
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.size {
  font-size: 12px;
  color: var(--text-3);
}
.remove {
  opacity: 0;
}
.files li:hover .remove {
  opacity: 1;
}
.seg.fill {
  display: flex;
}
.seg.fill button {
  flex: 1;
}
.seg button:disabled {
  opacity: 0.4;
  cursor: default;
}
.field {
  height: 32px;
  font-size: 13px;
}
.select {
  flex: 1;
  padding: 0 8px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chips button {
  height: 24px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: none;
  font-size: 12px;
  color: var(--text-2);
}
.chips button:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.chips button.on {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.row .push {
  margin-left: auto;
}
.label {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--text-2);
}
.color {
  flex-shrink: 0;
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
.logo {
  width: 20px;
  height: 20px;
  object-fit: contain;
}
.error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
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
</style>
