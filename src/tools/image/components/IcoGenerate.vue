<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Download, RefreshCw } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile, saveFiles } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { showError } from "@/utils/errorToast";
import { canvasToBytes, createCanvas, loadImage, writeIco } from "../utils";

/**
 * 把图片生成多尺寸 ICO 图标（网站 favicon、Windows 程序图标），也可以导出各尺寸 PNG。
 * 非正方形图片可以选择「完整显示」（四周留透明）或「裁切铺满」。
 */
const { t } = useI18n();
const ALL_SIZES = [16, 24, 32, 48, 64, 128, 256];
const sizes = useStoredRef<number[]>("ico.sizes", [16, 32, 48, 256]);
const fit = useStoredRef<"contain" | "cover">("ico.fit", "contain");

const dropZone = ref<InstanceType<typeof FileDropZone>>();
const img = shallowRef<HTMLImageElement | null>(null);
const fileName = ref("");

const onFiles = async ([file]: File[]) => {
  try {
    img.value = await loadImage(file);
    fileName.value = file.name;
  } catch (e) {
    showError(e);
  }
};

const toggleSize = (s: number) => {
  sizes.value = sizes.value.includes(s) ? sizes.value.filter((x) => x !== s) : [...sizes.value, s].sort((a, b) => a - b);
};

/** 生成一个尺寸的正方形 PNG */
const renderSize = async (source: HTMLImageElement, size: number) => {
  const { canvas, ctx } = createCanvas(size, size);
  ctx.imageSmoothingQuality = "high";
  const { naturalWidth: w, naturalHeight: h } = source;
  const scale = fit.value === "contain" ? Math.min(size / w, size / h) : Math.max(size / w, size / h);
  const dw = w * scale;
  const dh = h * scale;
  ctx.drawImage(source, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return { size, png: await canvasToBytes(canvas, "image/png"), url: canvas.toDataURL("image/png") };
};

const outputs = ref<{ size: number; png: Uint8Array; url: string }[]>([]);
// 选项变化很快时，丢弃过期的生成结果
let run = 0;
watch(
  [img, sizes, fit],
  async () => {
    const id = ++run;
    const source = img.value;
    const result = source ? await Promise.all(sizes.value.map((s) => renderSize(source, s))) : [];
    if (id === run) outputs.value = result;
  },
  { deep: true },
);

const ico = computed(() => (outputs.value.length ? writeIco(outputs.value) : null));
const baseName = computed(() => fileName.value.replace(/\.[^.]+$/, "") || "favicon");

const downloadIco = () => ico.value && saveFile(ico.value, `${baseName.value}.ico`);
const downloadPngs = () =>
  saveFiles(
    outputs.value.map((o) => ({ name: `${baseName.value}-${o.size}.png`, data: o.png })),
    `${baseName.value}-png.zip`,
  );
</script>

<template>
  <div class="ico">
    <!-- 左：设置 -->
    <section class="card options">
      <header class="card-title">
        <span class="file" :title="fileName">{{ fileName || t("image.noImage") }}</span>
        <button v-if="img" class="btn small subtle" :title="t('image.replaceImage')" @click="dropZone?.open()"><RefreshCw :size="14" />{{ t("image.replace") }}</button>
      </header>
      <div class="option-body">
        <div v-if="img" class="option">
          <span class="label">{{ t("image.original") }}</span>
          <span>{{ img.naturalWidth }} × {{ img.naturalHeight }}</span>
        </div>
        <div class="option column">
          <span class="label">{{ t("image.sizes") }}</span>
          <div class="sizes">
            <label v-for="s in ALL_SIZES" :key="s" class="check">
              <input type="checkbox" :checked="sizes.includes(s)" @change="toggleSize(s)" />{{ s }}
            </label>
          </div>
        </div>
        <div v-if="img && img.naturalWidth !== img.naturalHeight" class="option column">
          <span class="label">{{ t("image.nonSquare") }}</span>
          <div class="seg">
            <button :class="{ on: fit === 'contain' }" @click="fit = 'contain'">{{ t("image.contain") }}</button>
            <button :class="{ on: fit === 'cover' }" @click="fit = 'cover'">{{ t("image.cover") }}</button>
          </div>
        </div>
      </div>
    </section>

    <!-- 右：预览与下载 -->
    <section class="card previews">
      <div class="card-title">{{ t("image.preview") }}</div>
      <!-- 加载后隐藏但保留：「更换」按钮由它打开选择框 -->
      <FileDropZone
        v-show="!img"
        ref="dropZone"
        :paste="!img"
        class="drop"
        accept="image/*"
        :title="t('image.dropImage')"
        :hint="t('image.icoHint')"
        @files="onFiles"
      />
      <div v-if="img && outputs.length" class="grid">
        <figure v-for="o in outputs" :key="o.size">
          <div class="tile checker">
            <!-- 小尺寸按原始像素显示，看起来和实际效果一致 -->
            <img :src="o.url" :style="{ width: `${Math.min(o.size, 128)}px`, height: `${Math.min(o.size, 128)}px` }" alt="" />
          </div>
          <figcaption>{{ o.size }} × {{ o.size }}</figcaption>
        </figure>
      </div>
      <p v-else-if="img" class="empty">{{ t("image.needSize") }}</p>

      <footer class="actions">
        <span v-if="ico" class="size">{{ t("image.icoSize", { size: formatBytes(ico.length) }) }}</span>
        <button class="btn" :disabled="!outputs.length" @click="downloadPngs"><Download :size="14" />{{ t("image.downloadPng") }}{{ outputs.length > 1 ? t("image.zipSuffix") : "" }}</button>
        <button class="btn primary" :disabled="!ico" @click="downloadIco"><Download :size="14" />{{ t("image.downloadIco") }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
/* 左侧设置、右侧预览 */
.ico {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  align-items: start;
  gap: 14px;
}
.drop {
  margin: 12px;
  min-height: 300px;
}
.option-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px;
}
.option {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}
.option.column {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.label {
  flex: 0 0 56px;
  font-size: 12px;
  color: var(--text-3);
}
.sizes {
  display: grid;
  grid-template-columns: repeat(4, auto);
  gap: 8px 16px;
}
.file {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 20px;
  padding: 20px;
}
figure {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.tile {
  display: grid;
  place-items: center;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.tile img {
  image-rendering: pixelated;
}
figcaption {
  font-size: 12px;
  color: var(--text-3);
}
.checker {
  background-color: var(--surface);
  background-image:
    linear-gradient(45deg, var(--active) 25%, transparent 25%),
    linear-gradient(-45deg, var(--active) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--active) 75%),
    linear-gradient(-45deg, transparent 75%, var(--active) 75%);
  background-size: 12px 12px;
  background-position: 0 0, 0 6px, 6px -6px, -6px 0;
}
.empty {
  margin: 4px 16px 14px;
  font-size: 12px;
  color: var(--text-3);
}
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 12px 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-sunken);
}
.size {
  margin-right: auto;
  font-size: 12px;
  color: var(--text-3);
}
</style>
