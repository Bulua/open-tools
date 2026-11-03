<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppSelect from "@/components/common/AppSelect.vue";
import { Download, FileText, ImageOff, X } from "lucide-vue-next";
import CheckAll from "@/components/common/CheckAll.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useFileChecks } from "@/composables/useFileChecks";
import { saveFiles } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import MarkdownView from "./MarkdownView.vue";
import { locale } from "@/locales";
import { FONTS, FONT_NAMES_EN, renderSafe, useDocxOptions } from "../shared";
import { createImageLoader, imageSources } from "../images";
import { FONT_SIZES, docxNameOf, markdownToDocx } from "../toDocx";

/**
 * Markdown 转 Word：一次转换多个 .md 文件。
 * 文档里引用的本地图片，和 .md 一起拖入（或直接拖入整个文件夹）即可嵌入 Word。
 */
const { t } = useI18n();
const { font, fontSize, lineSpacing, options } = useDocxOptions();
const fontOptions = computed(() => FONTS.map((f) => ({ value: f, label: locale.value === "zh-CN" ? f : FONT_NAMES_EN[f] ?? f })));
/** 中文用「小四」等字号名，英文直接显示磅数 */
const sizeLabel = (s: { label: string; value: number }) => (locale.value === "zh-CN" ? s.label : `${s.value} pt`);

interface Doc {
  id: number;
  name: string;
  path: string;
  size: number;
  text: string;
}
const docs = shallowRef<Doc[]>([]);
/** 一起拖入的图片，用于查找文档中引用的本地图片 */
const images = shallowRef<{ file: File; path: string }[]>([]);
const selectedId = ref<number | null>(null);
let nextId = 1;

const isMarkdown = (name: string) => /\.(md|markdown|txt)$/i.test(name);

const addEntries = async (entries: { file: File; path: string }[]) => {
  const added: Doc[] = [];
  for (const { file, path } of entries) {
    if (isMarkdown(file.name)) added.push({ id: nextId++, name: file.name, path, size: file.size, text: await file.text() });
  }
  images.value = [...images.value, ...entries.filter((e) => e.file.type.startsWith("image/"))];
  docs.value = [...docs.value, ...added];
  if (!selected.value && added[0]) selectedId.value = added[0].id;
};

const remove = (doc: Doc) => {
  docs.value = docs.value.filter((d) => d !== doc);
  if (selectedId.value === doc.id) selectedId.value = docs.value[0]?.id ?? null;
  if (!docs.value.length) images.value = [];
};

const selected = computed(() => docs.value.find((d) => d.id === selectedId.value) ?? null);
const { isChecked, toggle: toggleFile, checkedItems, allChecked, partlyChecked, toggleAll } = useFileChecks(docs);
const loader = computed(() => createImageLoader(images.value));
/** 每个文档中找不到的本地图片 */
const missing = computed(() => new Map(docs.value.map((d) => [d.id, loader.value.missing(imageSources(d.text), d.path)])));

const preview = shallowRef("");
watch(selected, (doc) => (preview.value = doc ? renderSafe(doc.text).html : ""), { immediate: true });

// ---------- 转换 ----------
const converting = ref(false);
const error = ref("");
const convert = async () => {
  converting.value = true;
  error.value = "";
  try {
    const files = [];
    for (const doc of checkedItems.value) {
      const data = await markdownToDocx(doc.text, { ...options.value, loadImage: (src) => loader.value.load(src, doc.path) });
      files.push({ name: docxNameOf(doc.name), data });
    }
    await saveFiles(files, t("markdown.zipName"));
  } catch (e) {
    error.value = t("markdown.convertFailed", { error: e instanceof Error ? e.message : String(e) });
  } finally {
    converting.value = false;
  }
};

const LINE_SPACINGS = [1, 1.15, 1.5, 2];
const previewStyle = computed(() => ({
  "--doc-font": `Calibri, "${font.value}", serif`,
  "--doc-size": `${fontSize.value * 1.333}px`,
  "--doc-line": String(lineSpacing.value * 1.25),
}));
</script>

