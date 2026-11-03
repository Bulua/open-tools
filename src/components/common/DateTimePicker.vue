<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-vue-next";
import { usePopover } from "@/composables/usePopover";
import { useI18n } from "vue-i18n";

// 弹出层用 Teleport 放在 body 下，组件有两个根节点；class 等属性交给触发按钮
defineOptions({ inheritAttrs: false });

/**
 * 日期时间选择器：替代系统自带的 datetime-local，样式与程序一致。
 * 值的格式与 datetime-local 相同：「2026-11-01T09:30」，空字符串表示未选择。
 * 左边选日期（周一开头），右边选小时和分钟，修改立即生效。
 */
defineProps<{ placeholder?: string }>();
const { t, tm, rt } = useI18n();
const model = defineModel<string>({ default: "" });

const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLDivElement>();
const { open, style, toggle, close } = usePopover(trigger, panel, { maxHeight: 340 });

const pad = (n: number) => String(n).padStart(2, "0");
/** 日历表头（周一开头）和显示用的星期（周日开头，与 Date.getDay() 对应） */
const WEEK = computed(() => (tm("datetime.week") as string[]).map((w) => rt(w)));
const WEEK_FULL = computed(() => (tm("datetime.weekFull") as string[]).map((w) => rt(w)));

// 本地保存一份：连续点小时、分钟时，不必等外部更新完成也能在最新的值上修改
const local = ref(model.value);
watch(model, (v) => (local.value = v));

const parsed = computed(() => {
  const m = local.value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] } : null;
});
const emit = (y: number, mo: number, d: number, h: number, mi: number) => {
  // 规范化（例如 2 月 31 日 → 3 月 3 日）
  const date = new Date(y, mo - 1, d, h, mi);
  local.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  model.value = local.value;
};

