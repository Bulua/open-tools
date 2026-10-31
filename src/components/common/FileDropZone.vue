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
    /** 允许拖入文件夹：会展开文件夹内的所有文件，并通过 entries 事件给出相对路径 */
    directories?: boolean;
  }>(),
  { accept: "", multiple: false, title: "拖入文件，或点击选择", hint: "", paste: true, compact: false, directories: false },
);

const emit = defineEmits<{
  files: [files: File[]];
  /** directories 为 true 时触发：每个文件及其相对路径（如「照片/2024/a.jpg」） */
  entries: [entries: { file: File; path: string }[]];
}>();

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
  if (!files.length) return;
  emit("files", props.multiple ? files : files.slice(0, 1));
  if (props.directories) emit("entries", files.map((file) => ({ file, path: file.webkitRelativePath || file.name })));
};

// ---------- 文件夹：拖入时逐层读取文件夹里的所有文件 ----------

const readEntry = async (entry: FileSystemEntry, base: string): Promise<{ file: File; path: string }[]> => {
  const path = base ? `${base}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [{ file, path }];
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries 每次最多返回一部分，需要读到返回空为止
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  return (await Promise.all(children.map((c) => readEntry(c, path)))).flat();
};

const onDrop = async (e: DragEvent) => {
  dragging.value = false;
  const items = [...(e.dataTransfer?.items ?? [])];
  const entries = props.directories ? items.map((i) => i.webkitGetAsEntry()).filter((x): x is FileSystemEntry => !!x) : [];
  if (!entries.some((x) => x.isDirectory)) return deliver(e.dataTransfer?.files);

  const all = (await Promise.all(entries.map((x) => readEntry(x, "")))).flat().filter((x) => accepts(x.file));
  if (!all.length) return;
  emit("files", all.map((x) => x.file));
  emit("entries", all);
};

const onPick = (e: Event) => {
  const target = e.target as HTMLInputElement;
  deliver(target.files);
  target.value = "";
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

const folderInput = ref<HTMLInputElement>();

defineExpose({
  /** 打开文件选择框 */
  open: () => input.value?.click(),
  /** 打开文件夹选择框（需要 directories） */
  openFolder: () => folderInput.value?.click(),
});
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
    <input v-if="directories" ref="folderInput" type="file" webkitdirectory hidden @change="onPick" />
    <FilePlus2 :size="compact ? 16 : 28" :stroke-width="1.5" />
    <strong v-if="title">{{ title }}</strong>
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
