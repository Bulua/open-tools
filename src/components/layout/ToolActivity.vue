<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { toolActivity } from "@/composables/toolLibrary";
import { activityCalendar, activityDateKey } from "@/utils/toolActivity";
import { now } from "@/tools/utility/countdownStore";

const { t, locale } = useI18n();
// 日期按天变化，后台每秒更新的时钟不会导致热力图反复重建。
const today = computed(() => activityDateKey(new Date(now.value)));
const days = computed(() => activityCalendar(toolActivity.value, new Date(`${today.value}T12:00:00`)));
const total = computed(() => days.value.reduce((sum, day) => sum + (day?.count ?? 0), 0));
const weeks = computed(() => days.value.length / 7);
const months = computed(() => {
  const format = new Intl.DateTimeFormat(locale.value, { month: "short" });
  return Array.from({ length: weeks.value }, (_, week) => {
    const day = days.value.slice(week * 7, week * 7 + 7).find((item) => item?.date.getDate() === 1);
    return day ? { week: week + 1, label: format.format(day.date) } : null;
  }).filter((item) => item !== null);
});
const weekdays = computed(() => {
  const format = new Intl.DateTimeFormat(locale.value, { weekday: "short" });
  return [1, 3, 5].map((day) => ({ day, label: format.format(new Date(2026, 0, 4 + day)) }));
});
const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { year: "numeric", month: "long", day: "numeric" }));
</script>

<template>
  <section class="activity" :aria-label="t('home.activityTitle')">
    <header class="activity-heading">
      <h2>{{ t('home.activityTotal', { n: total }) }}</h2>
      <span>{{ t('home.activityToday', { n: toolActivity[today] ?? 0 }) }}</span>
    </header>
    <div class="activity-scroll">
      <div class="calendar" :style="{ '--weeks': weeks }">
        <div class="months" aria-hidden="true">
          <span v-for="month in months" :key="month.week" :style="{ gridColumn: `${month.week} / span ${Math.min(3, weeks - month.week + 1)}` }">{{ month.label }}</span>
        </div>
        <div class="weekdays" aria-hidden="true">
          <span v-for="day in weekdays" :key="day.day" :style="{ gridRow: day.day + 1 }">{{ day.label }}</span>
        </div>
        <div class="days" role="img" :aria-label="t('home.activityTotal', { n: total })">
          <span v-for="(day, index) in days" :key="day?.key ?? index" class="day" :class="{ placeholder: !day, today: day?.key === today }" :data-level="day?.level ?? 0" :title="day ? t('home.activityDay', { date: dateFormat.format(day.date), n: day.count }) : undefined" />
        </div>
      </div>
    </div>
    <footer class="activity-footer">
      <span>{{ t('home.activityRule') }}</span>
      <div class="legend" aria-hidden="true"><span>{{ t('home.activityLess') }}</span><i v-for="level in 5" :key="level" class="day" :data-level="level - 1" /><span>{{ t('home.activityMore') }}</span></div>
    </footer>
  </section>
</template>

<style scoped>
.activity {
  min-width: 0;
  width: max-content;
  max-width: 100%;
  justify-self: center;
}
.activity-heading {
  line-height: 20px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-bottom: 10px;
}
.activity-heading h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
}
.activity-heading > span {
  font-size: 12px;
  color: var(--text-3);
}
.activity-scroll {
  overflow-x: auto;
  padding: 2px 2px 5px;
  scrollbar-width: thin;
}
.calendar {
  display: grid;
  grid-template-columns: 28px max-content;
  grid-template-rows: 14px auto;
  gap: 5px;
  width: max-content;
}
.months {
  grid-column: 2;
  display: grid;
  grid-template-columns: repeat(var(--weeks), 10px);
  column-gap: 3px;
  font-size: 10px;
  color: var(--text-3);
}
.months span {
  white-space: nowrap;
}
.weekdays {
  grid-row: 2;
  display: grid;
  grid-template-rows: repeat(7, 10px);
  gap: 3px;
  font-size: 9px;
  color: var(--text-3);
  align-items: center;
}
.days {
  grid-column: 2;
  grid-row: 2;
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, 10px);
  grid-template-columns: repeat(var(--weeks), 10px);
  gap: 3px;
}
.day {
  display: block;
  aspect-ratio: 1;
  border-radius: 2px;
  background: var(--bg-sunken);
  box-shadow: inset 0 0 0 1px var(--border);
  transition: background var(--dur) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.day[data-level="1"] {
  background: color-mix(in srgb, var(--success) 22%, var(--surface));
}
.day[data-level="2"] {
  background: color-mix(in srgb, var(--success) 45%, var(--surface));
}
.day[data-level="3"] {
  background: color-mix(in srgb, var(--success) 72%, var(--surface));
}
.day[data-level="4"] {
  background: var(--success);
}
.day.placeholder {
  visibility: hidden;
}
.days .day:hover {
  outline: 1px solid var(--text-2);
  outline-offset: 1px;
  transform: translateY(-1px);
}
.day.today {
  outline: 1px solid var(--accent);
  outline-offset: 1px;
}
.activity-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px 12px;
  margin-top: 9px;
  font-size: 10px;
  color: var(--text-3);
}
.legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.legend .day {
  width: 9px;
}
</style>
