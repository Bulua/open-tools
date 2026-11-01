<script setup lang="ts">
import { computed, ref } from "vue";
import DateTimePicker from "@/components/common/DateTimePicker.vue";
import { AlarmClock, Pause, Play, Plus, RotateCcw, Timer, Trash2 } from "lucide-vue-next";
import { useStoredRef } from "@/composables/useStoredRef";
import { formatDateTime, relativeTime } from "@/utils/time";
import { REPEATS, formatRemaining, progressOf, remainingOf, toMs, type CountdownItem, type Repeat } from "../countdown";
import { addCountdown, countdowns, now, removeCountdown, restart, togglePause } from "../countdownStore";

/**
 * 倒计时：到指定时间（可每天 / 每周 / 每月 / 每年重复），或者计时器（几分钟后提醒，可暂停）。
 * 倒计时保存在本地，关闭程序也不会丢失，直到手动删除；到期时在任何工具里都会弹出提醒并播放提示音。
 */
const kind = useStoredRef<"date" | "timer">("countdown.kind", "date");
const title = ref("");

// ---------- 到指定时间 ----------
const pad = (n: number) => String(n).padStart(2, "0");
const toInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const tomorrowNine = () => {
  const d = new Date();
  return toInput(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9, 0));
};
const targetInput = ref(tomorrowNine());
const repeat = ref<Repeat>("none");

const QUICK_DATES: { label: string; make: () => Date; title?: string }[] = [
  { label: "今天下班", make: () => atTime(0, 18), title: "下班" },
  { label: "明天 9 点", make: () => atTime(1, 9) },
  {
    label: "下周一",
    make: () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (((8 - d.getDay()) % 7) || 7), 9, 0);
    },
  },
  { label: "元旦", make: () => new Date(new Date().getFullYear() + 1, 0, 1), title: "元旦" },
  {
    label: "周末",
    make: () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((6 - d.getDay() + 7) % 7 || 7), 0, 0);
    },
    title: "周末",
  },
];
function atTime(days: number, hour: number) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, hour, 0);
}
const useQuickDate = (q: (typeof QUICK_DATES)[number]) => {
  targetInput.value = toInput(q.make());
  if (q.title && !title.value) title.value = q.title;
};

// ---------- 计时器 ----------
const hours = ref(0);
const minutes = ref(25);
const seconds = ref(0);
const QUICK_TIMERS = [1, 3, 5, 10, 15, 25, 30, 60];
const useQuickTimer = (m: number) => {
  hours.value = Math.floor(m / 60);
  minutes.value = m % 60;
  seconds.value = 0;
};

// ---------- 添加 ----------
const error = ref("");
const add = () => {
  error.value = "";
  if (kind.value === "date") {
    const target = new Date(targetInput.value).getTime();
    if (!Number.isFinite(target)) return (error.value = "请选择时间");
    if (target <= Date.now() && repeat.value === "none") return (error.value = "这个时间已经过去了");
    addCountdown({ title: title.value.trim() || "倒计时", target, repeat: repeat.value });
  } else {
    const duration = toMs(hours.value, minutes.value, seconds.value);
    if (duration <= 0) return (error.value = "请设置时长");
    addCountdown({ title: title.value.trim() || `${formatRemaining(duration)} 计时`, target: Date.now() + duration, duration, repeat: "none" });
  }
  title.value = "";
};

// ---------- 列表 ----------
const sorted = computed(() =>
  [...countdowns.value].sort((a, b) => Number(a.done) - Number(b.done) || remainingOf(a, now.value) - remainingOf(b, now.value)),
);
const repeatLabel = (r: Repeat) => REPEATS.find((x) => x.value === r)?.label ?? "";

/** 删除要点两次，避免误删 */
const confirming = ref<string | null>(null);
let confirmTimer = 0;
const onDelete = (item: CountdownItem) => {
  if (confirming.value === item.id) {
    removeCountdown(item.id);
    confirming.value = null;
    return;
  }
  confirming.value = item.id;
  clearTimeout(confirmTimer);
  confirmTimer = window.setTimeout(() => (confirming.value = null), 3000);
};
</script>

