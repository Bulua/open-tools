<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import DateTimePicker from "@/components/common/DateTimePicker.vue";
import ProgressBar from "@/components/common/ProgressBar.vue";
import { AlarmClock, Pause, Play, Plus, RotateCcw, Timer, Trash2 } from "lucide-vue-next";
import { useStoredRef } from "@/composables/useStoredRef";
import { formatDateTime, relativeTime } from "@/utils/time";
import { REPEATS, formatRemaining, progressOf, remainingOf, toMs, type CountdownItem, type Repeat } from "../countdown";
import { addCountdown, countdowns, now, removeCountdown, restart, togglePause } from "../countdownStore";

const { t } = useI18n();
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

/** label、title 是文案 key（utility.qToday 等） */
const QUICK_DATES: { label: string; make: () => Date; title?: string }[] = [
  { label: "qToday", make: () => atTime(0, 18), title: "qTodayTitle" },
  { label: "qTomorrow", make: () => atTime(1, 9) },
  {
    label: "qMonday",
    make: () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (((8 - d.getDay()) % 7) || 7), 9, 0);
    },
  },
  { label: "qNewYear", make: () => new Date(new Date().getFullYear() + 1, 0, 1), title: "qNewYear" },
  {
    label: "qWeekend",
    make: () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((6 - d.getDay() + 7) % 7 || 7), 0, 0);
    },
    title: "qWeekend",
  },
];
function atTime(days: number, hour: number) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, hour, 0);
}
const useQuickDate = (q: (typeof QUICK_DATES)[number]) => {
  targetInput.value = toInput(q.make());
  if (q.title && !title.value) title.value = t(`utility.${q.title}`);
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
    if (!Number.isFinite(target)) return (error.value = t("utility.pickTime"));
    if (target <= Date.now() && repeat.value === "none") return (error.value = t("utility.timePassed"));
    addCountdown({ title: title.value.trim() || t("utility.countdown"), target, repeat: repeat.value });
  } else {
    const duration = toMs(hours.value, minutes.value, seconds.value);
    if (duration <= 0) return (error.value = t("utility.needDuration"));
    addCountdown({ title: title.value.trim() || t("utility.timerName", { time: formatRemaining(duration) }), target: Date.now() + duration, duration, repeat: "none" });
  }
  title.value = "";
};

// ---------- 列表 ----------
const sorted = computed(() =>
  [...countdowns.value].sort((a, b) => Number(a.done) - Number(b.done) || remainingOf(a, now.value) - remainingOf(b, now.value)),
);
const repeatLabel = (r: Repeat) => t(`utility.${REPEATS.find((x) => x.value === r)?.label ?? "repeatNone"}`);

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
          <button :class="{ on: kind === 'date' }" @click="kind = 'date'"><AlarmClock :size="14" />{{ t("utility.toTime") }}</button>
          <button :class="{ on: kind === 'timer' }" @click="kind = 'timer'"><Timer :size="14" />{{ t("utility.timer") }}</button>
        </div>
        <input v-model="title" class="field" maxlength="40" :placeholder="kind === 'date' ? t('utility.namePlaceholderDate') : t('utility.namePlaceholderTimer')" @keydown.enter="add" />
      </section>

      <section v-if="kind === 'date'" class="section">
        <h3>{{ t("utility.time") }}</h3>
        <DateTimePicker v-model="targetInput" />
        <div class="chips">
          <button v-for="q in QUICK_DATES" :key="q.label" @click="useQuickDate(q)">{{ t(`utility.${q.label}`) }}</button>
        </div>
        <h3>{{ t("utility.repeat") }}</h3>
        <div class="seg fill">
          <button v-for="r in REPEATS" :key="r.value" :class="{ on: repeat === r.value }" @click="repeat = r.value">{{ t(`utility.${r.label}`) }}</button>
        </div>
      </section>

      <section v-else class="section">
        <h3>{{ t("utility.duration") }}</h3>
        <div class="duration">
          <label><input v-model.number="hours" class="field" type="number" min="0" max="999" /><span>{{ t("utility.h") }}</span></label>
          <label><input v-model.number="minutes" class="field" type="number" min="0" max="59" /><span>{{ t("utility.m") }}</span></label>
          <label><input v-model.number="seconds" class="field" type="number" min="0" max="59" /><span>{{ t("utility.s") }}</span></label>
        </div>
        <div class="chips">
          <button v-for="m in QUICK_TIMERS" :key="m" @click="useQuickTimer(m)">{{ m >= 60 ? t("utility.hours", { n: m / 60 }) : t("utility.minutes", { n: m }) }}</button>
        </div>
      </section>

      <section class="section">
        <p v-if="error" class="error">{{ error }}</p>
        <button class="btn primary full" @click="add"><Plus :size="14" />{{ t("utility.addCountdown") }}</button>
        <p class="tip">{{ t("utility.countdownTip") }}</p>
      </section>
    </aside>

    <section class="list">
      <div v-if="!sorted.length" class="card empty">
        <AlarmClock :size="28" />
        <p>{{ t("utility.noCountdowns") }}</p>
        <span>{{ t("utility.noCountdownsHint") }}</span>
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
          <span v-if="item.pausedRemaining !== undefined" class="tag">{{ t("utility.paused") }}</span>
        </header>

        <div v-if="item.done" class="remaining over">{{ t("utility.expired") }}</div>
        <div v-else class="remaining">{{ formatRemaining(remainingOf(item, now)) }}</div>

        <ProgressBar :value="progressOf(item, now)" />

        <footer>
          <span class="when">
            {{ item.done ? t("utility.expiredAt", { time: relativeTime(item.target, now) }) : item.pausedRemaining !== undefined ? t("utility.pausing") : formatDateTime(new Date(item.target)) }}
          </span>
          <template v-if="item.duration">
            <button v-if="!item.done" class="icon-btn" :title="item.pausedRemaining !== undefined ? t('utility.resume') : t('utility.pause')" @click="togglePause(item)">
              <Play v-if="item.pausedRemaining !== undefined" :size="14" />
              <Pause v-else :size="14" />
            </button>
            <button class="icon-btn" :title="t('utility.restart')" @click="restart(item)"><RotateCcw :size="14" /></button>
          </template>
          <button class="delete" :class="{ confirm: confirming === item.id }" :title="confirming === item.id ? t('utility.confirmDeleteTitle') : t('utility.delete')" @click="onDelete(item)">
            <Trash2 :size="14" />{{ confirming === item.id ? t("utility.confirmDelete") : "" }}
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
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.seg.fill button {
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
/* 每秒更新一次，匀速过渡看起来是连续走动的 */
.progress :deep(i) {
  transition: width 1s linear;
}
.done .progress :deep(i) {
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
