<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { FileText, RefreshCw, X } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import CopyList from "@/components/common/CopyList.vue";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import ToolActions from "@/components/tool/ToolActions.vue";
import { formatBytes } from "@/utils/format";
import { HASH_ALGORITHMS, hashBytes, hashText, type HashAlgorithm } from "./hash";

/** 计算文本或文件的 MD5 / SHA-1 / SHA-256 / SHA-512，一次全部显示 */
const { t } = useI18n();
const source = useStoredRef<"text" | "file">("hash.source", "text");
const uppercase = useStoredRef("hash.uppercase", false);

const text = ref("");
const file = ref<File | null>(null);
const dropZone = ref<InstanceType<typeof FileDropZone>>();

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

const items = computed(() =>
  HASH_ALGORITHMS.map((algo) => {
    const value = results.value?.[algo] ?? "";
    return { label: algo, value: uppercase.value ? value.toUpperCase() : value };
  }),
);

useToolResult(() => results.value ? JSON.stringify(results.value) : "");
</script>

<template>
  <div class="hash">
    <ToolActions>
      <div class="seg">
        <button :class="{ on: source === 'text' }" @click="source = 'text'">{{ t("encode.text") }}</button>
        <button :class="{ on: source === 'file' }" @click="source = 'file'">{{ t("encode.file") }}</button>
      </div>
      <label class="check"><input v-model="uppercase" type="checkbox" />{{ t("encode.uppercase") }}</label>
    </ToolActions>

    <TextPane v-if="source === 'text'" v-model="text" class="input" :label="t('encode.text')" :placeholder="t('encode.hashPlaceholder')" />

    <template v-else>
      <!-- 选好文件后显示为一行，把空间留给结果 -->
      <section v-if="file" class="card file">
        <FileText :size="20" :stroke-width="1.5" class="file-icon" />
        <strong :title="file.name">{{ file.name }}</strong>
        <span class="file-size">{{ formatBytes(file.size) }}</span>
        <button class="btn subtle" @click="dropZone?.open()"><RefreshCw :size="14" />{{ t("encode.replace") }}</button>
        <button class="btn subtle" @click="file = null"><X :size="14" />{{ t("encode.clear") }}</button>
      </section>
      <FileDropZone
        v-show="!file"
        ref="dropZone"
        class="input"
        :title="t('encode.dropFile')"
        :hint="t('encode.hashHint')"
        :paste="false"
        @files="file = $event[0]"
      />
    </template>

    <section class="card results">
      <header class="card-title">
        <span>{{ t("encode.result") }}</span>
        <span v-if="computing" class="hint">{{ t("encode.computing") }}</span>
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
  min-height: 140px;
}
.file {
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 10px 8px 10px 16px;
}
.file-icon {
  color: var(--text-3);
}
.file strong {
  min-width: 0;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-size {
  flex: 1;
  font-size: 12px;
  color: var(--text-3);
}
.results {
  flex-shrink: 0;
}
.hint {
  margin-left: auto;
  padding-right: 6px;
  font-weight: 400;
  color: var(--text-3);
}
</style>
