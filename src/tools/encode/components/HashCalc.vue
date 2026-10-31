<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { FilePlus2, FileText, X } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import CopyList from "@/components/common/CopyList.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { TOOL_ACTIONS } from "@/components/tool/toolActions";
import { formatBytes } from "@/utils/format";
import { HASH_ALGORITHMS, hashBytes, hashText, type HashAlgorithm } from "../hash";

/** 计算文本或文件的 MD5 / SHA-1 / SHA-256 / SHA-512，一次全部显示 */
const source = useStoredRef<"text" | "file">("hash.source", "text");
const uppercase = useStoredRef("hash.uppercase", false);

const text = ref("");
const file = ref<File | null>(null);
const dragging = ref(false);
const fileInput = ref<HTMLInputElement>();

const results = ref<Record<HashAlgorithm, string> | null>(null);
const computing = ref(false);

// 每次计算编号，丢弃过期的异步结果（输入变化很快时）
let run = 0;
const compute = async () => {
  const id = ++run;
  if (source.value === "text" ? !text.value : !file.value) {
    results.value = null;
    return;
  }
  computing.value = true;
  const r =
    source.value === "text"
      ? await hashText(text.value)
      : await hashBytes(new Uint8Array(await file.value!.arrayBuffer()));
  if (id === run) {
    results.value = r;
    computing.value = false;
  }
};
watch([source, text, file], compute, { immediate: true });

const onPick = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files?.[0]) file.value = input.files[0];
  input.value = "";
};
const onDrop = (e: DragEvent) => {
  dragging.value = false;
  if (e.dataTransfer?.files[0]) file.value = e.dataTransfer.files[0];
};

const items = computed(() =>
  HASH_ALGORITHMS.map((algo) => {
    const value = results.value?.[algo] ?? "";
    return { label: algo, value: uppercase.value ? value.toUpperCase() : value };
  }),
);
</script>

<template>
  <div class="hash">
    <Teleport defer :to="TOOL_ACTIONS">
      <div class="seg">
        <button :class="{ on: source === 'text' }" @click="source = 'text'">文本</button>
        <button :class="{ on: source === 'file' }" @click="source = 'file'">文件</button>
      </div>
      <label class="check"><input v-model="uppercase" type="checkbox" />大写</label>
    </Teleport>

    <TextPane v-if="source === 'text'" v-model="text" class="input" label="文本" placeholder="输入要计算哈希的文本（按 UTF-8 计算）" />

    <section
      v-else
      class="card input"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <input ref="fileInput" type="file" hidden @change="onPick" />
      <div v-if="file" class="file">
        <FileText :size="36" :stroke-width="1.25" />
        <strong :title="file.name">{{ file.name }}</strong>
        <span>{{ formatBytes(file.size) }}</span>
        <div class="file-actions">
          <button class="btn" @click="fileInput?.click()">更换文件</button>
          <button class="btn subtle" @click="file = null"><X :size="14" />清除</button>
        </div>
      </div>
      <button v-else class="dropzone" @click="fileInput?.click()">
        <FilePlus2 :size="28" :stroke-width="1.5" />
        <strong>拖入文件，或点击选择</strong>
        <span>常用于校验下载的文件是否完整</span>
      </button>
    </section>

    <section class="card results">
      <header class="card-head">
        <span>结果</span>
        <span v-if="computing" class="hint">计算中…</span>
      </header>
      <CopyList :items="items" />
    </section>
  </div>
</template>

<style scoped>
.hash {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}
.input {
  flex: 1;
  min-height: 160px;
}

.card {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.15s, background 0.15s;
}
.card.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 2px;
  font-size: 12px;
  color: var(--text-3);
}

.dropzone {
  flex: 1;
  margin: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1.5px dashed var(--border-strong);
  border-radius: 10px;
  background: none;
  color: var(--text-3);
  font-size: 12px;
}
.dropzone:hover,
.dragging .dropzone {
  border-color: var(--accent);
  color: var(--text-2);
}
.dropzone strong {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.file {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px;
  color: var(--text-3);
  font-size: 12px;
}
.file strong {
  max-width: 100%;
  margin-top: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.results {
  flex-shrink: 0;
  background: var(--bg-sunken);
  box-shadow: none;
}
.hint {
  color: var(--text-3);
}
</style>
