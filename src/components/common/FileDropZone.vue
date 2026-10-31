<script setup lang="ts">
import { ref } from "vue";
import { FilePlus2 } from "lucide-vue-next";
import { useWindowEvent } from "@/composables/useWindowEvent";

/**
 * 文件拖放区：可以拖入、点击选择，或按 Ctrl+V 粘贴（截图、复制的文件）。
 * 通过 ref 调用 open() 可以在别处打开文件选择框，例如「更换图片」按钮。
 */
const props = withDefaults(
  defineProps<{
    /** 同 <input accept>，例如 "image/*" */
    accept?: string;
    multiple?: boolean;
    title?: string;
    hint?: string;
    /** 是否监听 Ctrl+V 粘贴 */
    paste?: boolean;
    /** 紧凑样式：单行、矮一些，适合放在列表下方「继续添加」 */
    compact?: boolean;
  }>(),
  { accept: "", multiple: false, title: "拖入文件，或点击选择", hint: "", paste: true, compact: false },
);

const emit = defineEmits<{ files: [files: File[]] }>();

const input = ref<HTMLInputElement>();
const dragging = ref(false);

const accepts = (file: File) => {
  if (!props.accept) return true;
  return props.accept.split(",").some((rule) => {
    const r = rule.trim();
    if (r.endsWith("/*")) return file.type.startsWith(r.slice(0, -1));
    if (r.startsWith(".")) return file.name.toLowerCase().endsWith(r.toLowerCase());
    return file.type === r;
  });
};

const deliver = (list: FileList | File[] | null | undefined) => {
  const files = [...(list ?? [])].filter(accepts);
  if (files.length) emit("files", props.multiple ? files : files.slice(0, 1));
};

const onDrop = (e: DragEvent) => {
  dragging.value = false;
  deliver(e.dataTransfer?.files);
};

const onPick = () => {
  deliver(input.value?.files);
  if (input.value) input.value.value = "";
};

const onPaste = (e: ClipboardEvent) => {
  const files = [...(e.clipboardData?.files ?? [])].map((f) =>
    f.name ? f : new File([f], `粘贴的图片.${f.type.split("/")[1] || "png"}`, { type: f.type }),
  );
  if (files.length) {
    e.preventDefault();
    deliver(files);
  }
};

useWindowEvent("paste", onPaste, () => props.paste);

defineExpose({ open: () => input.value?.click() });
</script>

<template>
  <button
    class="dropzone"
    :class="{ dragging, compact }"
    @click="input?.click()"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <input ref="input" type="file" :accept="accept" :multiple="multiple" hidden @change="onPick" />
    <FilePlus2 :size="compact ? 16 : 28" :stroke-width="1.5" />
    <strong>{{ title }}</strong>
    <span v-if="hint">{{ hint }}</span>
    <slot />
  </button>
</template>

<style scoped>
.dropzone {
  flex: 1;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.dropzone:hover {
  border-color: var(--accent);
  color: var(--text-2);
}
.dropzone.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}
strong {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}
.dropzone.compact {
  flex: 0 0 auto;
  min-height: 48px;
  flex-direction: row;
  gap: 8px;
  padding: 8px 16px;
}
.compact strong {
  margin-top: 0;
  font-size: 13px;
}
</style>
