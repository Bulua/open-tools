<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { Download, FileText, Image as ImageIcon, Shapes, X } from "lucide-vue-next";
import CheckAll from "@/components/common/CheckAll.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFileChecks } from "@/composables/useFileChecks";
import { saveFiles } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import DocxPreview from "./DocxPreview.vue";
import { removeFound, scanDocx, unwatermarkedName, type DocxScan, type FoundWatermark } from "../docxUnwatermark";

/**
 * Word 去水印：自动找出文档里的水印，确定是水印的默认勾选，不确定的列出来由用户决定。
 * 右侧预览去掉勾选项后的文档；多个文档各自按勾选处理，一起下载。
 */
interface Item {
  id: number;
  file: File;
  scan?: DocxScan;
  error?: string;
  /** 勾选要删除的水印 */
  checked: string[];
  /** 缩略图：包内图片路径 → blob URL */
  thumbs: Record<string, string>;
}
const items = ref<Item[]>([]);
const selectedId = ref<number | null>(null);
let nextId = 1;
const selected = computed(() => items.value.find((i) => i.id === selectedId.value) ?? null);
const { isChecked, toggle: toggleFile, checkedItems, allChecked, partlyChecked, toggleAll } = useFileChecks(items);
const error = ref("");

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", webp: "image/webp", svg: "image/svg+xml" };
const thumbsOf = (scan: DocxScan) => {
  const thumbs: Record<string, string> = {};
  for (const f of scan.found) {
    const type = f.image && MIME[f.image.split(".").pop()!.toLowerCase()];
    // EMF、WMF 等浏览器无法显示的格式不显示缩略图
    if (f.image && type && scan.files[f.image] && !thumbs[f.image]) thumbs[f.image] = URL.createObjectURL(new Blob([scan.files[f.image] as Uint8Array<ArrayBuffer>], { type }));
  }
  return thumbs;
};

const addFiles = async (files: File[]) => {
  const added: Item[] = [];
  for (const file of files) {
    if (!/\.docx$/i.test(file.name)) continue;
    const item: Item = { id: nextId++, file, checked: [], thumbs: {} };
    try {
      const scan = markRaw(scanDocx(new Uint8Array(await file.arrayBuffer())));
      item.scan = scan;
      item.checked = scan.found.filter((f) => f.checked).map((f) => f.key);
      item.thumbs = thumbsOf(scan);
    } catch (e) {
      item.error = e instanceof Error ? e.message : String(e);
    }
    added.push(item);
  }
  items.value = [...items.value, ...added];
  if (!selectedId.value && added[0]) selectedId.value = added[0].id;
  error.value = files.some((f) => /\.doc$/i.test(f.name)) ? "旧版 .doc 文件请先在 Word 中「另存为」.docx 再添加" : "";
};
const revoke = (item: Item) => Object.values(item.thumbs).forEach((u) => URL.revokeObjectURL(u));
const remove = (item: Item) => {
  revoke(item);
  items.value = items.value.filter((i) => i !== item);
  if (selectedId.value === item.id) selectedId.value = items.value[0]?.id ?? null;
};
onBeforeUnmount(() => items.value.forEach(revoke));

const toggle = (item: Item, f: FoundWatermark) => {
  item.checked = item.checked.includes(f.key) ? item.checked.filter((k) => k !== f.key) : [...item.checked, f.key];
};

// ---------- 预览：去掉勾选项后的文档 ----------
const preview = shallowRef<Uint8Array | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [selected.value?.id, selected.value?.checked],
  () => {
    clearTimeout(timer);
    // 连续勾选时稍等一下再重新排版
    timer = setTimeout(() => {
      const item = selected.value;
      preview.value = item?.scan ? removeFound(item.scan, item.checked) : null;
    }, 150);
  },
  { immediate: true },
);

// ---------- 导出 ----------
const ready = computed(() => checkedItems.value.filter((i) => i.scan));
const exporting = ref(false);
const exportAll = async () => {
  exporting.value = true;
  try {
    await saveFiles(
      ready.value.map((i) => ({ name: unwatermarkedName(i.file.name), data: removeFound(i.scan!, i.checked) })),
      "Word 去水印.zip",
    );
  } finally {
    exporting.value = false;
  }
};

const WHERE = { header: "页眉", body: "正文", page: "页面" };
const summary = (item: Item) => {
  if (item.error) return "无法读取";
  const n = item.scan?.found.length ?? 0;
  return n ? `${item.checked.length} / ${n} 项` : "没有水印";
};
</script>