<template>
  <div class="md2word">
    <aside class="card panel">
      <section class="section files">
        <h3>
          <CheckAll v-if="docs.length" :checked="allChecked" :partly="partlyChecked" :disabled="converting" @toggle="toggleAll">{{ t("files.title") }}</CheckAll>
          <template v-else>{{ t("files.title") }}</template>
          <span class="push">{{ docs.length > 1 ? t("files.selected", { checked: checkedItems.length, total: docs.length }) : t("files.count", { n: docs.length }) }}</span>
        </h3>
        <ul>
          <li v-for="doc in docs" :key="doc.id" :class="{ on: doc.id === selected?.id, unchecked: !isChecked(doc) }" @click="selectedId = doc.id">
            <input type="checkbox" class="file-check" :title="t('files.checkHint')" :checked="isChecked(doc)" :disabled="converting" @click.stop @change="toggleFile(doc)" />
            <FileText :size="14" class="icon" />
            <span class="name" :title="doc.path">{{ doc.name }}</span>
            <span
              v-if="missing.get(doc.id)?.length"
              class="warn"
              :title="t('markdown.missingImages', { list: missing.get(doc.id)!.join('\n') })"
            >
              <ImageOff :size="13" />{{ missing.get(doc.id)!.length }}
            </span>
            <span v-else class="size">{{ formatBytes(doc.size) }}</span>
            <button class="icon-btn remove" :title="t('files.remove')" @click.stop="remove(doc)"><X :size="13" /></button>
          </li>
        </ul>
        <FileDropZone
          compact
          accept=".md,.markdown,.txt,image/*"
          multiple
          directories
          :paste="false"
          :title="t('markdown.addMore')"
          @entries="addEntries"
        />
        <p v-if="images.length" class="tip">{{ t("markdown.attachedImages", { n: images.length }) }}</p>
      </section>

      <section class="section">
        <h3>{{ t("markdown.bodyFormat") }}</h3>
        <label class="row">
          <span>{{ t("markdown.font") }}</span>
          <AppSelect v-model="font" class="select" size="sm" :options="fontOptions" />
        </label>
        <div class="row">
          <span>{{ t("markdown.fontSize") }}</span>
          <div class="seg">
            <button v-for="s in FONT_SIZES" :key="s.value" :class="{ on: fontSize === s.value }" @click="fontSize = s.value">{{ sizeLabel(s) }}</button>
          </div>
        </div>
        <div class="row">
          <span>{{ t("markdown.lineSpacing") }}</span>
          <div class="seg">
            <button v-for="l in LINE_SPACINGS" :key="l" :class="{ on: lineSpacing === l }" @click="lineSpacing = l">{{ t("markdown.times", { n: l }) }}</button>
          </div>
        </div>
        <p class="tip">{{ t("markdown.headingTip") }}</p>
      </section>

      <section class="section">
        <p v-if="error" class="error">{{ error }}</p>
        <button class="btn primary full" :disabled="converting || !checkedItems.length" @click="convert">
          <Download :size="14" />{{
            converting
              ? t("markdown.converting")
              : docs.length && !checkedItems.length
                ? t("markdown.checkToConvert")
                : docs.length > 1
                  ? t("markdown.convertSelected", { n: checkedItems.length })
                  : t("markdown.convertOne")
          }}
        </button>
      </section>
    </aside>

    <section class="card stage">
      <div class="card-title">
        {{ t("markdown.wordPreview") }}<span class="hint">{{ selected?.name }}</span>
      </div>
      <FileDropZone
        v-if="!docs.length"
        class="drop"
        accept=".md,.markdown,.txt,image/*"
        multiple
        directories
        :title="t('markdown.dropTitle')"
        :hint="t('markdown.dropHint')"
        :paste="false"
        @entries="addEntries"
      />
      <div v-else class="area">
        <div class="paper" :style="previewStyle">
          <MarkdownView :html="preview" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.drop {
  flex: 1;
  margin: 12px;
}
.md2word {
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
.area {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
  background: var(--bg-sunken);
}
/* 模拟 A4 纸：宽 21cm，页边距 2.54cm */
.paper {
  max-width: 794px;
  min-height: 100%;
  margin: 0 auto;
  padding: 72px 96px;
  background: #fff;
  color: #1f1e1d;
  box-shadow: var(--shadow);
}
.paper :deep(.md-body) {
  --text: #1f1e1d;
  --text-2: #6b6a65;
  font-family: var(--doc-font);
  font-size: var(--doc-size);
  line-height: var(--doc-line);
}
.paper :deep(.md-body h1),
.paper :deep(.md-body h2) {
  font-family: Calibri, "黑体", sans-serif;
  font-weight: 700;
  border: none;
}
.paper :deep(.md-body h3),
.paper :deep(.md-body h4) {
  font-family: Calibri, "黑体", sans-serif;
}

.panel {
  flex: 0 0 300px;
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
.files ul {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 240px;
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
.warn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: var(--warning);
}
.remove {
  opacity: 0;
}
.files li:hover .remove {
  opacity: 1;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-2);
}
.row > span {
  flex: 0 0 28px;
}
.row :deep(.select) {
  flex: 1;
}
.btn {
  justify-content: center;
}
</style>
