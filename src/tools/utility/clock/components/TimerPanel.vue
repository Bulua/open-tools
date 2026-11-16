<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Pause, Play, RotateCcw, Timer, Trash2 } from "lucide-vue-next";
import { recordToolUsage } from "@/composables/toolLibrary";
import { addCountdown, countdowns, countdownsReady, now, removeCountdown, restart, togglePause } from "../clockStore";
import { formatRemaining, progressOf, remainingOf, toMs, type CountdownItem } from "../reminders";

const { t } = useI18n();
const hours = ref<number | string>(0);
const minutes = ref<number | string>(5);
const seconds = ref<number | string>(0);
const title = ref("");
const error = ref("");
const presets = [1, 3, 5, 10, 15, 25, 30, 60];
const timers = computed(() => countdowns.value.filter(item => !item.alarm && item.duration));
const duration = computed(() => toMs(Number(hours.value), Number(minutes.value), Number(seconds.value)));
const fields = computed(() => [
  { value: hours, key: "hour", max: 99 },
  { value: minutes, key: "minute", max: 59 },
  { value: seconds, key: "second", max: 59 },
]);
function selectPreset(value: number) {
  hours.value = Math.floor(value / 60);
  minutes.value = value % 60;
  seconds.value = 0;
  error.value = "";
}
function startTimer() {
  if (!countdownsReady.value) return;
  if (!fields.value.every(field => Number.isInteger(Number(field.value.value)) && Number(field.value.value) >= 0 && Number(field.value.value) <= field.max) || duration.value <= 0) {
    error.value = t("clock.invalidDuration");
    return;
  }
  const current = Date.now();
  now.value = current;
  addCountdown({ title: title.value.trim() || t("utility.timerName", { time: formatRemaining(duration.value) }),
    duration: duration.value, target: current + duration.value, repeat: "none" });
  error.value = "";
  recordToolUsage();
}
const finished = (item: CountdownItem) => item.done || remainingOf(item, now.value) <= 0;
const status = (item: CountdownItem) => t(finished(item) ? "clock.timerFinished" : item.pausedRemaining !== undefined ? "utility.paused" : "clock.timerRunning");
function toggleTimer(item: CountdownItem) {
  togglePause(item);
  now.value = Date.now();
}
function restartTimer(item: CountdownItem) {
  restart(item);
  now.value = Date.now();
  recordToolUsage();
}
</script>

<template>
  <div class="timer-layout">
    <form class="timer-composer" novalidate @submit.prevent="startTimer">
      <div class="timer-setup">
        <fieldset class="duration-fields">
          <legend>{{ t('utility.duration') }}</legend>
          <label v-for="field in fields" :key="field.key">
            <input v-model="field.value.value" class="field" type="number" inputmode="numeric" min="0" :max="field.max" step="1" :aria-label="t(`clock.${field.key}`)" :aria-invalid="!!error" :aria-describedby="error ? 'timer-duration-error' : undefined" @input="error = ''" />
            <span>{{ t(`clock.${field.key}`) }}</span>
          </label>
        </fieldset>
        <label class="timer-name"><span>{{ t('clock.label') }}</span><input v-model="title" class="field" maxlength="80" :placeholder="t('clock.timerLabelPlaceholder')" /></label>
        <button class="btn primary start-timer" type="submit" :disabled="!countdownsReady"><Play :size="16" />{{ t('clock.startTimer') }}</button>
      </div>
      <div class="timer-presets" role="group" :aria-label="t('clock.timerPresets')">
        <span>{{ t('clock.timerPresets') }}</span>
        <button v-for="preset in presets" :key="preset" class="btn small" :class="{ selected: duration === preset * 60000 }" type="button" :aria-pressed="duration === preset * 60000" @click="selectPreset(preset)">{{ t('utility.minutes', { n: preset }) }}</button>
      </div>
      <p v-if="error" id="timer-duration-error" class="error" role="alert">{{ error }}</p>
    </form>

    <div v-if="timers.length" class="timer-grid">
      <article v-for="item in timers" :key="item.id" class="timer-card" :class="{ paused: item.pausedRemaining !== undefined, finished: finished(item) }">
        <header><h2 :title="item.title">{{ item.title }}</h2><button class="icon-btn delete-timer" :aria-label="t('clock.deleteTimer', { label: item.title })" :title="t('clock.delete')" @click="removeCountdown(item.id)"><Trash2 :size="15" /></button></header>
        <div class="timer-readout"><time>{{ formatRemaining(finished(item) ? 0 : remainingOf(item, now)) }}</time><span class="timer-status"><Check v-if="finished(item)" :size="13" /><Pause v-else-if="item.pausedRemaining !== undefined" :size="13" />{{ status(item) }}</span></div>
        <progress :value="finished(item) ? 1 : progressOf(item, now)" max="1" :aria-label="t('clock.timerProgress', { label: item.title })" />
        <footer><span>{{ t('clock.timerDuration', { time: formatRemaining(item.duration!) }) }}</span><div class="timer-actions">
          <button v-if="!finished(item)" class="icon-btn" :aria-label="t('clock.restartTimer', { label: item.title })" :title="t('utility.restart')" @click="restartTimer(item)"><RotateCcw :size="16" /></button>
          <button v-if="finished(item)" class="btn small" @click="restartTimer(item)"><Play :size="14" />{{ t('utility.restart') }}</button>
          <button v-else class="btn small" @click="toggleTimer(item)"><Play v-if="item.pausedRemaining !== undefined" :size="14" /><Pause v-else :size="14" />{{ t(item.pausedRemaining !== undefined ? 'utility.resume' : 'clock.pause') }}</button>
        </div></footer>
      </article>
    </div>
    <p v-else class="timer-empty"><Timer :size="20" :stroke-width="1.5" />{{ t('clock.timerEmpty') }}</p>
  </div>