<template>
  <div class="countdown">
    <aside class="card panel">
      <section class="section">
        <div class="seg fill">
          <button :class="{ on: kind === 'date' }" @click="kind = 'date'"><AlarmClock :size="14" />到指定时间</button>
          <button :class="{ on: kind === 'timer' }" @click="kind = 'timer'"><Timer :size="14" />计时器</button>
        </div>
        <input v-model="title" class="field" maxlength="40" :placeholder="kind === 'date' ? '名称，例如 项目上线、生日' : '名称，例如 番茄钟、泡面'" @keydown.enter="add" />
      </section>

      <section v-if="kind === 'date'" class="section">
        <h3>时间</h3>
        <DateTimePicker v-model="targetInput" />
        <div class="chips">
          <button v-for="q in QUICK_DATES" :key="q.label" @click="useQuickDate(q)">{{ q.label }}</button>
        </div>
        <h3>重复</h3>
        <div class="seg fill">
          <button v-for="r in REPEATS" :key="r.value" :class="{ on: repeat === r.value }" @click="repeat = r.value">{{ r.label }}</button>
        </div>
      </section>

      <section v-else class="section">
        <h3>时长</h3>
        <div class="duration">
          <label><input v-model.number="hours" class="field" type="number" min="0" max="999" /><span>时</span></label>
          <label><input v-model.number="minutes" class="field" type="number" min="0" max="59" /><span>分</span></label>
          <label><input v-model.number="seconds" class="field" type="number" min="0" max="59" /><span>秒</span></label>
        </div>
        <div class="chips">
          <button v-for="m in QUICK_TIMERS" :key="m" @click="useQuickTimer(m)">{{ m >= 60 ? `${m / 60} 小时` : `${m} 分钟` }}</button>
        </div>
      </section>

      <section class="section">
        <p v-if="error" class="error">{{ error }}</p>
        <button class="btn primary full" @click="add"><Plus :size="14" />添加倒计时</button>
        <p class="tip">倒计时会一直保存，关闭程序也不会丢失；到期时弹出提醒并播放提示音。</p>
      </section>
    </aside>

    <section class="list">
      <div v-if="!sorted.length" class="card empty">
        <AlarmClock :size="28" />
        <p>还没有倒计时</p>
        <span>在左侧设置时间或时长，添加后会显示在这里</span>
      </div>

      <article
        v-for="item in sorted"
        :key="item.id"
        class="card item"
        :class="{ done: item.done, paused: item.pausedRemaining !== undefined }"
      >
        <header>
          <component :is="item.duration ? Timer : AlarmClock" :size="15" class="kind" />
          <b class="name" :title="item.title">{{ item.title }}</b>
          <span v-if="item.repeat !== 'none'" class="tag">{{ repeatLabel(item.repeat) }}</span>
          <span v-if="item.pausedRemaining !== undefined" class="tag">已暂停</span>
        </header>

        <div v-if="item.done" class="remaining over">已到期</div>
        <div v-else class="remaining">{{ formatRemaining(remainingOf(item, now)) }}</div>

        <div class="progress"><i :style="{ width: `${progressOf(item, now) * 100}%` }" /></div>

        <footer>
          <span class="when">
            {{ item.done ? `${relativeTime(item.target, now)}到期` : item.pausedRemaining !== undefined ? "暂停中" : formatDateTime(new Date(item.target)) }}
          </span>
          <template v-if="item.duration">
            <button v-if="!item.done" class="icon-btn" :title="item.pausedRemaining !== undefined ? '继续' : '暂停'" @click="togglePause(item)">
              <Play v-if="item.pausedRemaining !== undefined" :size="14" />
              <Pause v-else :size="14" />
            </button>
            <button class="icon-btn" title="重新开始" @click="restart(item)"><RotateCcw :size="14" /></button>
          </template>
          <button class="delete" :class="{ confirm: confirming === item.id }" :title="confirming === item.id ? '再点一次确认删除' : '删除'" @click="onDelete(item)">
            <Trash2 :size="14" />{{ confirming === item.id ? "确认删除" : "" }}
          </button>
        </footer>
      </article>
    </section>
  </div>
</template>

<style scoped>
.countdown {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.panel {
  flex: 0 0 300px;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}
.section + .section {
  border-top: 1px solid var(--border);
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.seg.fill {
  display: flex;
}
.seg.fill button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 4px;
}
.field {
  height: 34px;
  font-size: 13px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chips button {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: none;
  font-size: 12px;
  color: var(--text-2);
}
.chips button:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.duration {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.duration label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-3);
}
.duration .field {
  min-width: 0;
  text-align: center;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}
.btn.full {
  justify-content: center;
}
.tip {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
.error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}

.list {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.empty {
  grid-column: 1 / -1;
  align-items: center;
  gap: 6px;
  padding: 60px 20px;
  color: var(--text-3);
}
.empty p {
  margin: 6px 0 0;
  font-size: 15px;
  color: var(--text-2);
}
.empty span {
  font-size: 12px;
}
.item {
  padding: 14px 16px 10px;
  gap: 8px;
}
.item header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.kind {
  flex-shrink: 0;
  color: var(--accent);
}
.name {
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--active);
  font-size: 11px;
  color: var(--text-2);
}
.remaining {
  font-family: var(--font-serif);
  font-size: 34px;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.remaining.over {
  color: var(--accent);
}
.paused .remaining {
  color: var(--text-3);
}
.progress {
  height: 4px;
  border-radius: 2px;
  background: var(--active);
  overflow: hidden;
}
.progress i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 1s linear;
}
.done .progress i {
  background: var(--success);
}
.item footer {
  display: flex;
  align-items: center;
  gap: 2px;
}
.when {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.delete {
  height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-3);
  font-size: 12px;
}
.delete:hover {
  background: var(--hover);
  color: var(--danger);
}
.delete.confirm {
  background: var(--danger-soft);
  color: var(--danger);
}
</style>
