<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, Copy } from "lucide-vue-next";
import { useClipboard } from "@/composables/useClipboard";
import { useStoredRef } from "@/composables/useStoredRef";
import { formatInteger, groupBinary, parseInteger } from "../radix";

/** 二 / 八 / 十 / 十六进制及任意进制互转：改任意一行，其他行自动更新 */
const customBase = useStoredRef("radix.customBase", 36);

const value = ref<bigint | null>(255n);
/** 正在编辑的那一行保留用户原样输入，其余行显示转换结果 */
const editing = ref<{ base: number; text: string } | null>(null);
const error = ref<{ base: number; message: string } | null>(null);

const rows = computed(() => [
  { base: 2, label: "二进制" },
  { base: 8, label: "八进制" },
  { base: 10, label: "十进制" },
  { base: 16, label: "十六进制" },
  { base: customBase.value, label: `${customBase.value} 进制`, custom: true },
]);

const display = (base: number) => {
  if (editing.value?.base === base) return editing.value.text;
  return value.value === null ? "" : formatInteger(value.value, base);
};

const onInput = (base: number, text: string) => {
  editing.value = { base, text };
  if (!text.trim()) {
    value.value = null;
    error.value = null;
    return;
  }
  try {
    value.value = parseInteger(text, base);
    error.value = null;
  } catch (e) {
    error.value = { base, message: e instanceof Error ? e.message : String(e) };
  }
};

// 离开输入框后，把这一行也换成规范写法
const onBlur = () => {
  if (!error.value) editing.value = null;
};

const bitLength = computed(() => {
  if (value.value === null) return "";
  const abs = value.value < 0n ? -value.value : value.value;
  return `${abs.toString(2).length} 位二进制，二进制分组：${groupBinary(formatInteger(value.value, 2))}`;
});

const { copy } = useClipboard();
const copiedBase = ref<number | null>(null);
const onCopy = async (base: number) => {
  const text = display(base);
  if (!text) return;
  await copy(text);
  copiedBase.value = base;
  setTimeout(() => (copiedBase.value = null), 1200);
};
</script>

<template>
  <div class="radix">
    <section class="card">
      <header class="card-title">
        数值
        <span class="title-hint">修改任意一行，其他进制自动换算</span>
      </header>
      <div class="rows">
        <div v-for="row in rows" :key="row.custom ? 'custom' : row.base" class="row">
          <label class="label">
            <template v-if="!row.custom">{{ row.label }}</template>
            <select v-else v-model.number="customBase" class="base-select" title="选择进制">
              <option v-for="b in 35" :key="b" :value="b + 1">{{ b + 1 }} 进制</option>
            </select>
          </label>
          <div class="input-wrap">
            <input
              class="field mono"
              :class="{ invalid: error?.base === row.base }"
              :value="display(row.base)"
              spellcheck="false"
              @input="onInput(row.base, ($event.target as HTMLInputElement).value)"
              @blur="onBlur"
            />
            <p v-if="error?.base === row.base" class="error">{{ error.message }}</p>
          </div>
          <button class="icon-btn" :class="{ ok: copiedBase === row.base }" title="复制" @click="onCopy(row.base)">
            <Check v-if="copiedBase === row.base" :size="14" />
            <Copy v-else :size="14" />
          </button>
        </div>
        <p v-if="bitLength" class="info">{{ bitLength }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.title-hint {
  margin-left: auto;
  padding-right: 6px;
  font-weight: 400;
  color: var(--text-3);
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 8px 14px 16px;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.label {
  flex: 0 0 88px;
  height: 36px;
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--text-2);
}
.base-select {
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  font-size: 13px;
  color: var(--text-2);
}
.input-wrap {
  flex: 1;
  min-width: 0;
}
.icon-btn {
  margin-top: 5px;
}
.error {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--danger);
}
.info {
  margin: 2px 0 0 100px;
  font-size: 12px;
  color: var(--text-3);
  word-break: break-all;
}
</style>
