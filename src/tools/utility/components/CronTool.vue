<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";
import { CircleAlert, Copy, Check } from "lucide-vue-next";
import ToolActions from "@/components/tool/ToolActions.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useClipboard } from "@/composables/useClipboard";
import { formatDateTime, relativeTime } from "@/utils/time";
import { DIALECTS, PRESETS, describeCron, detectDialect, fieldRows, nextRuns, parseCron, type CronDialect } from "../cron";

/**
 * Cron 表达式：输入后实时显示中文说明、每个字段的含义和接下来的执行时间。
 * 自动识别 Linux（5 位）、Spring（6 位）、Quartz（含 ?）格式，也可以手动指定。
 */
const expr = useStoredRef("cron.expr", "*/15 9-18 * * 1-5");
const dialectSetting = useStoredRef<"auto" | CronDialect>("cron.dialect", "auto");
const dialect = computed<CronDialect>(() => (dialectSetting.value === "auto" ? detectDialect(expr.value) : dialectSetting.value));

const result = computed(() => {
  try {
    const parsed = parseCron(expr.value, dialect.value);
    return { ok: true as const, parsed, text: describeCron(parsed), rows: fieldRows(parsed) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
});

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
  // 常用表达式是 Linux 格式；当前选了 Spring / Quartz 时补上秒
  if (dialectSetting.value === "spring") expr.value = `0 ${presetExpr}`;
  else if (dialectSetting.value === "quartz") {
    const [m, h, d, mon, w] = presetExpr.split(" ");
    expr.value = `0 ${m} ${h} ${w === "*" ? d : "?"} ${mon} ${w === "*" ? "?" : w.replace(/\d/g, (n) => String(Number(n) + 1))}`;
  } else expr.value = presetExpr;
};

const { copied, copy } = useClipboard();
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

const SYNTAX = [
  ["*", "任意值"],
  [",", "列举，如 1,15"],
  ["-", "范围，如 1-5"],
  ["/", "间隔，如 */10、5/15"],
  ["?", "不指定（Quartz 的日或周）"],
  ["L", "最后，如日写 L、周写 5L"],
  ["#", "第几个周几，如 MON#2"],
];
</script>

<template>
  <ToolActions>
    <div class="seg" title="表达式格式">
      <button :class="{ on: dialectSetting === 'auto' }" @click="dialectSetting = 'auto'">自动识别</button>
      <button v-for="d in DIALECTS" :key="d.value" :class="{ on: dialectSetting === d.value }" :title="d.fields" @click="dialectSetting = d.value">
        {{ d.label }}
      </button>
    </div>
  </ToolActions>

  <div class="cron">
    <section class="card hero" :class="{ invalid: !result.ok }">
      <div class="input-row">
        <input v-model="expr" class="expr" spellcheck="false" placeholder="例如 */5 * * * *" />
        <button class="btn subtle" :class="{ ok: copied }" title="复制表达式" @click="copy(expr)">
          <Check v-if="copied" :size="14" /><Copy v-else :size="14" />复制
        </button>
      </div>
      <div class="fields-hint">
        <span>{{ DIALECTS.find((d) => d.value === dialect)?.label }} 格式：</span>
        <span v-for="f in DIALECTS.find((d) => d.value === dialect)?.fields.split(' ')" :key="f" class="slot">{{ f }}</span>
      </div>
      <p v-if="result.ok" class="meaning">{{ result.text }}</p>
      <p v-else class="error"><CircleAlert :size="15" />{{ result.error }}</p>
      <div class="presets">
        <span class="label">常用</span>
        <button v-for="p in PRESETS" :key="p.expr" :title="p.expr" @click="usePreset(p.expr)">{{ p.label }}</button>
      </div>
    </section>

    <div class="grid">
      <section class="card">
        <div class="card-title">接下来的执行时间</div>
        <ol v-if="runs.length" class="runs">
          <li v-for="(t, i) in runs" :key="t.getTime()">
            <span class="index">{{ i + 1 }}</span>
            <span class="time">{{ formatDateTime(t) }}</span>
            <span class="week">周{{ WEEK[t.getDay()] }}</span>
            <span class="relative">{{ relativeTime(t.getTime(), now) }}</span>
          </li>
        </ol>
        <p v-else class="empty">{{ result.ok ? "未来 5 年内没有匹配的时间" : "表达式有误，无法计算" }}</p>
      </section>

      <section class="card">
        <div class="card-title">各字段含义</div>
        <table v-if="result.ok" class="table">
          <tr v-for="r in result.rows" :key="r.name">
            <th>{{ r.name }}</th>
            <td class="mono">{{ r.text }}</td>
            <td>{{ r.values }}</td>
          </tr>
        </table>
        <p v-else class="empty">—</p>
      </section>

      <section class="card">
        <div class="card-title">语法速查</div>
        <table class="table">
          <tr v-for="[k, v] in SYNTAX" :key="k">
            <th class="mono">{{ k }}</th>
            <td>{{ v }}</td>
          </tr>
        </table>
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
  gap: 8px;
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
  transition: border-color 0.15s, box-shadow 0.15s;
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
.fields-hint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
}
.slot {
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--active);
  color: var(--text-2);
}
.meaning {
  margin: 2px 0 0;
  font-family: var(--font-serif);
  font-size: 22px;
  line-height: 1.4;
  color: var(--text);
}
.error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 0;
  font-size: 14px;
}
.presets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 4px;
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
}
.presets button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* 三栏并排，常见窗口尺寸下一屏显示完整，不出现滚动条 */
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 0.85fr);
  gap: 14px;
  align-items: start;
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
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.table tr + tr {
  border-top: 1px solid var(--border);
}
.table th {
  width: 40px;
  padding: 6px 0 6px 14px;
  text-align: left;
  font-weight: 500;
  color: var(--text-3);
}
.table td {
  padding: 6px 14px 6px 8px;
}
.table td.mono {
  width: 84px;
  word-break: break-all;
  font-family: var(--font-mono);
  color: var(--accent);
}
.mono {
  font-family: var(--font-mono);
}
.empty {
  margin: 0;
  padding: 16px;
  font-size: 13px;
  color: var(--text-3);
}
@media (max-width: 1100px) {
  .grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .grid > :last-child {
    display: none;
  }
}
</style>