<template>
  <div class="unwatermark">
    <aside class="card panel">
      <section class="section">
        <h3>
          <CheckAll v-if="items.length" :checked="allChecked" :partly="partlyChecked" :disabled="exporting" @toggle="toggleAll">文档</CheckAll>
          <template v-else>文档</template>
          <span class="push">{{ items.length > 1 ? `已选 ${checkedItems.length} / ${items.length} 个` : `${items.length} 个` }}</span>
        </h3>
        <ul class="files">
          <li v-for="item in items" :key="item.id" :class="{ on: item.id === selected?.id, unchecked: !isChecked(item) }" @click="selectedId = item.id">
            <input type="checkbox" class="file-check" title="勾选的文档才处理" :checked="isChecked(item)" :disabled="exporting" @click.stop @change="toggleFile(item)" />
            <FileText :size="14" class="icon" />
            <span class="name" :title="item.file.name">{{ item.file.name }}</span>
            <span class="size" :class="{ bad: item.error }" :title="formatBytes(item.file.size)">{{ summary(item) }}</span>
            <button class="icon-btn remove" title="移除" @click.stop="remove(item)"><X :size="13" /></button>
          </li>
        </ul>
        <p v-if="error" class="error">{{ error }}</p>
        <FileDropZone compact accept=".docx" multiple :paste="false" title="继续添加文档" @files="addFiles" />
      </section>

      <section v-if="selected" class="section">
        <h3>找到的水印<span class="push">勾选的会被删除</span></h3>
        <p v-if="selected.error" class="error">{{ selected.error }}</p>
        <p v-else-if="!selected.scan?.found.length" class="note">
          没有找到水印。如果文档里看得到水印，它可能是图片的一部分（例如扫描件、截图），这种无法去除。
        </p>
        <ul v-else class="found">
          <li v-for="f in selected.scan.found" :key="f.key" :class="{ off: !selected.checked.includes(f.key) }" @click="toggle(selected, f)">
            <input type="checkbox" :checked="selected.checked.includes(f.key)" @click.stop="toggle(selected, f)" />
            <span class="thumb">
              <img v-if="f.image && selected.thumbs[f.image]" :src="selected.thumbs[f.image]" alt="" />
              <span v-else-if="f.kind === 'background' && !f.image" class="swatch" />
              <ImageIcon v-else-if="f.image" :size="16" />
              <span v-else-if="f.text" class="letter">{{ f.text.slice(0, 1) }}</span>
              <Shapes v-else :size="16" />
            </span>
            <span class="info">
              <span class="title">
                {{ f.label }}<template v-if="f.text">「{{ f.text.length > 16 ? f.text.slice(0, 16) + "…" : f.text }}」</template>
                <em v-if="f.count > 1">× {{ f.count }}</em>
              </span>
              <span class="reason" :class="{ unsure: !f.sure }">{{ WHERE[f.where] }} · {{ f.reason }}</span>
            </span>
          </li>
        </ul>
      </section>

      <section class="section">
        <button class="btn primary full" :disabled="!ready.length || exporting" @click="exportAll">
          <Download :size="14" />{{ !checkedItems.length && items.length ? "请勾选要处理的文档" : ready.length > 1 ? `去除并下载选中的 ${ready.length} 个` : "去除水印并下载" }}
        </button>
        <p class="tip">只删除勾选的水印，正文和格式不变。预览中可能显示不出 Word 水印，以下载后在 Word 中打开为准。</p>
      </section>
    </aside>

    <section class="card stage">
      <div class="card-title">预览（去除后）<span class="hint">{{ selected?.file.name }}</span></div>
      <FileDropZone
        v-if="!items.length"
        class="drop"
        accept=".docx"
        multiple
        title="拖入 Word 文档，或点击选择（可多选）"
        hint="自动找出 Word、WPS 添加的水印，以及页眉里的艺术字、半透明图片等自制水印"
        :paste="false"
        @files="addFiles"
      />
      <DocxPreview v-else :data="preview" />
    </section>
  </div>
</template>

<style scoped>
.drop {
  flex: 1;
  margin: 12px;
}
.unwatermark {
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
  flex: 0 0 320px;
  align-self: flex-start;
  max-height: 100%;
  overflow: auto;
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
.files,
.found {
  margin: 0;
  padding: 0;
  list-style: none;
}
.files {
  max-height: 220px;
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
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-3);
}
.bad {
  color: var(--danger);
}
.remove {
  opacity: 0;
}
.files li:hover .remove {
  opacity: 1;
}
.found {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.found li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
}
.found li:hover {
  background: var(--hover);
}
.found li.off .thumb,
.found li.off .title {
  opacity: 0.55;
}
.found input {
  flex-shrink: 0;
  margin: 0;
  accent-color: var(--accent);
}
.thumb {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--bg-sunken);
  color: var(--text-3);
  overflow: hidden;
}
.thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.letter {
  font-size: 16px;
  color: var(--text-2);
}
.swatch {
  width: 20px;
  height: 20px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: linear-gradient(135deg, var(--surface) 50%, var(--active) 50%);
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.title {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title em {
  margin-left: 4px;
  font-style: normal;
  font-size: 12px;
  color: var(--text-3);
}
.reason {
  font-size: 11.5px;
  color: var(--text-3);
}
.reason.unsure {
  color: var(--warning);
}
.note {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-sunken);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
}
.tip {
  line-height: 1.6;
}
.error {
  word-break: break-all;
}
.btn {
  justify-content: center;
}
</style>
