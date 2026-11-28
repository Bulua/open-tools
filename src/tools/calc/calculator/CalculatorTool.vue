<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, Delete, Trash2 } from "lucide-vue-next";
import { calculatorApi } from "@/api/calculator";
import { useClipboard } from "@/composables/useClipboard";
import { useStoredRef } from "@/composables/useStoredRef";
import { useToolResult } from "@/composables/useToolUsage";
import type { CalculatorHistoryItem } from "@/types/calculator";
import { showError } from "@/utils/errorToast";
import { evaluateExpression, type AngleUnit, type LiveEval } from "./calculator";

const { t, locale } = useI18n();
const LEGACY_HISTORY_KEY = "calculator.history";

const angle = useStoredRef<AngleUnit>("calculator.angle", "deg");
const fnTab = useStoredRef<"sci" | "adv">("calculator.fnTab", "sci");
const second = ref(false);
const memory = useStoredRef<number | null>("calculator.memory", null);
const lastAnswer = ref("");
const history = ref<CalculatorHistoryItem[]>([]);

async function loadHistory() {
  try {
    const rows = await calculatorApi.listHistory();
    if (rows.length > 0) {
      history.value = rows;
      localStorage.removeItem(LEGACY_HISTORY_KEY);
      return;
    }
    const raw = localStorage.getItem(LEGACY_HISTORY_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = parsed
        .filter((item): item is { expr: string; result: string } => Boolean(item && typeof item.expr === "string" && typeof item.result === "string"))
        .map((item) => ({ expression: item.expr, result: item.result }));
      if (valid.length > 0) {
        history.value = await calculatorApi.importHistory(valid);
      }
    }
    localStorage.removeItem(LEGACY_HISTORY_KEY);
  } catch (e) {
    showError(e);
  }
}

onMounted(() => {
  void loadHistory();
});

const expr = ref("");
const inputEl = ref<HTMLInputElement>();
const live = ref<LiveEval>({ ok: true, text: "" });
let evalSeq = 0;

watch(
  [expr, angle, locale],
  ([raw, unit]) => {
    const seq = ++evalSeq;
    if (!raw.trim()) {
      live.value = { ok: true, text: "" };
      return;
    }
    void evaluateExpression(raw, unit)
      .then((res) => {
        if (seq === evalSeq) live.value = res;
      })
      .catch(showError);
  },
  { immediate: true },
);

const focus = () => nextTick(() => inputEl.value?.focus());

let pendingCaret: number | null = null;
const selection = () => {
  const el = inputEl.value;
  if (pendingCaret !== null) return [pendingCaret, pendingCaret];
  return [el?.selectionStart ?? expr.value.length, el?.selectionEnd ?? expr.value.length];
};
const moveCaret = (pos: number) => {
  pendingCaret = pos;
  nextTick(() => {
    inputEl.value?.focus();
    inputEl.value?.setSelectionRange(pos, pos);
    pendingCaret = null;
  });
};

const insert = (text: string) => {
  const [start, end] = selection();
  expr.value = expr.value.slice(0, start) + text + expr.value.slice(end);
  moveCaret(start + text.length);
};

const backspace = () => {
  const [start, end] = selection();
  if (start !== end) expr.value = expr.value.slice(0, start) + expr.value.slice(end);
  else if (start > 0) expr.value = expr.value.slice(0, start - 1) + expr.value.slice(start);
  moveCaret(start !== end ? start : Math.max(0, start - 1));
};

const clear = () => {
  expr.value = "";
  moveCaret(0);
};

const toggleSign = () => {
  const s = expr.value;
  if (!s) {
    insert("-");
    return;
  }
  if (s.startsWith("-")) {
    expr.value = s.slice(1);
    moveCaret(expr.value.length);
  } else {
    expr.value = `-${s}`;
    moveCaret(expr.value.length);
  }
};

