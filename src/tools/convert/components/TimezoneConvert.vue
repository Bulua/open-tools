<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";
import AppSelect from "@/components/common/AppSelect.vue";
import DateTimePicker from "@/components/common/DateTimePicker.vue";
import { Plus, Radio, X } from "lucide-vue-next";
import { useStoredRef } from "@/composables/useStoredRef";
import {
  CITIES,
  allZones,
  cityName,
  dayRelation,
  diffLabel,
  localZone,
  offsetLabel,
  parseLocalInput,
  timeIn,
  zoneOffset,
  zonedToDate,
} from "../timezone";

/**
 * 时区转换与世界时间：选择一个基准时区和时间，同时显示其他城市对应的时间。
 * 下方的 24 小时对照条按基准时区的每个小时排列，方便找大家都在工作时间的时段，点一下即可设为基准时间。
 */
const baseZone = useStoredRef("timezone.base", localZone());
const zones = useStoredRef<string[]>("timezone.zones", ["America/New_York", "Europe/London", "Asia/Tokyo", "Australia/Sydney"]);

// ---------- 当前时间：实时模式每秒刷新 ----------
const live = ref(true);
const now = ref(Date.now());
let timer = 0;
const start = () => {
  now.value = Date.now();
  clearInterval(timer);
  timer = window.setInterval(() => (now.value = Date.now()), 1000);
};
const stop = () => clearInterval(timer);
onMounted(start);
onActivated(start);
onDeactivated(stop);
onBeforeUnmount(stop);

const baseInput = ref("");
const instant = computed(() => {
  const parts = parseLocalInput(baseInput.value);
  return live.value || !parts ? new Date(now.value) : zonedToDate(baseZone.value, ...parts);
});
const base = computed(() => timeIn(instant.value, baseZone.value, live.value));
const baseOffset = computed(() => zoneOffset(baseZone.value, instant.value));

/** 选择器的值：实时模式下显示当前时间，选择后退出实时模式 */
const pickerValue = computed({
  get: () => (live.value ? `${base.value.date}T${base.value.time.slice(0, 5)}` : baseInput.value),
  set: (value: string) => {
    baseInput.value = value;
    live.value = !value;
  },
});
const goLive = () => {
  live.value = true;
  baseInput.value = "";
};

// ---------- 城市 ----------
const rows = computed(() =>
  zones.value
    .filter((z) => z !== baseZone.value)
    .map((zone) => {
      const t = timeIn(instant.value, zone, live.value);
      const offset = zoneOffset(zone, instant.value);
      return { zone, name: cityName(zone), t, offset, diff: offset - baseOffset.value, relation: dayRelation(t, base.value) };
    }),
);

const zoneOptions = allZones();
const ZONE_OPTIONS = [
  ...CITIES.map((c) => ({ value: c.zone, label: c.name, hint: c.zone, group: "常用城市" })),
  ...zoneOptions.map((z) => ({ value: z, label: z, group: "全部时区" })),
];
const query = ref("");
const addError = ref("");
const addZone = () => {
  const q = query.value.trim();
  if (!q) return;
  const zone = CITIES.find((c) => c.name === q)?.zone ?? zoneOptions.find((z) => z.toLowerCase() === q.toLowerCase()) ?? zoneOptions.find((z) => z.toLowerCase().includes(q.toLowerCase()));
  if (!zone) {
    addError.value = `没有找到「${q}」，可以输入城市名（如 纽约）或时区（如 America/New_York）`;
    return;
  }
  if (!zones.value.includes(zone)) zones.value = [...zones.value, zone];
  query.value = "";
  addError.value = "";
};
const removeZone = (zone: string) => (zones.value = zones.value.filter((z) => z !== zone));
const setBase = (zone: string) => {
  // 把原来的基准时区放回列表，保持基准时刻不变
  const parts = live.value ? null : `${timeIn(instant.value, zone).date}T${timeIn(instant.value, zone).time}`;
  if (!zones.value.includes(baseZone.value)) zones.value = [baseZone.value, ...zones.value];
  baseZone.value = zone;
  if (parts) baseInput.value = parts;
};

// ---------- 24 小时对照 ----------
const HOURS = Array.from({ length: 24 }, (_, i) => i);
/** 基准时区第 h 点对应该城市的小时 */
const hourAt = (h: number, diffMinutes: number) => (((h * 60 + diffMinutes) / 60) % 24 + 24) % 24;
const hourClass = (hour: number) => {
  const h = Math.floor(hour);
  return h >= 9 && h < 18 ? "work" : h >= 7 && h < 22 ? "day" : "night";
};
const pickHour = (h: number) => {
  live.value = false;
  baseInput.value = `${base.value.date}T${String(h).padStart(2, "0")}:00`;
};
const fmtHour = (hour: number) => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return m ? `${h}:${String(m).padStart(2, "0")}` : String(h);
};
</script>