const display = computed(() => {
  const p = parsed.value;
  if (!p) return "";
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}  ${pad(p.h)}:${pad(p.mi)}  ${WEEK_FULL.value[new Date(p.y, p.mo - 1, p.d).getDay()]}`;
});

// ---------- 日历 ----------
const viewYear = ref(new Date().getFullYear());
const viewMonth = ref(new Date().getMonth() + 1);
const shiftMonth = (delta: number) => {
  const d = new Date(viewYear.value, viewMonth.value - 1 + delta, 1);
  viewYear.value = d.getFullYear();
  viewMonth.value = d.getMonth() + 1;
};

const days = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value - 1, 1);
  const offset = (first.getDay() + 6) % 7; // 周一开头
  const start = new Date(viewYear.value, viewMonth.value - 1, 1 - offset);
  const today = new Date();
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const p = parsed.value;
    return {
      key: i,
      y: d.getFullYear(),
      mo: d.getMonth() + 1,
      d: d.getDate(),
      other: d.getMonth() + 1 !== viewMonth.value,
      today: d.toDateString() === today.toDateString(),
      selected: !!p && p.y === d.getFullYear() && p.mo === d.getMonth() + 1 && p.d === d.getDate(),
      weekend: d.getDay() === 0 || d.getDay() === 6,
    };
  });
});

const pickDay = (day: (typeof days.value)[number]) => {
  const p = parsed.value;
  emit(day.y, day.mo, day.d, p?.h ?? 9, p?.mi ?? 0);
  if (day.other) {
    viewYear.value = day.y;
    viewMonth.value = day.mo;
  }
};

// ---------- 时间 ----------
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const hourList = ref<HTMLDivElement>();
const minuteList = ref<HTMLDivElement>();

const pickTime = (h: number | null, mi: number | null) => {
  const p = parsed.value;
  const base = p ?? (() => {
    const n = new Date();
    return { y: n.getFullYear(), mo: n.getMonth() + 1, d: n.getDate(), h: 0, mi: 0 };
  })();
  emit(base.y, base.mo, base.d, h ?? base.h, mi ?? base.mi);
};

const scrollTimes = () => {
  const p = parsed.value;
  for (const [list, value] of [
    [hourList.value, p?.h ?? 9],
    [minuteList.value, p?.mi ?? 0],
  ] as const) {
    const el = list?.querySelector<HTMLElement>(`[data-v="${value}"]`);
    if (list && el) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2;
  }
};

const setNow = () => {
  const n = new Date();
  emit(n.getFullYear(), n.getMonth() + 1, n.getDate(), n.getHours(), n.getMinutes());
  viewYear.value = n.getFullYear();
  viewMonth.value = n.getMonth() + 1;
  nextTick(scrollTimes);
};

watch(open, async (isOpen) => {
  if (!isOpen) return;
  const p = parsed.value;
  const base = p ? new Date(p.y, p.mo - 1, 1) : new Date();
  viewYear.value = base.getFullYear();
  viewMonth.value = base.getMonth() + 1;
  await nextTick();
  scrollTimes();
});
watch(() => parsed.value?.h, () => open.value && nextTick(scrollTimes));
</script>

<template>
  <button v-bind="$attrs" ref="trigger" type="button" class="dt-trigger" :class="{ open }" @click="toggle">
    <CalendarDays :size="14" class="icon" />
    <span class="value" :class="{ placeholder: !display }">{{ display || placeholder || t("datetime.placeholder") }}</span>
  </button>

  <Teleport to="body">
    <Transition name="pop">
      <div v-if="open" ref="panel" class="dt-panel" :style="style">
        <div class="calendar">
          <header>
            <button type="button" class="nav" :title="t('datetime.prevMonth')" @click="shiftMonth(-1)"><ChevronLeft :size="15" /></button>
            <b>{{ t("datetime.month", { year: viewYear, month: viewMonth }) }}</b>
            <button type="button" class="nav" :title="t('datetime.nextMonth')" @click="shiftMonth(1)"><ChevronRight :size="15" /></button>
          </header>
          <div class="grid week">
            <span v-for="w in WEEK" :key="w">{{ w }}</span>
          </div>
          <div class="grid">
            <button
              v-for="day in days"
              :key="day.key"
              type="button"
              class="day"
              :class="{ other: day.other, today: day.today, selected: day.selected, weekend: day.weekend }"
              @click="pickDay(day)"
            >
              {{ day.d }}
            </button>
          </div>
        </div>

        <div class="times">
          <div class="time-head"><span>{{ t("datetime.hour") }}</span><span>{{ t("datetime.minute") }}</span></div>
          <div class="columns">
            <div ref="hourList" class="column">
              <button
                v-for="h in HOURS"
                :key="h"
                type="button"
                :data-v="h"
                :class="{ selected: parsed?.h === h }"
                @click="pickTime(h, null)"
              >
                {{ pad(h) }}
              </button>
            </div>
            <div ref="minuteList" class="column">
              <button
                v-for="m in MINUTES"
                :key="m"
                type="button"
                :data-v="m"
                :class="{ selected: parsed?.mi === m }"
                @click="pickTime(null, m)"
              >
                {{ pad(m) }}
              </button>
            </div>
          </div>
        </div>

        <footer>
          <button type="button" class="link" @click="setNow">{{ t("datetime.now") }}</button>
          <span class="current">{{ display || t("datetime.none") }}</span>
          <button type="button" class="btn small primary" @click="close">{{ t("datetime.ok") }}</button>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dt-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.dt-trigger:hover {
  border-color: var(--text-3);
}
.dt-trigger:focus-visible,
.dt-trigger.open {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.icon {
  flex-shrink: 0;
  color: var(--accent);
}
.value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
  font-variant-numeric: tabular-nums;
}
.placeholder {
  color: var(--text-3);
}
</style>

<style>
.dt-panel {
  position: fixed;
  z-index: 100;
  display: grid;
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  user-select: none;
}
.dt-panel .calendar {
  padding: 10px 12px 8px;
}
.dt-panel .calendar header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.dt-panel .calendar header b {
  font-size: 13.5px;
  font-weight: 600;
}
.dt-panel .nav {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-2);
  cursor: pointer;
}
.dt-panel .nav:hover {
  background: var(--hover);
  color: var(--text);
}
.dt-panel .grid {
  display: grid;
  grid-template-columns: repeat(7, 32px);
  gap: 2px;
}
.dt-panel .week span {
  height: 24px;
  display: grid;
  place-items: center;
  font-size: 11.5px;
  color: var(--text-3);
}
.dt-panel .day {
  height: 30px;
  border: none;
  border-radius: 7px;
  background: none;
  color: var(--text);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.dt-panel .day:hover {
  background: var(--hover);
}
.dt-panel .day.weekend {
  color: var(--accent);
}
.dt-panel .day.other {
  color: var(--text-3);
  opacity: 0.55;
}
.dt-panel .day.today {
  box-shadow: inset 0 0 0 1px var(--accent);
}
.dt-panel .day.selected {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}
.dt-panel .times {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  background: var(--bg-sunken);
}
.dt-panel .time-head {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 12px 6px 6px;
  font-size: 11.5px;
  color: var(--text-3);
  text-align: center;
}
.dt-panel .columns {
  flex: 1;
  display: grid;
  grid-template-columns: 52px 52px;
  min-height: 0;
}
.dt-panel .column {
  height: 236px;
  overflow-y: auto;
  padding: 0 4px 6px;
  scrollbar-width: thin;
}
.dt-panel .column button {
  display: block;
  width: 100%;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-2);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.dt-panel .column button:hover {
  background: var(--hover);
  color: var(--text);
}
.dt-panel .column button.selected {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}
.dt-panel footer {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}
.dt-panel .link {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  font-size: 12.5px;
  cursor: pointer;
}
.dt-panel .current {
  flex: 1;
  font-size: 12px;
  color: var(--text-3);
  white-space: pre;
  font-variant-numeric: tabular-nums;
}
.dt-panel .btn.small {
  height: 28px;
  padding: 0 14px;
  font-size: 12px;
}
</style>
