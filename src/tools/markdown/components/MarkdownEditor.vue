<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { FileDown, FileText, FolderOpen, ListTree } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import ToolActions from "@/components/tool/ToolActions.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile } from "@/utils/saveFile";
import MarkdownView from "./MarkdownView.vue";
import { locale } from "@/locales";
import { errorMessage, showError } from "@/utils/errorToast";
import { sampleMarkdown } from "../sample";
import { countWords, renderSafe, useDocxOptions } from "../shared";
import { standaloneHtml } from "../markdownStyle";
import { createImageLoader } from "../images";
import { markdownToDocx } from "../toDocx";

/**
 * Markdown 编辑预览：左侧编辑，右侧实时预览（GitHub 风格，代码高亮）。
 * 可以打开 .md 文件，导出 Word 或单独的 HTML 网页。
 */
const { t } = useI18n();
type Layout = "split" | "edit" | "preview";
const layout = useStoredRef<Layout>("markdown.layout", "split");
const showOutline = useStoredRef("markdown.outline", false);

const source = ref("");
const fileName = ref("");

// 内容较长时，输入停顿后再渲染，打字不卡顿
const rendered = shallowRef(renderSafe(""));
let timer = 0;
watch(source, (text) => {
  clearTimeout(timer);
  timer = window.setTimeout(() => (rendered.value = renderSafe(text)), text.length > 20000 ? 250 : 60);
});

const words = computed(() => countWords(source.value));
const baseName = computed(() => fileName.value.replace(/\.(md|markdown|txt)$/i, "") || rendered.value.headings[0]?.text || t("markdown.untitled"));

// ---------- 打开文件 ----------
const fileInput = ref<HTMLInputElement>();
const openFile = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  source.value = await file.text();
  fileName.value = file.name;
};

// ---------- 导出 ----------
const { options } = useDocxOptions();
const exporting = ref(false);

const exportWord = async () => {
  exporting.value = true;
  try {
    const loader = createImageLoader();
    const data = await markdownToDocx(source.value, { ...options.value, loadImage: (src) => loader.load(src) });
    await saveFile(data, `${baseName.value}.docx`);
  } catch (e) {
    showError(t("markdown.exportFailed", { error: errorMessage(e) }));
  } finally {
    exporting.value = false;
  }
};

const exportHtml = () =>
  saveFile(new TextEncoder().encode(standaloneHtml(baseName.value, renderSafe(source.value).html)), `${baseName.value}.html`);

const view = ref<InstanceType<typeof MarkdownView>>();
const jump = (id: string) => view.value?.root?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth" });

useToolResult(() => source.value.trim());
</script>

<template>
  <ToolActions>
    <div class="seg">
      <button :class="{ on: layout === 'edit' }" @click="layout = 'edit'">{{ t("markdown.edit") }}</button>
      <button :class="{ on: layout === 'split' }" @click="layout = 'split'">{{ t("markdown.split") }}</button>
      <button :class="{ on: layout === 'preview' }" @click="layout = 'preview'">{{ t("markdown.preview") }}</button>
    </div>
    <button class="btn" @click="fileInput?.click()"><FolderOpen :size="14" />{{ t("markdown.open") }}</button>
    <input ref="fileInput" type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden @change="openFile" />
    <button class="btn" :disabled="!source.trim()" @click="exportHtml"><FileText :size="14" />{{ t("markdown.exportHtml") }}</button>
    <button class="btn primary" :disabled="!source.trim() || exporting" @click="exportWord">
      <FileDown :size="14" />{{ exporting ? t("markdown.exporting") : t("markdown.exportWord") }}
    </button>
  </ToolActions>

  <div class="markdown" :class="layout">
    <TextPane
      v-show="layout !== 'preview'"
      v-model="source"
      class="editor"
      :label="fileName || 'Markdown'"
      language="markdown"
      :placeholder="t('markdown.placeholder')"
    >
      <template #actions>
        <span v-if="source" class="count">{{ t("markdown.words", { n: words }) }}</span>
      </template>
    </TextPane>

    <section v-show="layout !== 'edit'" class="card preview">
      <div class="card-title">
        {{ t("markdown.preview") }}
        <button
          v-if="rendered.headings.length"
          class="icon-btn push"
          :class="{ on: showOutline }"
          :title="t('markdown.outline')"
          @click="showOutline = !showOutline"
        >
          <ListTree :size="14" />
        </button>
      </div>
      <div class="preview-body">
        <nav v-if="showOutline && rendered.headings.length" class="outline">
          <a
            v-for="h in rendered.headings"
            :key="h.id"
            :style="{ paddingLeft: `${(h.level - 1) * 12 + 10}px` }"
            :class="`l${h.level}`"
            :title="h.text"
            @click="jump(h.id)"
            >{{ h.text }}</a
          >
        </nav>
        <div class="scroll">
          <MarkdownView v-if="source.trim()" ref="view" :html="rendered.html" />
          <div v-else class="empty">
            <p>{{ t("markdown.emptyPreview") }}</p>
            <button class="btn" @click="source = sampleMarkdown(locale)">{{ t("markdown.insertSample") }}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.markdown {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.editor,
.preview {
  flex: 1 1 0;
  min-width: 0;
}
.count {
  margin-right: 6px;
  font-size: 12px;
  color: var(--text-3);
}
.preview {
  min-height: 0;
}
.push {
  margin-left: auto;
}
.icon-btn.on {
  color: var(--accent);
  background: var(--accent-soft);
}
.preview-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.outline {
  flex: 0 0 200px;
  overflow: auto;
  padding: 10px 6px;
  border-right: 1px solid var(--border);
  background: var(--bg-sunken);
}
.outline a {
  display: block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.outline a:hover {
  background: var(--hover);
  color: var(--text);
}
.outline a.l1 {
  font-weight: 600;
  color: var(--text);
}
.scroll {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 22px 28px 40px;
}
.preview .scroll :deep(.md-body) {
  max-width: 860px;
  margin: 0 auto;
}
.empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-3);
  font-size: 13px;
}
.empty p {
  margin: 0;
}
</style>
