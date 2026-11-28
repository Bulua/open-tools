<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";
import { closePanelDialog, vPanelDismiss } from "@/utils/panelDialog";
import { useI18n } from "vue-i18n";
import { AlarmClock, Flag, Pause, Pencil, Play, Plus, RotateCcw, Timer, Trash2, X } from "lucide-vue-next";
import { recordToolUsage } from "@/composables/toolLibrary";
import { useStoredRef } from "@/composables/useStoredRef";
import { countdowns, countdownsReady, removeCountdown, saveAlarm, toggleAlarm } from "./clockStore";
import { stopwatch } from "./clockState";
import { formatStopwatch } from "./stopwatch";
import type { CountdownItem } from "./reminders";
import TimeWheel from "./components/TimeWheel.vue";
import TimerPanel from "./components/TimerPanel.vue";

const { t, locale } = useI18n();
const tab = useStoredRef<"alarm" | "stopwatch" | "timer">("clock.tab", "alarm");
if (!["alarm", "stopwatch", "timer"].includes(tab.value)) tab.value = "alarm";
const tabs = [{ id: "alarm", icon: AlarmClock }, { id: "stopwatch", icon: Timer }, { id: "timer", icon: RotateCcw }] as const;
const weekdays = [1, 2, 3, 4, 5, 6, 0];
const dayName = (day: number) => t(`clock.weekday${day}`);
const daysLabel = (selected: number[]) => {
  const unique = new Set(selected);
  if (!unique.size) return t("clock.once");
  if (unique.size === 7) return t("clock.everyDay");
  if (unique.size === 5 && [1, 2, 3, 4, 5].every(day => unique.has(day))) return t("clock.workdays");
  return weekdays.filter(day => unique.has(day)).map(day => t(`clock.shortWeekday${day}`)).join(t("clock.daySeparator"));
};
const scheduleLabel = (item: CountdownItem) => {
  if (!item.alarm) return new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" }).format(item.target);
  return daysLabel(item.alarm.weekdays);
};
const alarmTime = (item: CountdownItem) => item.alarm?.time ?? new Intl.DateTimeFormat(locale.value, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(item.target);
const enabled = (item: CountdownItem) => item.enabled !== false && !item.done;
const alarms = computed(() => countdowns.value.filter(item => item.alarm || !item.duration));

// 原生对话框负责焦点约束、Escape 和关闭后的焦点归还。
const dialog = ref<HTMLDialogElement>();
const hourWheel = ref<InstanceType<typeof TimeWheel>>();
const minuteWheel = ref<InstanceType<typeof TimeWheel>>();
const editing = ref<string>();
const time = ref("09:00");
const hour = computed({ get: () => Number(time.value.slice(0, 2)), set: value => { time.value = `${String(value).padStart(2, "0")}:${time.value.slice(3)}`; } });
const minute = computed({ get: () => Number(time.value.slice(3)), set: value => { time.value = `${time.value.slice(0, 2)}:${String(value).padStart(2, "0")}`; } });
const days = ref<number[]>([]);
const repeatSummary = computed(() => daysLabel(days.value));
function toggleDay(day: number) {
  days.value = days.value.includes(day) ? days.value.filter(value => value !== day) : [...days.value, day];
}
const label = ref("");
const error = ref("");
async function editAlarm(item?: CountdownItem) {
  editing.value = item?.id;
  time.value = item?.alarm?.time ?? "09:00";
  days.value = [...(item?.alarm?.weekdays ?? [])];
  label.value = item?.title ?? "";
  error.value = "";
  await nextTick();
  dialog.value?.showModal();
  hourWheel.value?.reset(true);
  minuteWheel.value?.reset();
}
function closeAlarm() {
  closePanelDialog(dialog.value);
}
function submitAlarm() {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time.value)) { error.value = t("clock.invalidTime"); return; }
  saveAlarm({ time: time.value, weekdays: days.value }, label.value.trim() || t("clock.alarm"), editing.value);
  recordToolUsage();
  closeAlarm();
}

