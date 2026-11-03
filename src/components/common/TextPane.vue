<script setup lang="ts">
import { defineAsyncComponent, ref } from "vue";
import { Check, ChevronsDownUp, ChevronsUpDown, ClipboardPaste, Copy, X } from "lucide-vue-next";
import { useClipboard } from "@/composables/useClipboard";
import { useI18n } from "vue-i18n";
import type CodeEditorComponent from "./CodeEditor.vue";
import type { EditorError } from "./CodeEditor.vue";
import type { TextMark } from "./codeEditorExtensions";

// 编辑器体积较大，用到时再加载
const CodeEditor = defineAsyncComponent(() => import("./CodeEditor.vue"));

/**
 * 带标题栏的多行文本框，工具里的输入框/输出框都用它。
 * - 可编辑时右上角提供「粘贴」「清空」，只读时提供「复制」
 * - 指定 language 时变成代码编辑器：带行号；json 还有语法高亮、折叠和「全部折叠/展开」
 * - 通过 #actions 插槽可以在右上角追加内容
 * - 通过 #body 插槽可以替换内容区（例如结果的树形视图），标题栏保持一致
 */
const props = withDefaults(
  defineProps<{
    label: string;
    placeholder?: string;
    readonly?: boolean;
    /** 显示错误信息替代文本内容 */
    error?: string;
    /** 不自动换行（适合格式化后的代码） */
    nowrap?: boolean;
    /** 代码语言，设置后使用代码编辑器；text 为纯文本（带行号，可以高亮区间） */
    language?: "json" | "markdown" | "text";
    /** 代码编辑器中标记的错误位置 */
    codeError?: EditorError | null;
    /** 代码编辑器中高亮的区间 */
    codeMarks?: TextMark[];
  }>(),
  { placeholder: "", readonly: false, error: "", nowrap: false, language: undefined, codeError: null, codeMarks: () => [] },
);
const { t } = useI18n();

const model = defineModel<string>({ default: "" });

const { copied, copy, paste } = useClipboard();
const textarea = ref<HTMLTextAreaElement>();
const editor = ref<InstanceType<typeof CodeEditorComponent>>();

const onPaste = async () => {
  model.value = await paste();
};

/** 聚焦并选中指定位置的字符，用于定位错误 */
const focusAt = (position: number) => {
  if (editor.value) return editor.value.focusAt(position);
  const el = textarea.value;
  if (!el) return;
  el.focus();
  el.setSelectionRange(position, position + 1);
};

defineExpose({ focusAt });
</script>

<template>
  <section class="pane" :class="{ readonly: props.readonly, nowrap: props.nowrap }">
    <header class="pane-head">
      <span class="pane-label">{{ label }}</span>
      <div class="pane-actions">
        <slot name="actions" />
        <template v-if="language === 'json' && !$slots.body">
          <button class="icon-btn" :title="t('common.foldAll')" @click="editor?.foldAll()"><ChevronsDownUp :size="14" /></button>
          <button class="icon-btn" :title="t('common.unfoldAll')" @click="editor?.unfoldAll()"><ChevronsUpDown :size="14" /></button>
        </template>
        <template v-if="!props.readonly">
          <button class="icon-btn" :title="t('common.paste')" @click="onPaste"><ClipboardPaste :size="14" /></button>
          <button class="icon-btn" :title="t('common.clear')" @click="model = ''"><X :size="14" /></button>
        </template>
        <button v-else class="icon-btn" :class="{ ok: copied }" :title="t('common.copy')" @click="copy(model)">
          <Check v-if="copied" :size="14" />
          <Copy v-else :size="14" />
        </button>
      </div>
    </header>
    <p v-if="error" class="pane-error">{{ error }}</p>
    <slot v-else-if="$slots.body" name="body" />
    <CodeEditor
      v-else-if="language"
      ref="editor"
      v-model="model"
      :language="language"
      :readonly="props.readonly"
      :placeholder="placeholder"
      :error="codeError"
      :marks="codeMarks"
      :wrap="!props.nowrap"
    />
    <textarea
      v-else
      ref="textarea"
      v-model="model"
      :readonly="props.readonly"
      :placeholder="placeholder"
      spellcheck="false"
    />
  </section>
</template>

<style scoped>
/* 扁平面板：细边框、无阴影，顶部一条标题栏放名称和操作 */
.pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 140px;
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: border-color 0.15s;
}
.pane:focus-within {
  border-color: var(--border-strong);
}
.pane-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  padding: 0 6px 0 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
}
.pane-label {
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.pane:focus-within .pane-label {
  color: var(--text);
}
.pane-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  min-width: 0;
  margin-left: 12px;
}
textarea {
  flex: 1;
  width: 100%;
  resize: none;
  border: none;
  outline: none;
  padding: 10px 14px 14px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
  word-break: break-all;
  overflow: auto;
}
.nowrap textarea {
  white-space: pre;
  word-break: normal;
}
textarea::placeholder {
  color: var(--text-3);
  font-family: var(--font-sans);
}
.pane-error {
  margin: 0;
  padding: 10px 14px 14px;
  color: var(--danger);
  font-size: 13px;
  white-space: pre-wrap;
}
</style>