const equals = async () => {
  const currentExpr = expr.value;
  if (!currentExpr.trim()) return;
  try {
    const evaluated = await evaluateExpression(currentExpr, angle.value);
    if (expr.value !== currentExpr) return;
    live.value = evaluated;
    if (!evaluated.ok || !evaluated.text) return;
    const result = evaluated.text;
    lastAnswer.value = result;
    history.value = await calculatorApi.addHistory(currentExpr, result, angle.value);
    expr.value = result;
    moveCaret(result.length);
  } catch (e) {
    showError(e);
  }
};

// ---------- 内存操作 ----------

const currentNumeric = async (): Promise<number | null> => {
  const raw = expr.value.trim();
  if (!raw) return null;
  const res = await evaluateExpression(raw, angle.value);
  if (!res.ok || !res.text) return null;
  const n = Number(res.text);
  return Number.isFinite(n) ? n : null;
};

const memClear = () => {
  memory.value = null;
};
const memRecall = () => {
  if (memory.value !== null) insert(String(memory.value));
};
const memStore = async () => {
  const n = await currentNumeric();
  if (n !== null) memory.value = n;
};
const memAdd = async () => {
  const n = await currentNumeric();
  if (n !== null) memory.value = (memory.value ?? 0) + n;
};
const memSub = async () => {
  const n = await currentNumeric();
  if (n !== null) memory.value = (memory.value ?? 0) - n;
};

const clearHistory = () => {
  void calculatorApi
    .clearHistory()
    .then(() => {
      history.value = [];
    })
    .catch(showError);
};

const { copy, copied } = useClipboard();
const copiedRecordId = ref<string | null>(null);
const copyRecord = async (id: string, val: string) => {
  await copy(val);
  copiedRecordId.value = id;
  setTimeout(() => {
    if (copiedRecordId.value === id) copiedRecordId.value = null;
  }, 1200);
};

type Key = {
  label: string;
  insert?: string;
  action?: () => void;
  kind?: "op" | "fn" | "eq";
  title?: string;
  span?: number;
  disabled?: boolean;
};

const sciKeys = computed<Key[]>(() =>
  second.value
    ? [
        { label: "asin", insert: "asin(", kind: "fn" },
        { label: "acos", insert: "acos(", kind: "fn" },
        { label: "atan", insert: "atan(", kind: "fn" },
        { label: "π", insert: "π", kind: "fn" },
        { label: "e", insert: "e", kind: "fn" },
        { label: "asinh", insert: "asinh(", kind: "fn" },
        { label: "acosh", insert: "acosh(", kind: "fn" },
        { label: "atanh", insert: "atanh(", kind: "fn" },
        { label: "τ", insert: "τ", kind: "fn" },
        { label: "φ", insert: "φ", kind: "fn" },
        { label: "eˣ", insert: "exp(", kind: "fn", title: "kExp" },
        { label: "log₂", insert: "log2(", kind: "fn", title: "kLog2" },
        { label: "∛", insert: "∛", kind: "fn", title: "kCbrt" },
        { label: "x³", insert: "^3", kind: "fn", title: "kCube" },
        { label: "n!", insert: "!", kind: "fn", title: "kFact" },
      ]
    : [
        { label: "sin", insert: "sin(", kind: "fn" },
        { label: "cos", insert: "cos(", kind: "fn" },
        { label: "tan", insert: "tan(", kind: "fn" },
        { label: "π", insert: "π", kind: "fn" },
        { label: "e", insert: "e", kind: "fn" },
        { label: "sinh", insert: "sinh(", kind: "fn" },
        { label: "cosh", insert: "cosh(", kind: "fn" },
        { label: "tanh", insert: "tanh(", kind: "fn" },
        { label: "τ", insert: "τ", kind: "fn" },
        { label: "φ", insert: "φ", kind: "fn" },
        { label: "ln", insert: "ln(", kind: "fn" },
        { label: "log", insert: "log(", kind: "fn", title: "kLog" },
        { label: "√", insert: "√", kind: "fn" },
        { label: "x²", insert: "^2", kind: "fn", title: "kSquare" },
        { label: "xʸ", insert: "^", kind: "fn", title: "kPow" },
      ],
);

