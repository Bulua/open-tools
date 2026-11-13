<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { locale, translationOf } from "@/locales";
import { CircleAlert, Copy, Check } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useClipboard } from "@/composables/useClipboard";
import { formatDateTime, relativeTime } from "@/utils/time";
import { DIALECTS, PRESETS, describeCron, detectDialect, nextRuns, parseCron, type CronDialect } from "./cron";
import { FIELD_RANGE, buildCron, buildField, convertCron, defaultState, fieldsOf, fillState, modesOf, updateField, type FieldKey, type FieldMode, type FieldState } from "./cronBuilder";

const { t } = useI18n();
/**
 * Cron 表达式：输入后实时显示说明和接下来的执行时间；也可以按字段点选生成。
 * 自动识别 Linux（5 位）、Spring（6 位）、Quartz（含 ?）格式，也可以手动指定。
 */
const expr = useStoredRef("cron.expr", "*/15 9-18 * * 1-5");
const dialectSetting = useStoredRef<"auto" | CronDialect>("cron.dialect", "auto");
const dialect = computed<CronDialect>(() => (dialectSetting.value === "auto" ? detectDialect(expr.value) : dialectSetting.value));

const result = computed(() => {
  try {
    const parsed = parseCron(expr.value, dialect.value);
    return { ok: true as const, parsed, text: describeCron(parsed) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
});

/** 手动选了另一种格式时，把当前表达式转换过去（表达式有误时只切换格式） */
const chooseDialect = (d: "auto" | CronDialect) => {
  const from = dialect.value;
  const ok = result.value.ok;
  dialectSetting.value = d;
  if (d !== "auto" && d !== from && ok) expr.value = convertCron(expr.value, from, d);
};

// ---------- 按字段生成 ----------

/** 各字段的选项；手写表达式时反向回填 */
const builder = ref(fillState(defaultState(), expr.value, dialect.value));
watch([expr, dialect], () => (builder.value = fillState(builder.value, expr.value, dialect.value)));

const fields = computed(() => fieldsOf(dialect.value));
const tabSetting = useStoredRef<FieldKey>("cron.tab", "minute");
const tab = computed(() => (fields.value.includes(tabSetting.value) ? tabSetting.value : fields.value[0]));
const field = computed(() => builder.value[tab.value]);
/** 当前字段可选的写法；手写的写法表示不了时多一项「手写」 */
const modes = computed<FieldMode[]>(() => [...modesOf(tab.value, dialect.value), ...(field.value.mode === "custom" ? (["custom"] as FieldMode[]) : [])]);

/** 每个字段在表达式里的写法，显示在选项卡上 */
const partOf = (key: FieldKey) => {
  const parts = expr.value.trim().split(/\s+/);
  const i = fields.value.indexOf(key);
  if (parts.length === fields.value.length) return parts[i];
  if (key === "year" && parts.length === fields.value.length - 1) return "*";
  return "—";
};

const set = (patch: Partial<FieldState>) => {
  builder.value = updateField(builder.value, tab.value, patch, dialect.value);
  expr.value = buildCron(builder.value, dialect.value);
};
/** 点到某一行就切换到这种写法 */
const pick = (mode: FieldMode) => field.value.mode !== mode && set({ mode });
const codeOf = (mode: FieldMode) => buildField(tab.value, { ...field.value, mode }, dialect.value);

/** 星期从周一排到周日（0 是周日） */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const weekdayName = (v: number) => new Date(2023, 0, 1 + v).toLocaleDateString(locale.value, { weekday: "short" });
const monthName = (v: number) => new Date(2023, v - 1, 1).toLocaleDateString(locale.value, { month: "short" });
const labelOf = (key: FieldKey, v: number) => (key === "week" ? weekdayName(v) : key === "month" ? monthName(v) : String(v));

const valuesOf = (key: FieldKey) => {
  if (key === "week") return WEEK_ORDER;
  const [min, max] = FIELD_RANGE[key];
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
};
const options = computed(() => valuesOf(tab.value).map((v) => ({ value: v, label: labelOf(tab.value, v) })));
/** 「指定」里可以点的值；年份只列出今后 12 年和已选的年份 */
const chips = computed(() => {
  if (tab.value !== "year") return valuesOf(tab.value);
  const year = new Date().getFullYear();
  return [...new Set([...Array.from({ length: 12 }, (_, i) => year + i), ...field.value.values])].sort((a, b) => a - b);
});
const toggle = (v: number) => {
  const f = field.value;
  if (f.mode !== "list") return set({ mode: "list", values: [v] });
  // 至少留一个值
  const values = f.values.includes(v) ? f.values.filter((x) => x !== v) : [...f.values, v];
  if (values.length) set({ values });
};
const nthOptions = computed(() => [1, 2, 3, 4, 5].map((n) => ({ value: n, label: t(`utility.cronB.ord.${n}`) })));
const weekOptions = computed(() => WEEK_ORDER.map((v) => ({ value: v, label: weekdayName(v) })));
/** 数字输入框：限制在范围内，空着或不是数字时不改 */
const setNumber = (prop: "step" | "offset", e: Event, min: number, max: number) => {
  const n = Math.round(Number((e.target as HTMLInputElement).value));
  if (Number.isFinite(n) && (e.target as HTMLInputElement).value !== "") set({ mode: prop === "step" ? "step" : "last", [prop]: Math.min(max, Math.max(min, n)) });
};

// ---------- 执行时间 ----------

// 每 30 秒刷新一次「现在」，执行时间和相对时间保持准确
const now = ref(Date.now());
let timer = 0;
const start = () => {
  now.value = Date.now();
  clearInterval(timer);
  timer = window.setInterval(() => (now.value = Date.now()), 30_000);
};
const stop = () => clearInterval(timer);
onMounted(start);
onActivated(start);
onDeactivated(stop);
onBeforeUnmount(stop);

const runs = computed(() => (result.value.ok ? nextRuns(result.value.parsed, new Date(now.value), 10) : []));

const usePreset = (presetExpr: string) => {
  // 常用表达式是 Linux 格式；当前选了 Spring / Quartz 时转换过去
  const d = dialectSetting.value;
  expr.value = d === "auto" || d === "unix" ? presetExpr : convertCron(presetExpr, "unix", d);
};

const { copied, copy } = useClipboard();
/** 星期的简称，跟着界面语言 */
const weekday = (d: Date) => d.toLocaleDateString(locale.value, { weekday: "short" });
const fieldName = (key: FieldKey) => t(`utility.f${key.charAt(0).toUpperCase()}${key.slice(1)}`);

useToolResult(() => result.value.ok ? `${expr.value}|${dialect.value}` : "");
</script>

<template>
  <div class="cron">
    <section class="card hero" :class="{ invalid: !result.ok }">
      <div class="format-row">
        <div class="seg" :title="t('utility.format')">
          <button :class="{ on: dialectSetting === 'auto' }" @click="chooseDialect('auto')">{{ t("utility.auto") }}</button>
          <button v-for="d in DIALECTS" :key="d.value" :class="{ on: dialectSetting === d.value }" :title="t(`utility.${d.fields}`)" @click="chooseDialect(d.value)">
            {{ d.label }}
          </button>
        </div>
        <span class="detected">
          <template v-if="dialectSetting === 'auto'">{{ t("utility.detected", { dialect: DIALECTS.find((d) => d.value === dialect)?.label }) }} · </template>
          {{ t(`utility.${DIALECTS.find((d) => d.value === dialect)?.fields}`) }}
        </span>
      </div>
      <div class="input-row">
        <input v-model="expr" class="expr" spellcheck="false" :placeholder="t('utility.cronPlaceholder')" />
        <button class="btn subtle" :class="{ ok: copied }" :title="t('utility.copyExpr')" @click="copy(expr)">
          <Check v-if="copied" :size="14" /><Copy v-else :size="14" />{{ t("utility.copy") }}
        </button>
      </div>
      <p v-if="result.ok" class="meaning">{{ result.text }}</p>
      <p v-else class="error"><CircleAlert :size="15" />{{ result.error }}</p>
      <div class="presets">
        <span class="label">{{ t("utility.common") }}</span>
        <button v-for="p in PRESETS" :key="p.expr" :title="p.expr" @click="usePreset(p.expr)">{{ translationOf(p.i18n, locale) ?? p.label }}</button>
      </div>
    </section>

    <div class="grid">
      <section class="card builder">
        <div class="card-title">{{ t("utility.cronB.title") }}</div>
        <div class="seg fill field-tabs">
          <button v-for="key in fields" :key="key" :class="{ on: tab === key }" @click="tabSetting = key">
            <span>{{ fieldName(key) }}</span>
            <code>{{ partOf(key) }}</code>
          </button>
        </div>

        <div class="opts">
          <div v-for="m in modes" :key="m" class="opt" :class="{ on: field.mode === m }" @click="pick(m)">
            <input type="radio" :checked="field.mode === m" :name="`cron-mode-${tab}`" />
            <div class="opt-body">
              <span v-if="m === 'every'">{{ t(`utility.cronB.every.${tab}`) }}</span>
              <span v-else-if="m === 'none'">{{ t(`utility.cronB.none.${tab}`) }}</span>
              <i18n-t v-else-if="m === 'step'" keypath="utility.cronB.step" tag="span" class="sentence">
                <template #start><AppSelect :model-value="field.start" size="sm" :options="options" @update:model-value="(v) => set({ mode: 'step', start: v })" /></template>
                <template #step>
                  <input class="field num" type="number" min="1" :max="FIELD_RANGE[tab][1]" :value="field.step" @change="setNumber('step', $event, 1, FIELD_RANGE[tab][1])" />
                </template>
                <template #unit>{{ t(`utility.cronB.unit.${tab}`) }}</template>
              </i18n-t>
              <i18n-t v-else-if="m === 'range'" keypath="utility.cronB.range" tag="span" class="sentence">
                <template #from><AppSelect :model-value="field.from" size="sm" :options="options" @update:model-value="(v) => set({ mode: 'range', from: v })" /></template>
                <template #to><AppSelect :model-value="field.to" size="sm" :options="options" @update:model-value="(v) => set({ mode: 'range', to: v })" /></template>
              </i18n-t>
              <template v-else-if="m === 'list'">
                <span>{{ t("utility.cronB.list") }}</span>
                <div class="chips" :class="tab">
                  <button v-for="v in chips" :key="v" :class="{ on: field.mode === 'list' && field.values.includes(v) }" @click="toggle(v)">{{ labelOf(tab, v) }}</button>
                </div>
              </template>
              <i18n-t v-else-if="m === 'last' && tab === 'day'" keypath="utility.cronB.lastDay" tag="span" class="sentence">
                <template #offset><input class="field num" type="number" min="0" max="30" :value="field.offset" @change="setNumber('offset', $event, 0, 30)" /></template>
              </i18n-t>
              <i18n-t v-else-if="m === 'last'" keypath="utility.cronB.lastWeek" tag="span" class="sentence">
                <template #weekday><AppSelect :model-value="field.weekday" size="sm" :options="weekOptions" @update:model-value="(v) => set({ mode: 'last', weekday: v })" /></template>
              </i18n-t>
              <i18n-t v-else-if="m === 'nearest'" keypath="utility.cronB.nearest" tag="span" class="sentence">
                <template #day><AppSelect :model-value="field.day" size="sm" :options="options" @update:model-value="(v) => set({ mode: 'nearest', day: v })" /></template>
              </i18n-t>
              <span v-else-if="m === 'lastWeekday'">{{ t("utility.cronB.lastWeekday") }}</span>
              <i18n-t v-else-if="m === 'nth'" keypath="utility.cronB.nth" tag="span" class="sentence">
                <template #nth><AppSelect :model-value="field.nth" size="sm" :options="nthOptions" @update:model-value="(v) => set({ mode: 'nth', nth: v })" /></template>
                <template #weekday><AppSelect :model-value="field.weekday" size="sm" :options="weekOptions" @update:model-value="(v) => set({ mode: 'nth', weekday: v })" /></template>
              </i18n-t>
              <span v-else-if="m === 'custom'">{{ t("utility.cronB.custom") }}</span>
            </div>
            <code class="opt-code">{{ codeOf(m) }}</code>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">{{ t("utility.nextRuns") }}</div>
        <ol v-if="runs.length" class="runs">
          <li v-for="(run, i) in runs" :key="run.getTime()">
            <span class="index">{{ i + 1 }}</span>
            <span class="time">{{ formatDateTime(run) }}</span>
            <span class="week">{{ weekday(run) }}</span>
            <span class="relative">{{ relativeTime(run.getTime(), now) }}</span>
          </li>
        </ol>
        <p v-else class="empty">{{ result.ok ? t("utility.noRuns") : t("utility.badExpr") }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cron {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.hero {
  padding: 14px 16px;
  gap: 10px;
}
.format-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.detected {
  font-size: 12px;
  color: var(--text-3);
}
.input-row {
  display: flex;
  gap: 8px;
}
.expr {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--bg-sunken);
  outline: none;
  font-family: var(--font-mono);
  font-size: 22px;
  letter-spacing: 1px;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur) var(--ease-out);
}
.expr:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.invalid .expr {
  border-color: var(--danger);
}
.input-row .btn {
  height: 44px;
}
.btn.ok {
  color: var(--success);
}
.meaning {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 22px;
  line-height: 1.4;
  color: var(--text);
}
.error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0 0;
  font-size: 14px;
}
.presets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.presets .label {
  margin-right: 2px;
  font-size: 12px;
  color: var(--text-3);
}
.presets button {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: none;
  font-size: 12px;
  color: var(--text-2);
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.presets button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* 左边按字段生成，右边执行时间 */
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

/* 字段选项卡：名称下面是这个字段当前的写法 */
.field-tabs {
  margin: 10px 12px 4px;
}
.field-tabs button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  height: auto;
  padding: 4px 6px;
  min-width: 0;
}
.field-tabs code {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 400;
  color: var(--text-3);
}
.field-tabs button.on code {
  color: var(--accent);
}

.opts {
  display: flex;
  flex-direction: column;
  padding: 4px 6px 8px;
}
.opt {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.opt:hover {
  background: var(--hover);
}
.opt.on {
  color: var(--text);
}
.opt input[type="radio"] {
  flex-shrink: 0;
  margin: 7px 0 0;
  accent-color: var(--accent);
}
.opt-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 28px;
  justify-content: center;
}
.sentence {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
/* 句子里的下拉框不占满整行，和文字排在同一行 */
.sentence :deep(.app-select) {
  flex: none;
  width: 88px;
}
.opt-code {
  flex-shrink: 0;
  margin-top: 5px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
}
.opt.on .opt-code {
  color: var(--accent);
}
.num {
  width: 64px;
  height: 28px;
  padding: 0 8px;
}

/* 「指定」里可以点选的值 */
.chips {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
  gap: 4px;
}
.chips.month,
.chips.week,
.chips.year {
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
}
.chips button {
  height: 26px;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-2);
  transition: border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.chips.month button,
.chips.week button {
  font-family: var(--font-sans);
}
.chips button:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.chips button.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.runs {
  margin: 0;
  padding: 6px 0;
  list-style: none;
}
.runs li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 5px 14px;
  font-size: 13px;
  white-space: nowrap;
}
.runs li:first-child .time {
  color: var(--accent);
  font-weight: 600;
}
.index {
  flex: 0 0 18px;
  font-size: 12px;
  color: var(--text-3);
  text-align: right;
}
.time {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.week {
  color: var(--text-2);
}
.relative {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
}
.empty {
  margin: 0;
  padding: 16px;
  font-size: 13px;
  color: var(--text-3);
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