</template>

<style scoped>
.timer-layout { display: flex; flex-direction: column; gap: 20px; }
.timer-composer { display: flex; flex-direction: column; gap: 14px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
.timer-setup { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; }
.duration-fields { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0; }
.duration-fields legend, .timer-name > span { margin-bottom: 8px; padding: 0; color: var(--text-2); font-size: 12px; }
.duration-fields label { display: flex; align-items: center; gap: 6px; color: var(--text-3); font-size: 12px; }
.duration-fields .field { width: 68px; height: 38px; padding: 0 6px; text-align: center; font-size: 20px; font-variant-numeric: tabular-nums; }
.timer-name { display: flex; flex: 1; flex-direction: column; min-width: 160px; }
.timer-name .field { width: 100%; height: 38px; }
.start-timer { height: 38px; justify-content: center; }
.timer-presets { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.timer-presets > span { margin-right: 2px; color: var(--text-3); font-size: 12px; }
.timer-presets .selected { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.timer-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); align-items: start; gap: 16px; }
.timer-card { display: flex; flex-direction: column; gap: 16px; min-width: 0; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); }
.timer-card header, .timer-card footer, .timer-readout, .timer-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.timer-card h2 { overflow: hidden; margin: 0; font-size: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.timer-readout { flex-wrap: wrap; align-items: baseline; }
.timer-readout time { font-size: 36px; font-weight: 300; line-height: 1.2; font-variant-numeric: tabular-nums; letter-spacing: -0.035em; }
.timer-status { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 12px; }
.timer-card progress { display: block; appearance: none; width: 100%; height: 4px; overflow: hidden; border: 0; border-radius: 2px; background: var(--active); color: var(--accent); }
.timer-card progress::-webkit-progress-bar { background: var(--active); }
.timer-card progress::-webkit-progress-value { background: var(--accent); }
.timer-card progress::-moz-progress-bar { background: var(--accent); }
.timer-card footer { flex-wrap: wrap; }
.timer-card footer > span { color: var(--text-3); font-size: 12px; }
.timer-actions { margin-left: auto; }
.paused .timer-status, .paused time { color: var(--text-3); }
.finished .timer-status { color: var(--success); }
.delete-timer:hover { color: var(--danger); }
.timer-empty { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0; padding: 20px 0; color: var(--text-3); font-size: 13px; line-height: 1.6; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (max-width: 600px) {
  .timer-setup { gap: 12px; }
  .duration-fields { width: 100%; }
  .timer-name { min-width: 100px; }
  .timer-grid { gap: 12px; }
}
</style>