const advKeys = computed<Key[]>(() =>
  second.value
    ? [
        { label: "deg", insert: "deg(", kind: "fn" },
        { label: "rad", insert: "rad(", kind: "fn" },
        { label: "lcm", insert: "lcm(", kind: "fn" },
        { label: "nCr", insert: "ncr(", kind: "fn" },
        { label: "nPr", insert: "npr(", kind: "fn" },
        { label: "sign", insert: "sign(", kind: "fn" },
        { label: "pow", insert: "pow(", kind: "fn" },
        { label: "∛", insert: "∛", kind: "fn", title: "kCbrt" },
        { label: "log₂", insert: "log2(", kind: "fn", title: "kLog2" },
        { label: "exp", insert: "exp(", kind: "fn", title: "kExp" },
        { label: "min", insert: "min(", kind: "fn" },
        { label: "max", insert: "max(", kind: "fn" },
        { label: "avg", insert: "avg(", kind: "fn" },
        { label: "sum", insert: "sum(", kind: "fn" },
        { label: "gcd", insert: "gcd(", kind: "fn" },
      ]
    : [
        { label: "abs", insert: "abs(", kind: "fn" },
        { label: "floor", insert: "floor(", kind: "fn" },
        { label: "ceil", insert: "ceil(", kind: "fn" },
        { label: "round", insert: "round(", kind: "fn" },
        { label: "trunc", insert: "trunc(", kind: "fn" },
        { label: "mod", insert: " mod ", kind: "fn", title: "kMod" },
        { label: "//", insert: " // ", kind: "fn", title: "kFloorDiv" },
        { label: "root", insert: "root(", kind: "fn" },
        { label: "logₙ", insert: "logn(", kind: "fn" },
        { label: "hypot", insert: "hypot(", kind: "fn" },
        { label: "min", insert: "min(", kind: "fn" },
        { label: "max", insert: "max(", kind: "fn" },
        { label: "avg", insert: "avg(", kind: "fn" },
        { label: "sum", insert: "sum(", kind: "fn" },
        { label: "gcd", insert: "gcd(", kind: "fn" },
      ],
);

const coreKeys = computed<Key[]>(() => [
  { label: "(", insert: "(", kind: "op" },
  { label: ")", insert: ")", kind: "op" },
  { label: ",", insert: ", ", kind: "op", title: "kComma" },
  { label: "%", insert: "%", kind: "op", title: "kPercent" },
  { label: "÷", insert: "÷", kind: "op" },
  { label: "7", insert: "7" },
  { label: "8", insert: "8" },
  { label: "9", insert: "9" },
  { label: "×", insert: "×", kind: "op" },
  { label: "⌫", action: backspace, kind: "op", title: "kBack" },
  { label: "4", insert: "4" },
  { label: "5", insert: "5" },
  { label: "6", insert: "6" },
  { label: "−", insert: "-", kind: "op" },
  { label: "AC", action: clear, kind: "op", title: "kClear" },
  { label: "1", insert: "1" },
  { label: "2", insert: "2" },
  { label: "3", insert: "3" },
  { label: "+", insert: "+", kind: "op" },
  { label: "Ans", action: () => lastAnswer.value && insert(lastAnswer.value), kind: "op", title: "ans", disabled: !lastAnswer.value },
  { label: "±", action: toggleSign, kind: "op", title: "kSignToggle" },
  { label: "0", insert: "0" },
  { label: ".", insert: "." },
  { label: "=", action: equals, kind: "eq", title: "kEquals", span: 2 },
]);

const press = (k: Key) => {
  if (k.disabled) return;
  if (k.action) k.action();
  else if (k.insert) insert(k.insert);
};

useToolResult(() => (live.value.ok && live.value.text ? `${expr.value}|${angle.value}` : ""));
</script>

