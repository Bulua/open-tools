<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Delete, Trash2 } from "lucide-vue-next";
import ToolActions from "@/components/tool/ToolActions.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useClipboard } from "@/composables/useClipboard";
import { evaluate, formatResult, type AngleUnit } from "../calculator";

const { t } = useI18n();
/**
 * 计算器：可以直接用键盘输入整个算式，也可以点按键；输入时实时显示结果。
 * 回车或「=」把算式记入历史，点历史记录可以再次使用。
 */
const angle = useStoredRef<AngleUnit>("calculator.angle", "deg");
const history = useStoredRef<{ expr: string; result: string }[]>("calculator.history", []);

const expr = ref("");
const inputEl = ref<HTMLInputElement>();

const live = computed(() => {
  if (!expr.value.trim()) return { ok: true as const, text: "" };
  try {
    return { ok: true as const, text: formatResult(evaluate(expr.value, angle.value)) };
  } catch (e) {
    return { ok: false as const, text: e instanceof Error ? e.message : String(e) };
  }
});

const focus = () => nextTick(() => inputEl.value?.focus());

/**
 * 光标位置。连续快速点按键时，输入框的光标要等界面刷新后才更新，
 * 所以自己记住下一次应该插入的位置，避免顺序错乱。
 */
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

/** 在光标处插入内容 */
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

/** 计算并记入历史，结果作为下一步的起点 */
const equals = () => {
  if (!expr.value.trim() || !live.value.ok) return;
  const result = live.value.text;
  history.value = [{ expr: expr.value, result }, ...history.value].slice(0, 50);
  expr.value = result;
  moveCaret(result.length);
};

const { copy } = useClipboard();

// 按键布局（4 列）：insert 是点击时插入的内容，action 是特殊操作
type Key = { label: string; insert?: string; action?: () => void; kind?: "op" | "fn" | "eq"; title?: string };
const KEYS: Key[] = [
  { label: "sin", insert: "sin(", kind: "fn" },
  { label: "cos", insert: "cos(", kind: "fn" },
  { label: "tan", insert: "tan(", kind: "fn" },
  { label: "π", insert: "π", kind: "fn" },
  { label: "ln", insert: "ln(", kind: "fn" },
  { label: "log", insert: "log(", kind: "fn", title: "kLog" },
  { label: "√", insert: "√", kind: "fn" },
  { label: "e", insert: "e", kind: "fn" },
  { label: "(", insert: "(", kind: "fn" },
  { label: ")", insert: ")", kind: "fn" },
  { label: "xʸ", insert: "^", kind: "fn", title: "kPow" },
  { label: "n!", insert: "!", kind: "fn", title: "kFact" },
  { label: "AC", action: clear, kind: "op", title: "kClear" },
  { label: "⌫", action: backspace, kind: "op", title: "kBack" },
  { label: "%", insert: "%", kind: "op", title: "kPercent" },
  { label: "÷", insert: "÷", kind: "op" },
  { label: "7", insert: "7" },
  { label: "8", insert: "8" },
  { label: "9", insert: "9" },
  { label: "×", insert: "×", kind: "op" },
  { label: "4", insert: "4" },
  { label: "5", insert: "5" },
  { label: "6", insert: "6" },
  { label: "−", insert: "-", kind: "op" },
  { label: "1", insert: "1" },
  { label: "2", insert: "2" },
  { label: "3", insert: "3" },
  { label: "+", insert: "+", kind: "op" },
  { label: "x²", insert: "^2", kind: "op", title: "kSquare" },
  { label: "0", insert: "0" },
  { label: ".", insert: "." },
  { label: "=", action: equals, kind: "eq", title: "kEquals" },
];
const press = (k: Key) => (k.action ? k.action() : insert(k.insert!));

useToolResult(() => live.value.ok && live.value.text ? `${expr.value}|${angle.value}` : "");
</script>

<template>
  <ToolActions>
    <div class="seg" :title="t('utility.angleUnit')">
      <button :class="{ on: angle === 'deg' }" @click="angle = 'deg'">{{ t("utility.deg") }}</button>
      <button :class="{ on: angle === 'rad' }" @click="angle = 'rad'">{{ t("utility.rad") }}</button>
    </div>
  </ToolActions>

  <div class="calculator">
    <section class="card pad">
      <!-- 显示屏：可直接键盘输入 -->
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
        <div class="live" :class="{ error: !live.ok }">
          <template v-if="live.text">{{ live.ok ? `= ${live.text}` : live.text }}</template>
        </div>
      </div>

      <div class="keys">
        <button v-for="k in KEYS" :key="k.label" class="key" :class="k.kind" :title="k.title && t(`utility.${k.title}`)" @click="press(k)">
          <Delete v-if="k.label === '⌫'" :size="18" />
          <template v-else>{{ k.label }}</template>
        </button>
      </div>
    </section>

    <section class="card history">
      <header class="card-title">
        {{ t("utility.history") }}
        <button v-if="history.length" class="icon-btn push" :title="t('utility.clearHistory')" @click="history = []"><Trash2 :size="14" /></button>
      </header>
      <ul v-if="history.length" class="records">
        <li v-for="(h, i) in history" :key="i" class="record">
          <button class="record-expr" :title="t('utility.useExpr')" @click="expr = h.expr; focus()">{{ h.expr }}</button>
          <button class="record-result" :title="t('utility.useResult')" @click="insert(h.result)" @contextmenu.prevent="copy(h.result)">
            = {{ h.result }}
          </button>
        </li>
      </ul>
      <p v-else class="empty">{{ t("utility.historyEmpty") }}</p>
    </section>
  </div>
</template>

<style scoped>
.calculator {
  display: grid;
  grid-template-columns: minmax(340px, 440px) minmax(0, 1fr);
  align-items: start;
  gap: 14px;
}
@media (max-width: 900px) {
  .calculator {
    grid-template-columns: 1fr;
  }
}

.pad {
  padding: 14px;
  gap: 14px;
}
.display {
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--bg-sunken);
  text-align: right;
}
.expr {
  width: 100%;
  border: none;
  outline: none;
  background: none;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 24px;
  color: var(--text);
}
.expr::placeholder {
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-3);
}
.live {
  min-height: 24px;
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-2);
  word-break: break-all;
}
.live.error {
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--danger);
}

.keys {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.key {
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font-size: 18px;
  transition: background 0.1s, transform 0.05s;
}
.key:hover {
  background: var(--hover);
}
.key:active {
  transform: translateY(1px);
}
.key.fn {
  height: 36px;
  background: var(--bg-sunken);
  color: var(--text-2);
  font-size: 13px;
}
.key.op {
  background: var(--bg-sunken);
  color: var(--accent);
}
.key.eq {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.key.eq:hover {
  background: var(--accent-hover);
}

.history {
  min-height: 300px;
}
.push {
  margin-left: auto;
}
.records {
  list-style: none;
  margin: 0;
  padding: 6px;
  max-height: 520px;
  overflow-y: auto;
}
.record {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 8px 10px;
  border-radius: 8px;
}
.record + .record {
  border-top: 1px solid var(--border);
}
.record:hover {
  background: var(--hover);
}
.record button {
  max-width: 100%;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-mono);
  text-align: right;
  word-break: break-all;
}
.record-expr {
  font-size: 13px;
  color: var(--text-3);
}
.record-result {
  font-size: 18px;
  color: var(--text);
}
.record button:hover {
  color: var(--accent);
}
.empty {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-3);
}
</style>