// 刷新只影响显示，时间依据单调时钟计算；后台不维持高频刷新。
const tick = ref(performance.now());
const elapsed = computed(() => stopwatch.elapsed(tick.value));
const canReset = computed(() => !stopwatch.running && (stopwatch.accumulated > 0 || stopwatch.laps.length > 0));
let refresh: ReturnType<typeof setInterval> | undefined;
function startRefresh() {
  if (refresh !== undefined) return;
  tick.value = performance.now();
  refresh = setInterval(() => { tick.value = performance.now(); }, 30);
}
function stopRefresh() { clearInterval(refresh); refresh = undefined; closePanelDialog(dialog.value, true); }
function toggleStopwatch() {
  const current = performance.now();
  if (stopwatch.running) stopwatch.pause(current);
  else { stopwatch.start(current); recordToolUsage(); }
  tick.value = current;
}
function lapOrReset() {
  if (stopwatch.running) stopwatch.lap(performance.now());
  else { stopwatch.reset(); tick.value = performance.now(); }
}
onMounted(startRefresh);
onActivated(startRefresh);
onDeactivated(stopRefresh);
onBeforeUnmount(stopRefresh);
</script>

<template>
  <section class="card clock-panel">
    <header class="clock-header">
      <div class="seg clock-tabs" role="tablist" :aria-label="t('clock.modes')">
        <button v-for="entry in tabs" :id="`clock-tab-${entry.id}`" :key="entry.id" type="button" role="tab"
          :class="{ on: tab === entry.id }" :aria-selected="tab === entry.id" :aria-controls="`clock-page-${entry.id}`"
          @click="tab = entry.id"><component :is="entry.icon" :size="16" />{{ t(`clock.${entry.id}`) }}</button>
      </div>
    </header>
    <div v-show="tab === 'alarm'" id="clock-page-alarm" role="tabpanel" aria-labelledby="clock-tab-alarm" class="clock-content alarm-grid">
      <article v-for="item in alarms" :key="item.id" class="alarm-card" :class="{ disabled: !enabled(item) }">
        <div class="alarm-actions">
          <button v-if="item.alarm" class="icon-btn" :title="t('clock.editAlarm')" :aria-label="t('clock.editAlarm')" @click="editAlarm(item)"><Pencil :size="15" /></button>
          <button class="icon-btn delete-alarm" :title="t('clock.delete')" :aria-label="t('clock.deleteAlarm', { label: item.title })" @click="removeCountdown(item.id)"><Trash2 :size="15" /></button>
        </div>
        <span class="alarm-time">{{ alarmTime(item) }}</span>
        <strong class="alarm-label">{{ item.title || t('clock.alarm') }}</strong>
        <div class="alarm-card-bottom"><p class="alarm-schedule">{{ scheduleLabel(item) }}</p>
          <button v-if="item.alarm" class="control-switch alarm-toggle" role="switch" :aria-checked="enabled(item)"
            :aria-label="t('clock.enableAlarm', { label: item.title })" @click="toggleAlarm(item)"><span /></button>
        </div>
      </article>
      <button class="alarm-card add-alarm" :disabled="!countdownsReady" @click="editAlarm()"><Plus :size="30" :stroke-width="1.5" /><span>{{ t('clock.addAlarm') }}</span></button>
    </div>
    <div v-show="tab === 'stopwatch'" id="clock-page-stopwatch" role="tabpanel" aria-labelledby="clock-tab-stopwatch" class="clock-content stopwatch-layout">
      <section class="stopwatch-controls">
        <output class="stopwatch-time">{{ formatStopwatch(elapsed) }}</output>
        <div class="stopwatch-buttons">
          <button class="btn" :disabled="!stopwatch.running && !stopwatch.accumulated && !stopwatch.laps.length" @click="lapOrReset">
            <RotateCcw v-if="canReset" :size="16" /><Flag v-else :size="16" />{{ t(canReset ? 'clock.reset' : 'clock.lap') }}
          </button>
          <button class="btn primary" @click="toggleStopwatch"><Pause v-if="stopwatch.running" :size="16" /><Play v-else :size="16" />{{ t(stopwatch.running ? 'clock.pause' : 'clock.start') }}</button>
        </div>
      </section>
      <section class="lap-panel" :aria-label="t('clock.laps')">
        <header><h2>{{ t('clock.laps') }}</h2><span>{{ t('clock.lapTime') }}</span></header>
        <ol v-if="stopwatch.laps.length" class="laps">
          <li v-for="lap in [...stopwatch.laps].reverse()" :key="lap.number"><span>{{ t('clock.lapNumber', { n: lap.number }) }}</span><time :title="t('clock.totalTime', { time: formatStopwatch(lap.elapsed) })">{{ formatStopwatch(lap.duration) }}</time></li>
        </ol>
        <p v-else class="empty-laps">{{ t('clock.noLaps') }}</p>
      </section>
    </div>
    <div v-show="tab === 'timer'" id="clock-page-timer" role="tabpanel" aria-labelledby="clock-tab-timer" class="clock-content timer-page"><TimerPanel /></div>
  </section>
  <Teleport to="body">
    <dialog v-panel-dismiss ref="dialog" class="alarm-dialog panel-dialog" aria-labelledby="alarm-dialog-title" @cancel.prevent="closeAlarm">
      <form @submit.prevent="submitAlarm">
        <header><h2 id="alarm-dialog-title">{{ t(editing ? 'clock.editAlarm' : 'clock.addAlarm') }}</h2><button class="icon-btn" type="button" :aria-label="t('clock.cancel')" @click="closeAlarm"><X :size="18" /></button></header>
        <div class="alarm-time-picker" role="group" :aria-label="t('clock.time')">
          <div class="time-units" aria-hidden="true"><span>{{ t('clock.hour') }}</span><span>{{ t('clock.minute') }}</span></div>
          <div class="time-wheels">
            <span class="time-selection" aria-hidden="true" />
            <TimeWheel ref="hourWheel" v-model="hour" :count="24" :label="t('clock.hour')" />
            <span class="time-separator" aria-hidden="true">:</span>
            <TimeWheel ref="minuteWheel" v-model="minute" :count="60" :label="t('clock.minute')" />
          </div>
        </div>
        <div class="alarm-settings">
          <div class="repeat-setting">
            <div class="repeat-row"><span>{{ t('clock.repeat') }}</span><span class="repeat-summary" :title="days.length ? repeatSummary : t('clock.onceHint')">{{ repeatSummary }}</span></div>
            <div class="weekday-buttons" role="group" :aria-label="t('clock.repeat')">
              <button v-for="day in weekdays" :key="day" type="button" class="btn small weekday-toggle" :class="{ on: days.includes(day) }" :data-day="day" :aria-pressed="days.includes(day)" :aria-label="dayName(day)" @click="toggleDay(day)">{{ t(`clock.shortWeekday${day}`) }}</button>
            </div>
          </div>
          <label class="alarm-field"><span>{{ t('clock.label') }}</span><input v-model="label" class="field" maxlength="80" :placeholder="t('clock.labelPlaceholder')" /></label>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <footer><button type="button" class="btn" @click="closeAlarm">{{ t('clock.cancel') }}</button><button type="submit" class="btn primary">{{ t('clock.save') }}</button></footer>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.clock-panel { flex: 1; min-height: 0; overflow: hidden; }
