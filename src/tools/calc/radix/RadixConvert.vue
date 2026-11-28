<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, History, Trash2, X } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import { useClipboard } from "@/composables/useClipboard";
import { useStoredRef } from "@/composables/useStoredRef";
import { useToolResult } from "@/composables/useToolUsage";
import { formatInteger, groupBinary, parseInteger } from "./radix";

interface RadixRecord {
  id: string;
  dec: string;
  hex: string;
  updatedAt: number;
}

const STORAGE_KEY = "radix.records";
const MAX_RECORDS = 20;

/** 二 / 八 / 十 / 十六进制及任意进制互转：左侧控制与记录，右侧实时换算与二进制位看板 */
const { t, locale } = useI18n();
const customBase = useStoredRef("radix.customBase", 36);
const uppercaseHex = useStoredRef("radix.uppercaseHex", true);
const BASE_OPTIONS = computed(() => Array.from({ length: 35 }, (_, i) => ({ value: i + 2, label: t("convert.baseN", { n: i + 2 }) })));

const value = ref<bigint | null>(255n);
const editing = ref<{ base: number; text: string } | null>(null);
const error = ref<{ base: number; message: string } | null>(null);

const loadRecords = (): RadixRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECORDS) : [];
  } catch {
    return [];
  }
};
const records = ref<RadixRecord[]>(loadRecords());
const activeId = ref<string | null>(null);
let restoring = false;
let recordTimer: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => clearTimeout(recordTimer));

const saveRecords = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.value.slice(0, MAX_RECORDS)));
  } catch {
    // 忽略本地存储写入异常
  }
};