<template>
  <div class="tz">
    <section class="card hero">
      <div class="hero-main">
        <div class="base-label">
          基准
          <AppSelect v-model="baseZone" class="zone-select" size="sm" :options="ZONE_OPTIONS" :menu-width="320" title="基准时区" />
          <span class="offset">{{ offsetLabel(baseOffset) }}</span>
        </div>
        <div class="big-time">{{ base.time }}</div>
        <div class="big-date">{{ base.date }} {{ base.weekday }}</div>
      </div>
      <div class="hero-side">
        <label class="field-label">设置时间（按基准时区）</label>
        <DateTimePicker v-model="pickerValue" />
        <button class="btn" :class="{ primary: live }" @click="goLive"><Radio :size="14" />{{ live ? "正在显示当前时间" : "回到当前时间" }}</button>
      </div>
    </section>

    <section class="card world">
      <div class="card-title">
        世界时间
        <span class="hint">下方色条是基准时区 0～23 点对应的当地时间，<i class="legend work" />工作时间 <i class="legend day" />白天 <i class="legend night" />夜间；点击可设为基准时间</span>
      </div>

      <div class="rows">
        <div class="row base-row">
          <div class="city">
            <b>{{ cityName(baseZone) }}</b>
            <span>基准 · {{ offsetLabel(baseOffset) }}</span>
          </div>
          <div class="when">
            <span class="time">{{ base.time }}</span>
            <span class="date">{{ base.date }} {{ base.weekday }}</span>
          </div>
          <div class="strip">
            <button v-for="h in HOURS" :key="h" :class="[hourClass(h), { now: h === base.hour }]" :title="`${h}:00`" @click="pickHour(h)">{{ h }}</button>
          </div>
          <span class="actions" />
        </div>

        <div v-for="r in rows" :key="r.zone" class="row">
          <div class="city">
            <b>{{ r.name }}</b>
            <span>{{ offsetLabel(r.offset) }} · {{ diffLabel(r.diff) }}</span>
          </div>
          <div class="when">
            <span class="time">{{ r.t.time }}</span>
            <span class="date">{{ r.t.date }} {{ r.t.weekday }}<em v-if="r.relation" class="rel">{{ r.relation }}</em></span>
          </div>
          <div class="strip">
            <button
              v-for="h in HOURS"
              :key="h"
              :class="[hourClass(hourAt(h, r.diff)), { now: h === base.hour }]"
              :title="`基准 ${h}:00 = ${r.name} ${fmtHour(hourAt(h, r.diff))}:00`"
              @click="pickHour(h)"
            >
              {{ fmtHour(hourAt(h, r.diff)) }}
            </button>
          </div>
          <span class="actions">
            <button class="icon-btn" title="设为基准" @click="setBase(r.zone)"><Radio :size="13" /></button>
            <button class="icon-btn" title="移除" @click="removeZone(r.zone)"><X :size="13" /></button>
          </span>
        </div>
      </div>

      <form class="add" @submit.prevent="addZone">
        <input v-model="query" class="field" list="tz-options" placeholder="添加城市或时区，例如 巴黎、America/Chicago" />
        <datalist id="tz-options">
          <option v-for="c in CITIES" :key="c.zone" :value="c.name">{{ c.zone }}</option>
          <option v-for="z in zoneOptions" :key="z" :value="z" />
        </datalist>
        <button class="btn" type="submit"><Plus :size="14" />添加</button>
        <span v-if="addError" class="error">{{ addError }}</span>
      </form>
    </section>
  </div>
</template>

<style scoped>
/* 占满工具区，城市多时只在列表内部滚动，整页不出现滚动条 */
.tz {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.world {
  flex: 1;
  min-height: 0;
}
.rows {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.hero {
  flex-shrink: 0;
  flex-direction: row;
  align-items: center;
  gap: 24px;
  padding: 14px 20px;
}
.hero-main {
  flex: 1;
  min-width: 0;
}
.base-label {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-3);
}
.base-label :deep(.zone-select) {
  width: 220px;
}
.offset {
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--active);
  color: var(--text-2);
}
.big-time {
  margin-top: 6px;
  font-family: var(--font-serif);
  font-size: 44px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.big-date {
  font-size: 14px;
  color: var(--text-2);
}
.hero-side {
  flex: 0 0 260px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field-label {
  font-size: 12px;
  color: var(--text-3);
}
.hero-side .btn {
  justify-content: center;
}

.world .hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  font-weight: 400;
  color: var(--text-3);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.legend {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-left: 6px;
  border-radius: 2px;
}
.row {
  display: grid;
  grid-template-columns: 150px 150px minmax(0, 1fr) 56px;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
}
.row + .row {
  border-top: 1px solid var(--border);
}
.base-row {
  background: var(--accent-soft);
}
.city {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.city b {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.city span,
.date {
  font-size: 12px;
  color: var(--text-3);
}
.when {
  display: flex;
  flex-direction: column;
}
.time {
  font-family: var(--font-mono);
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}
.rel {
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--warning-soft);
  color: var(--warning);
  font-style: normal;
}
.strip {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 2px;
}
.strip button {
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 3px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
  cursor: pointer;
}
.work,
.legend.work {
  background: var(--success-soft);
}
.strip .work {
  color: var(--success);
  font-weight: 600;
}
.day,
.legend.day {
  background: var(--active);
}
.night,
.legend.night {
  background: var(--bg-sunken);
}
.strip .night {
  color: var(--text-3);
}
.strip button.now {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.strip button:hover {
  filter: brightness(0.95);
}
.actions {
  display: flex;
  justify-content: flex-end;
}
.add {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--border);
}
.add .field {
  max-width: 360px;
  height: 32px;
  font-size: 13px;
}
</style>