.clock-header { flex-shrink: 0; display: flex; justify-content: center; padding: 14px 20px; border-bottom: 1px solid var(--border); }
.clock-tabs { width: min(100%, 420px); }
.clock-tabs button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 34px; font-size: 14px; }
.clock-content { flex: 1; min-height: 0; padding: 20px; overflow: auto; }
.alarm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); align-content: start; align-items: start; gap: 16px; }
.alarm-card { position: relative; display: flex; flex-direction: column; min-height: 148px; padding: 18px 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); text-align: start; }
.alarm-time { padding-right: 60px; font-size: 36px; font-weight: 400; line-height: 1.2; font-variant-numeric: tabular-nums; letter-spacing: -0.04em; }
.alarm-label { margin-top: 10px; font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.alarm-card-bottom { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 12px; }
.alarm-schedule { margin: 0; color: var(--text-3); font-size: 12px; line-height: 1.5; }
.alarm-actions { position: absolute; right: 12px; top: 16px; display: flex; gap: 2px; }
.delete-alarm:hover { color: var(--danger); }
.disabled .alarm-time, .disabled .alarm-label { color: var(--text-3); }
.add-alarm { height: 148px; align-items: center; justify-content: center; gap: 10px; border-style: dashed; color: var(--text-3); font-size: 13px; transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out); }
.add-alarm:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.add-alarm:disabled { cursor: default; }
.stopwatch-layout { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(260px, 1fr); gap: 32px; }
.stopwatch-controls { display: flex; flex-direction: column; align-items: center; padding: 60px 10px 36px; }
.stopwatch-time { font-size: clamp(32px, 4.5vw, 76px); font-weight: 300; font-variant-numeric: tabular-nums; letter-spacing: -0.035em; white-space: nowrap; }
.stopwatch-buttons { display: flex; justify-content: center; gap: 20px; margin-top: 36px; }
.stopwatch-buttons .btn { height: 42px; min-width: 110px; justify-content: center; }
.lap-panel { border-left: 1px solid var(--border); padding-left: 30px; }
.lap-panel header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0 16px; border-bottom: 1px solid var(--border); }
.lap-panel h2 { margin: 0; font-size: 15px; font-weight: 500; }
.lap-panel header > span { font-size: 12px; color: var(--text-3); }
.laps { list-style: none; margin: 0; padding: 0; max-height: 450px; overflow: auto; }
.laps li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
.laps time { font-variant-numeric: tabular-nums; }
.empty-laps { margin: 56px 0; text-align: center; font-size: 13px; line-height: 1.8; color: var(--text-3); }
.alarm-dialog { width: min(380px, calc(100vw - 32px)); max-height: calc(100vh - 48px); padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); box-shadow: var(--shadow-lg); }
.alarm-dialog::backdrop { background: var(--modal-scrim); }
.alarm-dialog form { display: flex; flex-direction: column; gap: 18px; }
.alarm-dialog header { display: flex; align-items: center; justify-content: space-between; }
.alarm-dialog h2 { margin: 0; font-size: 16px; font-weight: 600; }
.alarm-time-picker { align-self: center; width: 192px; padding-top: 2px; }
.time-units, .time-wheels { display: grid; grid-template-columns: 80px 16px 80px; gap: 8px; }
.time-units { margin-bottom: 4px; color: var(--text-3); font-size: 12px; text-align: center; }
.time-units > :last-child { grid-column: 3; }
.time-wheels { position: relative; }
.time-selection { position: absolute; top: 64px; inset-inline: 0; height: 32px; border-radius: 8px; background: var(--accent-soft); pointer-events: none; }
.time-separator { align-self: center; color: var(--text-2); font-family: var(--font-sans); font-size: 24px; font-weight: 400; line-height: 32px; text-align: center; }
.alarm-settings { padding: 0 12px; border-radius: 10px; background: var(--bg-sunken); }
.repeat-setting { padding: 12px 0; }
.repeat-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; font-size: 13px; }
.repeat-row > span { flex-shrink: 0; color: var(--text-2); }
.repeat-row .repeat-summary { flex-shrink: 1; min-width: 0; overflow: hidden; color: var(--text-3); font-size: 12px; text-align: end; text-overflow: ellipsis; white-space: nowrap; }
.weekday-buttons { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
.weekday-buttons .weekday-toggle { min-width: 0; height: 30px; justify-content: center; padding: 0; border-color: var(--border); font-size: 12px; }
.weekday-buttons .weekday-toggle.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.alarm-field { display: flex; align-items: center; gap: 12px; min-height: 48px; border-top: 1px solid var(--border); font-size: 13px; }
.alarm-field > span { flex-shrink: 0; color: var(--text-2); }
.alarm-field .field { flex: 1; min-width: 0; text-align: start; border: 0; border-radius: 0; outline: none; background: none; box-shadow: none; padding: 0 8px; font-size: 13px; }
.alarm-field .field:focus, .alarm-field .field:focus-visible { border: 0; outline: none; box-shadow: inset 0 -1px var(--border-strong); }
.alarm-dialog footer { display: flex; justify-content: flex-end; gap: 8px; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (max-width: 850px) {
  .clock-content { padding: 16px; }
  .stopwatch-layout { grid-template-columns: 1fr; gap: 12px; }
  .stopwatch-controls { padding: 40px 0; }
  .stopwatch-time { font-size: clamp(30px, 8vw, 64px); }
  .lap-panel { border-left: 0; border-top: 1px solid var(--border); padding: 12px 0 0; }
}
</style>