watch(value, (val) => {
  if (restoring) return;
  clearTimeout(recordTimer);
  if (val === null) return;
  recordTimer = setTimeout(() => {
    const dec = val.toString(10);
    const hex = val.toString(16).toUpperCase();
    const now = Date.now();
    const existing = records.value.findIndex((r) => r.dec === dec);
    if (existing >= 0) {
      const updated = { ...records.value[existing], updatedAt: now };
      const rest = records.value.filter((_, idx) => idx !== existing);
      records.value = [updated, ...rest];
      activeId.value = updated.id;
      saveRecords();
      return;
    }
    const id = crypto.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2, 7)}`;
    records.value = [{ id, dec, hex, updatedAt: now }, ...records.value].slice(0, MAX_RECORDS);
    activeId.value = id;
    saveRecords();
  }, 500);
});

const rows = computed(() => [
  { base: 2, label: t("convert.binary") },
  { base: 8, label: t("convert.octal") },
  { base: 10, label: t("convert.decimal") },
  { base: 16, label: t("convert.hex") },
  { base: customBase.value, label: t("convert.baseN", { n: customBase.value }), custom: true },
]);

const display = (base: number) => {
  if (editing.value?.base === base) return editing.value.text;
  if (value.value === null) return "";
  const formatted = formatInteger(value.value, base);
  return base > 10 && uppercaseHex.value ? formatted.toUpperCase() : formatted;
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

const onBlur = () => {
  if (!error.value) editing.value = null;
};

const applyOp = (fn: (v: bigint) => bigint) => {
  const next = fn(value.value ?? 0n);
  editing.value = null;
  error.value = null;
  value.value = next;
};

const clearAll = () => {
  editing.value = null;
  error.value = null;
  value.value = null;
  activeId.value = null;
};

// ---------- 二进制位面板（非负且不超过 64 位可逐位点击翻转） ----------

const bitInfo = computed(() => {
  if (value.value === null) return null;
  const v = value.value;
  const abs = v < 0n ? -v : v;
  const bin = abs.toString(2);
  const interactive = v >= 0n && bin.length <= 64;
  if (!interactive) {
    return { interactive: false as const, length: bin.length, grouped: groupBinary(formatInteger(v, 2)) };
  }
  const paddedLen = Math.min(64, Math.max(8, Math.ceil(bin.length / 4) * 4));
  const padded = bin.padStart(paddedLen, "0");
  const nibbles: { highBit: number; bits: { index: number; on: boolean }[] }[] = [];
  for (let offset = 0; offset < paddedLen; offset += 4) {
    const highBit = paddedLen - 1 - offset;
    const bits = [];
    for (let j = 0; j < 4; j++) {
      bits.push({ index: highBit - j, on: padded[offset + j] === "1" });
    }
    nibbles.push({ highBit, bits });
  }
  return { interactive: true as const, length: bin.length, nibbles };
});

const toggleBit = (bitIndex: number) => {
  if (value.value === null || value.value < 0n) return;
  editing.value = null;
  error.value = null;
  value.value = value.value ^ (1n << BigInt(bitIndex));
};

const restoreRecord = (rec: RadixRecord) => {
  clearTimeout(recordTimer);
  restoring = true;
  editing.value = null;
  error.value = null;
  activeId.value = rec.id;
  value.value = BigInt(rec.dec);
  setTimeout(() => {
    restoring = false;
  }, 0);
};

const removeRecord = (id: string) => {
  records.value = records.value.filter((r) => r.id !== id);
  if (activeId.value === id) activeId.value = null;
  saveRecords();
};

const clearHistory = () => {
  records.value = [];
  activeId.value = null;
  saveRecords();
};

const formatTime = (ts: number) => new Intl.DateTimeFormat(locale.value, { hour: "2-digit", minute: "2-digit" }).format(new Date(ts));

const { copy } = useClipboard();
const copiedBase = ref<number | null>(null);
const onCopy = async (base: number) => {
  const text = display(base);
  if (!text) return;
  await copy(text);
  copiedBase.value = base;
  setTimeout(() => {
    if (copiedBase.value === base) copiedBase.value = null;
  }, 1200);
};

useToolResult(() => (!error.value && value.value !== null ? `${value.value}|${customBase.value}` : ""));
</script>

<template>
  <div class="radix-workbench">
    <aside class="card sidebar">
      <section class="section">
        <h3>{{ t("convert.radixOptions") }}</h3>
        <div class="option-row">
          <span>{{ t("convert.chooseBase") }}</span>
          <AppSelect v-model="customBase" class="base-select" size="sm" :options="BASE_OPTIONS" :searchable="false" />
        </div>
        <div class="option-row">
          <span>{{ t("convert.uppercaseHex") }}</span>
          <button
            type="button"
            class="control-switch"
            role="switch"
            :aria-checked="uppercaseHex"
            :aria-label="t('convert.uppercaseHex')"
            @click="uppercaseHex = !uppercaseHex"
          >
            <span />
          </button>
        </div>
      </section>

      <section class="section">
        <h3>{{ t("convert.quickOps") }}</h3>
        <div class="quick-grid">
          <button type="button" class="btn small" @click="applyOp((v) => v - 1n)">-1</button>
          <button type="button" class="btn small" @click="applyOp((v) => v + 1n)">+1</button>
          <button type="button" class="btn small" @click="applyOp((v) => v << 1n)">&lt;&lt; 1</button>
          <button type="button" class="btn small" @click="applyOp((v) => v >> 1n)">&gt;&gt; 1</button>
          <button type="button" class="btn small" @click="applyOp(() => 0n)">= 0</button>
          <button type="button" class="btn small subtle" :disabled="value === null" @click="clearAll">{{ t("convert.clearRadix") }}</button>
        </div>
      </section>

      <section class="section history-section">
        <header class="history-head">
          <div class="history-heading">
            <h3>{{ t("convert.radixHistory") }}</h3>
            <span v-if="records.length" class="count-pill">{{ records.length }}</span>
          </div>
          <button
            v-if="records.length"
            type="button"
            class="icon-btn"
            :title="t('convert.clearRadixHistory')"
            @click="clearHistory"
          >
            <Trash2 :size="14" />
          </button>
        </header>

        <div v-if="records.length" class="history-list">
          <div
            v-for="rec in records"
            :key="rec.id"
            role="button"
            tabindex="0"
            class="history-item"
            :class="{ active: rec.id === activeId }"
            @click="restoreRecord(rec)"
            @keydown.enter.prevent="restoreRecord(rec)"
          >
            <div class="history-meta">
              <strong class="history-dec">{{ rec.dec }}</strong>
              <span class="history-time">{{ formatTime(rec.updatedAt) }}</span>
              <button type="button" class="icon-btn history-del" @click.stop="removeRecord(rec.id)">
                <X :size="12" />
              </button>
            </div>
            <span class="history-hex">0x{{ uppercaseHex ? rec.hex : rec.hex.toLowerCase() }}</span>
          </div>
        </div>
        <div v-else class="history-empty">
          <span class="empty-icon"><History :size="16" /></span>
          <p>{{ t("convert.radixHistoryEmpty") }}</p>
        </div>
      </section>
    </aside>

    <main class="stage">
      <section class="card converter">
        <header class="card-title">
          <span>{{ t("convert.value") }}</span>
          <span class="title-hint">{{ t("convert.radixHint") }}</span>
        </header>
        <div class="rows">
          <div v-for="row in rows" :key="row.custom ? 'custom' : row.base" class="row">
            <span class="row-label">{{ row.label }}</span>
            <div class="input-wrap">
              <input
                class="field mono small-text"
                :class="{ invalid: error?.base === row.base }"
                :value="display(row.base)"
                spellcheck="false"
                @input="onInput(row.base, ($event.target as HTMLInputElement).value)"
                @blur="onBlur"
              />
              <p v-if="error?.base === row.base" class="error">{{ error.message }}</p>
            </div>
            <button
              type="button"
              class="icon-btn"
              :class="{ ok: copiedBase === row.base }"
              :disabled="!display(row.base)"
              :title="t('convert.copy')"
              @click="onCopy(row.base)"
            >
              <Check v-if="copiedBase === row.base" :size="14" />
              <Copy v-else :size="14" />
            </button>
          </div>
        </div>
      </section>

      <section v-if="bitInfo" class="card bits-card">
        <header class="card-title">
          <span>{{ t("convert.bitBoard") }}</span>
          <span class="count-pill">{{ bitInfo.length }} bit</span>
          <span class="title-hint">{{ t("convert.bitBoardHint") }}</span>
        </header>
        <div v-if="bitInfo.interactive" class="nibbles">
          <div v-for="nib in bitInfo.nibbles" :key="nib.highBit" class="nibble">
            <span class="nibble-idx">{{ nib.highBit }}..{{ nib.highBit - 3 }}</span>
            <div class="nibble-bits">
              <button
                v-for="bit in nib.bits"
                :key="bit.index"
                type="button"
                class="bit-btn"
                :class="{ on: bit.on }"
                :title="`bit ${bit.index}`"
                @click="toggleBit(bit.index)"
              >
                {{ bit.on ? "1" : "0" }}
              </button>
            </div>
          </div>
        </div>
        <p v-else class="grouped-bin">{{ bitInfo.grouped }}</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.radix-workbench {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.sidebar {
  flex: 0 0 288px;
  min-height: 0;
  box-shadow: var(--shadow-sm);
}
.sidebar h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: var(--text);
}
.option-row :deep(.base-select) {
  width: 110px;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.quick-grid .btn {
  justify-content: center;
  font-family: var(--font-mono);
}
.history-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 10px 10px;
}
.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px;
}
.history-heading {
  display: flex;
  align-items: center;
  gap: 6px;
}
.count-pill {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--active);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.history-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.history-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.history-item:hover {
  background: var(--hover);
  border-color: var(--border);
}
.history-item.active {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
}
.history-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}
.history-dec {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-time {
  font-size: 11px;
  color: var(--text-3);
}
.history-del {
  width: 20px;
  height: 20px;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.history-item:hover .history-del,
.history-item.active .history-del {
  opacity: 1;
}
.history-hex {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px 12px;
  text-align: center;
  color: var(--text-3);
}
.history-empty p {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
}
.empty-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
}

.stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
.converter,
.bits-card {
  box-shadow: var(--shadow-sm);
}
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
  padding: 14px 12px 16px 16px;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.row-label {
  flex: 0 0 88px;
  height: 36px;
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
}
.input-wrap {
  flex: 1;
  min-width: 0;
}
.row .icon-btn {
  margin-top: 5px;
}
.error {
  margin: 4px 0 0;
}
.nibbles {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 14px;
  padding: 14px 16px 16px;
}
.nibble {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nibble-idx {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-3);
  text-align: center;
}
.nibble-bits {
  display: flex;
  gap: 3px;
}
.bit-btn {
  width: 26px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-sunken);
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.bit-btn:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.bit-btn.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.grouped-bin {
  margin: 0;
  padding: 14px 16px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-2);
  word-break: break-all;
  user-select: text;
}
@media (max-width: 860px) {
  .radix-workbench {
    flex: none;
    width: 100%;
    flex-direction: column;
  }
  .sidebar {
    flex: none;
  }
  .history-list {
    max-height: 180px;
  }
}
</style>