<template>
  <div class="calculator">
    <section class="card pad">
      <div class="pad-controls">
        <div class="seg" :title="t('utility.angleUnit')">
          <button type="button" :class="{ on: angle === 'deg' }" @click="angle = 'deg'">{{ t("utility.deg") }}</button>
          <button type="button" :class="{ on: angle === 'rad' }" @click="angle = 'rad'">{{ t("utility.rad") }}</button>
        </div>

        <div class="seg">
          <button type="button" :class="{ on: fnTab === 'sci' }" @click="fnTab = 'sci'">{{ t("utility.tabSci") }}</button>
          <button type="button" :class="{ on: fnTab === 'adv' }" @click="fnTab = 'adv'">{{ t("utility.tabAdv") }}</button>
        </div>

        <button
          type="button"
          class="second-btn"
          :class="{ on: second }"
          :title="t('utility.secondFn')"
          @click="second = !second"
        >
          2nd
        </button>
      </div>

      <div class="mem-bar">
        <button type="button" class="mem-btn" :disabled="memory === null" :title="t('utility.memClear')" @click="memClear">MC</button>
        <button type="button" class="mem-btn" :disabled="memory === null" :title="t('utility.memRecall')" @click="memRecall">MR</button>
        <button type="button" class="mem-btn" :title="t('utility.memAdd')" @click="memAdd">M+</button>
        <button type="button" class="mem-btn" :title="t('utility.memSub')" @click="memSub">M-</button>
        <button type="button" class="mem-btn" :title="t('utility.memStore')" @click="memStore">MS</button>
        <span v-if="memory !== null" class="mem-badge">{{ t("utility.memValue", { value: memory }) }}</span>
      </div>

      <!-- 显示屏：支持键盘直接输入与实时求值 -->
      <div class="display">
        <input
          ref="inputEl"
          v-model="expr"
          class="expr"
          spellcheck="false"
          :placeholder="t('utility.exprPlaceholder')"
          @keydown.enter.prevent="equals"
          @keydown.esc="clear"
        />
        <div class="live-row">
          <div class="live" :class="{ error: !live.ok }">
            <template v-if="live.text">{{ live.ok ? `= ${live.text}` : live.text }}</template>
          </div>
          <button
            v-if="live.ok && live.text"
            type="button"
            class="icon-btn"
            :class="{ ok: copied && !copiedRecordId }"
            :title="t('utility.copyResult')"
            @click="copy(live.text)"
          >
            <Check v-if="copied && !copiedRecordId" :size="14" />
            <Copy v-else :size="14" />
          </button>
        </div>
      </div>

      <Transition name="panel-swap" mode="out-in">
        <div :key="`${fnTab}:${second}`" class="keys fn-grid">
          <button
            v-for="k in fnTab === 'sci' ? sciKeys : advKeys"
            :key="k.label"
            type="button"
            class="key fn"
            :title="k.title && t(`utility.${k.title}`)"
            @click="press(k)"
          >
            {{ k.label }}
          </button>
        </div>
      </Transition>

      <div class="keys core-grid">
        <button
          v-for="k in coreKeys"
          :key="k.label"
          type="button"
          class="key"
          :class="[k.kind, { wide: k.span === 2 }]"
          :disabled="k.disabled"
          :title="k.title && t(`utility.${k.title}`)"
          @click="press(k)"
        >
          <Delete v-if="k.label === '⌫'" :size="17" />
          <template v-else>{{ k.label }}</template>
        </button>
      </div>
    </section>

    <section class="card history">
      <header class="card-title">
        <span>{{ t("utility.history") }}</span>
        <span v-if="history.length" class="count-pill">{{ history.length }}</span>
        <button v-if="history.length" type="button" class="icon-btn push" :title="t('utility.clearHistory')" @click="clearHistory">
          <Trash2 :size="14" />
        </button>
      </header>
      <ul v-if="history.length" class="records">
        <li v-for="h in history" :key="h.id" class="record">
          <div class="record-main">
            <button type="button" class="record-expr" :title="t('utility.useExpr')" @click="expr = h.expression; focus()">
              {{ h.expression }}
            </button>
            <button
              type="button"
              class="record-result"
              :title="t('utility.useResult')"
              @click="insert(h.result)"
              @contextmenu.prevent="copyRecord(h.id, h.result)"
            >
              = {{ h.result }}
            </button>
          </div>
          <button
            type="button"
            class="icon-btn record-copy"
            :class="{ ok: copiedRecordId === h.id }"
            :title="t('utility.copyResult')"
            @click="copyRecord(h.id, h.result)"
          >
            <Check v-if="copiedRecordId === h.id" :size="13" />
            <Copy v-else :size="13" />
          </button>
        </li>
      </ul>
      <p v-else class="empty">{{ t("utility.historyEmpty") }}</p>
    </section>
  </div>
