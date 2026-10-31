<script setup lang="ts">
import { ref } from "vue";
import { Check, ClipboardPaste, Copy, X } from "lucide-vue-next";
import { useClipboard } from "@/composables/useClipboard";

/**
 * 带标题栏的多行文本框，工具里的输入框/输出框都用它。
 * - 可编辑时右上角提供「粘贴」「清空」
 * - 只读时提供「复制」
 * - 通过 #actions 插槽可以在右上角追加按钮
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
  }>(),
  { placeholder: "", readonly: false, error: "", nowrap: false },
);

const model = defineModel<string>({ default: "" });

const { copied, copy, paste } = useClipboard();
const textarea = ref<HTMLTextAreaElement>();

const onPaste = async () => {
  model.value = await paste();
};

/** 聚焦并选中指定位置的字符，用于定位错误 */
const focusAt = (position: number) => {
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
        <template v-if="!props.readonly">
          <button class="icon-btn" title="粘贴" @click="onPaste"><ClipboardPaste :size="14" /></button>
          <button class="icon-btn" title="清空" @click="model = ''"><X :size="14" /></button>
        </template>
        <button v-else class="icon-btn" :class="{ ok: copied }" title="复制" @click="copy(model)">
          <Check v-if="copied" :size="14" />
          <Copy v-else :size="14" />
        </button>
      </div>
    </header>
    <p v-if="error" class="pane-error">{{ error }}</p>
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
.pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 140px;
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.pane:focus-within {
  border-color: var(--border-strong);
  box-shadow: var(--shadow);
}
.pane.readonly {
  background: var(--bg-sunken);
  box-shadow: none;
}
.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 0 16px;
  font-size: 12px;
  color: var(--text-3);
}
.pane-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
textarea {
  flex: 1;
  width: 100%;
  resize: none;
  border: none;
  outline: none;
  padding: 6px 16px 14px;
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
  padding: 6px 16px 14px;
  color: var(--danger);
  font-size: 13px;
  white-space: pre-wrap;
}
</style>