</template>

<style scoped>
.calculator {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(380px, 500px) minmax(0, 1fr);
  gap: 14px;
}
.pad {
  padding: 12px 14px 14px;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  box-shadow: var(--shadow-sm);
}
.pad-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
}
.second-btn {
  margin-left: auto;
  height: 28px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-sunken);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.second-btn:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.second-btn.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.mem-bar {
  display: flex;
  align-items: center;
  gap: 4px;
}
.mem-btn {
  height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: 500;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.mem-btn:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text);
}
.mem-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.mem-badge {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.display {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-sunken);
  text-align: right;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.display:focus-within {
  border-color: var(--accent);
}
.expr {
  width: 100%;
  border: none;
  outline: none;
  background: none;
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 22px;
  color: var(--text);
}
.expr::placeholder {
  font-family: var(--font-sans);
  font-size: 13.5px;
  color: var(--text-3);
}
.live-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-height: 26px;
  margin-top: 4px;
}
.live {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 15px;
  color: var(--text-2);
  word-break: break-all;
}
.live.error {
  font-family: var(--font-sans);
  font-size: 12.5px;
  color: var(--danger);
}

.keys {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}
.key {
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), transform 0.05s;
}
.key:hover:not(:disabled) {
  background: var(--hover);
  border-color: var(--border-strong);
}
.key:active:not(:disabled) {
  transform: translateY(1px);
}
.key:disabled {
  opacity: 0.4;
  cursor: default;
}
.key.fn {
  height: 32px;
  background: var(--bg-sunken);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 12px;
}
.key.op {
  background: var(--bg-sunken);
  color: var(--accent);
  font-size: 14px;
  font-weight: 500;
}
.key.eq {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
  font-size: 18px;
}
.key.eq:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.key.wide {
  grid-column: span 2;
}

.history {
  min-height: 0;
  box-shadow: var(--shadow-sm);
}
.count-pill {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--active);
  color: var(--text-2);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.push {
  margin-left: auto;
}
.records {
  flex: 1;
  min-height: 0;
  list-style: none;
  margin: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}
.record {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-sunken);
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.record:hover {
  background: var(--hover);
  border-color: var(--border-strong);
}
.record-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.record-main button {
  max-width: 100%;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-mono);
  text-align: right;
  word-break: break-all;
}
.record-expr {
  font-size: 12.5px;
  color: var(--text-3);
}
.record-result {
  font-size: 16px;
  font-weight: 500;
  color: var(--text);
}
.record-main button:hover {
  color: var(--accent);
}
.record-copy {
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.record:hover .record-copy,
.record:focus-within .record-copy,
.record-copy.ok {
  opacity: 1;
}
.empty {
  margin: 0;
  padding: 20px 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-3);
}

.panel-swap-enter-active {
  transition: opacity var(--dur) var(--ease-out), translate var(--dur) var(--ease-out);
}
.panel-swap-leave-active {
  transition: opacity var(--dur-fast) ease-in, translate var(--dur-fast) ease-in;
}
.panel-swap-enter-from {
  opacity: 0;
  translate: 0 4px;
}
.panel-swap-leave-to {
  opacity: 0;
  translate: 0 -4px;
}

@media (max-width: 900px) {
  .calculator {
    flex: none;
    grid-template-columns: 1fr;
  }
  .history {
    min-height: 260px;
  }
}
</style>
