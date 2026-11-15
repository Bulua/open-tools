<script setup lang="ts">
import { recordToolUsage } from "@/composables/toolLibrary";
import { Bell, BellOff, ChevronLeft, ChevronRight, StickyNote, X } from "lucide-vue-next";
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppSelect from "@/components/common/AppSelect.vue";
import DateTimePicker from "@/components/common/DateTimePicker.vue";
import ZoomControls from "@/components/common/ZoomControls.vue";
import { usePopover } from "@/composables/usePopover";
import { useStoredRef } from "@/composables/useStoredRef";
import { showError } from "@/utils/errorToast";
import { calendarDate, calendarDateKey, calendarFestivals, calendarNoteOccursOn, calendarNotesOn, compactLunarDate, localCalendarDate, monthDays } from "./calendar";
import { calendarDesktop, calendarNotes, calendarNotesReady, calendarReminders, loadCalendarNotes, saveCalendarNote } from "./calendarStore";
import { centerCalendarDay } from "./calendarNavigation";

const { t, locale } = useI18n();
const firstYear = 1901;
const lastYear = 2100;

const today = ref(localCalendarDate());
const selected = ref(today.value);
const year = ref(today.value.getUTCFullYear());
const yearList = ref<HTMLElement>();
const firstVisibleYear = computed(() => Math.min(lastYear - 2, Math.max(firstYear, year.value - 1)));
const lastVisibleYear = computed(() => firstVisibleYear.value + 2);
const minZoom = 0.8;
const maxZoom = 2;
const zoom = useStoredRef("calendar.zoom", 1);

let clock: ReturnType<typeof setInterval>;
let todayFrame = 0;
let displayed = true;
let navigationVersion = 0;
let targetDate: number | null = null;
let positionObserver: ResizeObserver | undefined;
onMounted(() => {
  void goToday();
  void loadCalendarNotes().catch((error) => showError(error, t("utility.calendar.notesLoadFailed")));
  clock = setInterval(() => {
    const date = localCalendarDate();
    if (+date !== +today.value) today.value = date;
  }, 1000);
});
onActivated(() => { displayed = true; void goToday(); });
onDeactivated(() => { displayed = false; cancelPosition(); });
onUnmounted(() => { displayed = false; clearInterval(clock); cancelPosition(); });

const yearOptions = computed(() => {
  const formatter = new Intl.DateTimeFormat(locale.value, { year: "numeric", timeZone: "UTC" });
  return Array.from({ length: lastYear - firstYear + 1 }, (_, i) => {
    const value = firstYear + i;
    return { value, label: formatter.format(calendarDate(value, 0)) };
  });
});

const monthNames = computed(() => {
  const formatter = new Intl.DateTimeFormat(locale.value, { month: "long", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, month) => formatter.format(calendarDate(2024, month)));
});

const weekdays = computed(() => {
  const formatter = new Intl.DateTimeFormat(locale.value, { weekday: "narrow", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => formatter.format(calendarDate(2024, 0, i + 1)));
});

const fullDate = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: "full", timeZone: "UTC" }));
const lunarDate = computed(() => new Intl.DateTimeFormat(locale.value, {
  calendar: "chinese",
  numberingSystem: "latn",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
}));
const supportsLunar = computed(() => lunarDate.value.resolvedOptions().calendar === "chinese");

function festivalLabels(date: Date) {
  return calendarFestivals(date).map((key) => t(`utility.calendar.${key}`));
}

function lunarLabel(date: Date) {
  return supportsLunar.value ? lunarDate.value.format(date) : "";
}

const notedDates = computed(() => {
  const dates = new Set(Object.keys(calendarNotes.value));
  for (const [origin, note] of Object.entries(calendarNotes.value)) {
    if (!note.annual) continue;
    for (let y = firstVisibleYear.value; y <= lastVisibleYear.value; y++) {
      const date = `${y}${origin.slice(4)}`;
      if (calendarNoteOccursOn(origin, note, date)) dates.add(date);
    }
  }
  return dates;
});

const years = computed(() => Array.from({ length: 3 }, (_, i) => {
  const value = firstVisibleYear.value + i;
  return {
    value,
    label: yearOptions.value[value - firstYear].label,
    months: monthNames.value.map((label, month) => ({
      label,
      days: monthDays(value, month).map((date) => {
        const outside = date.getUTCMonth() !== month;
        const lunarParts = supportsLunar.value ? lunarDate.value.formatToParts(date) : [];
        const lunar = compactLunarDate(lunarParts, locale.value);
        const festivalKeys = outside ? [] : calendarFestivals(date);
        const festivals = festivalKeys.map((key) => t(`utility.calendar.${key}`));
        const title = outside ? [] : [fullDate.value.format(date), ...festivals];
        if (lunarParts.length) title.push(lunarParts.map((part) => part.value).join(""));
        return {
          date,
          key: calendarDateKey(date),
          number: date.getUTCDate(),
          outside,
          lunar,
          festival: festivalKeys[0] === "nationalDay" ? t("utility.calendar.nationalDayShort") : festivals[0],
          title: title.join(" · "),
        };
      }),
    })),
  };
}));

const selectedLunar = computed(() => lunarLabel(selected.value));
const selectedFestivals = computed(() => festivalLabels(selected.value));
const popupDate = ref(today.value);
const popupKey = computed(() => calendarDateKey(popupDate.value));
const popupNotes = computed(() => calendarNotesOn(calendarNotes.value, popupKey.value));
const popupFestivals = computed(() => festivalLabels(popupDate.value));
const popupLunar = computed(() => lunarLabel(popupDate.value));
const popupTrigger = ref<HTMLElement>();
const popupPanel = ref<HTMLElement>();
const pinned = ref(false);
const editKey = ref("");
const timePickerOpen = ref(false);
const popup = usePopover(popupTrigger, popupPanel, {
  side: "right",
  preserve: () => !!editKey.value,
  ignoreEscape: () => timePickerOpen.value,
});
let hoverTimer: ReturnType<typeof setTimeout>;
const noteInput = ref<HTMLTextAreaElement>();
const draft = ref("");
const annual = ref(false);
const reminderDateTime = ref("");
const saving = ref(false);

function keepPopupOpen() {
  clearTimeout(hoverTimer);
}

function leavePopup() {
  if (!popup.open.value || pinned.value) return;
  keepPopupOpen();
  hoverTimer = setTimeout(popup.close, 100);
}

watch(popup.open, (open) => {
  if (open) return;
  keepPopupOpen();
  if (popupPanel.value?.contains(document.activeElement)) popupTrigger.value?.focus({ preventScroll: true });
  pinned.value = false;
  timePickerOpen.value = false;
  editKey.value = "";
}, { flush: "sync" });

onDeactivated(popup.close);

async function showDatePopup(date: Date, event: MouseEvent, pin: boolean) {
  if (editKey.value || (!pin && pinned.value)) return;
  keepPopupOpen();
  const trigger = event.currentTarget as HTMLElement;
  if (pin && pinned.value && popupTrigger.value === trigger) {
    popup.close();
    return;
  }
  popupDate.value = date;
  popupTrigger.value = trigger;
  pinned.value = pin;
  if (pin) selected.value = date;
  if (popup.open.value) {
    await nextTick();
    popup.place();
  } else {
    await popup.show();
  }
  if (pin && event.detail === 0) popupPanel.value?.focus({ preventScroll: true });
}

function previewDate(date: Date, event: PointerEvent, hasDetails: boolean) {
  if (hasDetails && event.pointerType === "mouse") void showDatePopup(date, event, false);
}

watch([editKey, popupNotes], async () => {
  await nextTick();
  if (popup.open.value) popup.place();
});

function finishEdit() {
  editKey.value = "";
  void nextTick(() => popupPanel.value?.focus({ preventScroll: true }));
}

async function editNote(key: string) {
  if (saving.value) return;
  const note = calendarNotes.value[key];
  editKey.value = key;
  draft.value = note?.text ?? "";
  annual.value = note?.annual ?? false;
  reminderDateTime.value = note?.reminderTime ? `${key}T${note.reminderTime}` : "";
  await nextTick();
  noteInput.value?.focus({ preventScroll: true });
}

async function commitNote(remove = false) {
  const key = editKey.value;
  const value = draft.value.trim();
  if (!key || saving.value || (!remove && !value)) return;
  saving.value = true;
  try {
    await saveCalendarNote(key, remove ? null : {
      text: value,
      annual: annual.value,
      reminderTime: reminderDateTime.value.split("T")[1],
    });
    recordToolUsage();
    if (editKey.value === key) finishEdit();
  } catch (error) {
    showError(error, t("utility.calendar.notesSaveFailed"));
  } finally {
    saving.value = false;
  }
}

const cardMoves = new WeakMap<HTMLElement, Animation>();

async function resizeCalendar(value: number, anchor?: Element | null) {
  const next = Math.min(maxZoom, Math.max(minZoom, value));
  const panel = yearList.value;
  if (next === zoom.value || !panel) return;
  popup.close();
  const viewport = panel.getBoundingClientRect();
  const cards = Array.from(panel.querySelectorAll<HTMLElement>(".month-card"));
  const positions = cards.map((card) => ({ card, before: card.getBoundingClientRect() }));
  const fixed = positions.find(({ card }) => card === anchor)
    ?? positions.find(({ before }) => before.bottom > viewport.top);
  for (const card of cards) cardMoves.get(card)?.cancel();

  zoom.value = next;
  await nextTick();
  if (yearList.value !== panel) return;
  if (fixed) {
    panel.scrollTop += fixed.card.getBoundingClientRect().top - fixed.before.top;
  }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // 卡片移到新布局的位置，文字用实际字号变化，避免缩放变形。
  const motion = getComputedStyle(panel);
  const duration = parseFloat(motion.getPropertyValue("--dur"));
  const easing = motion.getPropertyValue("--ease-out").trim();
  const moves = positions
    .filter(({ before }) => before.bottom >= viewport.top && before.top <= viewport.bottom)
    .map(({ card, before }) => ({ card, before, after: card.getBoundingClientRect() }));
  for (const { card, before, after } of moves) {
    const x = before.left - after.left;
    const y = before.top - after.top;
    if (Math.abs(x) < 1 && Math.abs(y) < 1) continue;
    const animation = card.animate(
      [{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }],
      { duration, easing },
    );
    cardMoves.set(card, animation);
  }
}

function onWheel(event: WheelEvent) {
  if (!event.ctrlKey) return;
  event.preventDefault();
  if (!event.deltaY) return;
  const target = event.target as Element | null;
  const direction = event.deltaY < 0 ? 1 : -1;
  void resizeCalendar(zoom.value + direction * 0.05, target?.closest(".month-card"));
}

function scrollToYear() {
  yearList.value?.querySelector(`[data-year="${year.value}"]`)?.scrollIntoView({ block: "start" });
}

async function showYear(value: number) {
  popup.close();
  year.value = value;
  selected.value = value === today.value.getUTCFullYear() ? today.value : calendarDate(value, 0);
  await nextTick();
  scrollToYear();
}

async function goToday() {
  cancelPosition();
  const version = navigationVersion;
  popup.close();
  today.value = localCalendarDate();
  selected.value = today.value;
  year.value = today.value.getUTCFullYear();
  await nextTick();
  if (!displayed || version !== navigationVersion) return;
  targetDate = +today.value;
  const panel = yearList.value;
  if (!panel) return;
  // 侧栏展开、异步组件挂载可能改变月历列数，入场后继续按实际布局校正。
  // 用户开始浏览或编辑时立即停止校正，保留手动滚动位置。
  if (typeof ResizeObserver !== "undefined") {
    positionObserver = new ResizeObserver(queuePosition);
    positionObserver.observe(panel);
    const currentYear = panel.querySelector(`[data-year="${year.value}"]`);
    if (currentYear) positionObserver.observe(currentYear);
  }
  queuePosition();
}

function cancelPosition() {
  navigationVersion += 1;
  targetDate = null;
  cancelAnimationFrame(todayFrame);
  todayFrame = 0;
  positionObserver?.disconnect();
  positionObserver = undefined;
}

function queuePosition() {
  if (!displayed || targetDate === null || todayFrame) return;
  todayFrame = requestAnimationFrame(() => {
    todayFrame = 0;
    if (!displayed || targetDate === null) return;
    const panel = yearList.value;
    const day = panel?.querySelector<HTMLElement>(`[data-date="${targetDate}"]`);
    if (panel && day) centerCalendarDay(panel, day);
  });
}

const dayOffsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
async function moveSelection(event: KeyboardEvent) {
  const offset = dayOffsets[event.key];
  if (offset === undefined) return;
  event.preventDefault();
  popup.close();
  const date = calendarDate(selected.value.getUTCFullYear(), selected.value.getUTCMonth(), selected.value.getUTCDate() + offset);
  if (date.getUTCFullYear() < firstVisibleYear.value || date.getUTCFullYear() > lastVisibleYear.value) return;
  selected.value = date;
  await nextTick();
  yearList.value?.querySelector<HTMLButtonElement>(`[data-date="${+date}"]`)?.focus();
}
</script>

<template>
  <div class="calendar" @pointerdown.capture="cancelPosition" @wheel.passive="cancelPosition" @keydown.capture="cancelPosition">
    <div class="toolbar">
      <div class="navigation">
        <div class="year-navigation">
          <button type="button" class="icon-btn" :disabled="firstVisibleYear === firstYear"
            :aria-label="t('utility.calendar.previous')" :title="t('utility.calendar.previous')"
            @click="showYear(Math.max(firstYear, year - 3))">
            <ChevronLeft :size="16" />
          </button>
          <AppSelect class="year-select" :model-value="year" :options="yearOptions" :aria-label="t('utility.calendar.year')"
            @update:model-value="showYear" />
          <button type="button" class="icon-btn" :disabled="lastVisibleYear === lastYear"
            :aria-label="t('utility.calendar.next')" :title="t('utility.calendar.next')"
            @click="showYear(Math.min(lastYear, year + 3))">
            <ChevronRight :size="16" />
          </button>
        </div>
        <button type="button" class="btn small today-button" @click="goToday">{{ t("utility.calendar.today") }}</button>
        <ZoomControls class="calendar-zoom-controls" :zoom="zoom" :min="minZoom" :max="maxZoom"
          @zoom="resizeCalendar" @reset="resizeCalendar(1)" />
        <button v-if="calendarDesktop" type="button" class="btn small subtle reminder-setting"
          :aria-pressed="calendarReminders" @click="calendarReminders = !calendarReminders">
          <Bell v-if="calendarReminders" :size="15" aria-hidden="true" />
          <BellOff v-else :size="15" aria-hidden="true" />
          {{ t("utility.calendar.desktopReminder") }}
        </button>
      </div>
      <div class="details" aria-live="polite">
        <strong>{{ fullDate.format(selected) }}</strong>
        <div v-if="selectedLunar || selectedFestivals.length" class="date-meta">
          <span v-if="selectedLunar">{{ t("utility.calendar.lunar") }} {{ selectedLunar }}</span>
          <span v-for="name in selectedFestivals" :key="name" class="festival-label">{{ name }}</span>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="calendar-popup">
        <aside v-if="popup.open.value" ref="popupPanel" class="date-popup" :style="popup.style.value"
          :class="{ 'date-popup-pinned': pinned, 'date-popup-left': popup.placement.value === 'left' }"
          :role="pinned ? 'dialog' : 'tooltip'"
          :aria-label="fullDate.format(popupDate)" tabindex="-1"
          @pointerenter="keepPopupOpen" @pointerleave="leavePopup">
          <header class="popup-header">
            <strong>{{ fullDate.format(popupDate) }}</strong>
            <button v-if="pinned" type="button" class="icon-btn" :aria-label="t('countdown.dismiss')" @click="popup.close">
              <X :size="15" />
            </button>
          </header>
          <div class="popup-date">
            <span v-if="popupLunar">{{ t("utility.calendar.lunar") }} · {{ popupLunar }}</span>
            <span v-for="name in popupFestivals" :key="name" class="festival-label">{{ name }}</span>
          </div>
          <div v-for="[key, note] in popupNotes" :key="key" class="note-label">
            <span class="note-heading">
              <b>{{ t(note.annual ? "utility.calendar.anniversary" : "utility.calendar.note") }}</b>
              <span v-if="note.reminderTime">{{ t("utility.calendar.reminderTime") }} · {{ note.reminderTime }}</span>
            </span>
            <span class="note-text">{{ note.text }}</span>
            <button v-if="pinned && !editKey" type="button" class="btn small" :disabled="saving" @click="editNote(key)">
              {{ t("utility.calendar.editNote") }}
            </button>
          </div>
          <button v-if="pinned && !editKey && !calendarNotes[popupKey]" type="button" class="btn small"
            :disabled="!calendarNotesReady || saving" @click="editNote(popupKey)">{{ t("utility.calendar.addNote") }}</button>
          <Transition name="pop">
            <form v-if="editKey" class="note-editor" @submit.prevent="commitNote()">
              <textarea ref="noteInput" v-model="draft" class="field" rows="2" maxlength="200"
                :aria-label="t('utility.calendar.note')" :placeholder="t('utility.calendar.notePlaceholder')" :disabled="saving" />
              <div class="editor-actions">
                <label class="check"><input v-model="annual" type="checkbox" :disabled="saving" />{{ t("utility.calendar.repeatAnnually") }}</label>
              </div>
              <div class="reminder-field">
                <span>{{ t("utility.calendar.reminderTime") }}</span>
                <DateTimePicker v-model="reminderDateTime" :fixed-date="editKey" :disabled="saving"
                  :aria-label="t('utility.calendar.reminderTime')" :placeholder="t('utility.calendar.allDayReminder')"
                  :clear-label="t('utility.calendar.allDayReminder')" @open-change="timePickerOpen = $event" />
              </div>
              <div class="editor-actions">
                <button type="submit" class="btn small primary" :disabled="saving || !draft.trim()">{{ t("utility.calendar.saveNote") }}</button>
                <button v-if="calendarNotes[editKey]" type="button" class="btn small" :disabled="saving" @click="commitNote(true)">
                  {{ t("utility.calendar.deleteNote") }}
                </button>
                <button type="button" class="btn small subtle" :disabled="saving" @click="finishEdit">{{ t("utility.calendar.cancelEdit") }}</button>
              </div>
            </form>
          </Transition>
        </aside>
      </Transition>
    </Teleport>

    <div ref="yearList" class="year-list" :style="{ '--calendar-zoom': zoom }" @wheel="onWheel">
      <section v-for="entry in years" :key="entry.value" :data-year="entry.value" class="year">
        <h2>{{ entry.label }}</h2>
        <div class="months">
          <section v-for="card in entry.months" :key="card.label" class="month-card">
            <h3>{{ card.label }}</h3>
            <div class="days">
              <span v-for="(weekday, index) in weekdays" :key="index" class="weekday">{{ weekday }}</span>
              <template v-for="day in card.days" :key="+day.date">
                <div v-if="day.outside" class="day outside" aria-hidden="true">
                  <span class="day-number">{{ day.number }}</span>
                  <span class="day-caption">{{ day.lunar }}</span>
                </div>
                <button v-else type="button" class="day"
                  :class="{ festival: day.festival, 'has-note': notedDates.has(day.key) }"
                  :data-date="+day.date" :aria-current="+day.date === +today ? 'date' : undefined"
                  :aria-pressed="+day.date === +selected" :tabindex="+day.date === +selected ? 0 : -1"
                  :aria-label="notedDates.has(day.key) ? day.title + ' · ' + t('utility.calendar.note') : day.title"
                  aria-haspopup="dialog" :aria-expanded="pinned && +day.date === +popupDate"
                  @pointerenter="previewDate(day.date, $event, notedDates.has(day.key) || !!day.festival)"
                  @pointerleave="leavePopup" @click="showDatePopup(day.date, $event, true)" @keydown="moveSelection">
                  <span class="day-number">{{ day.number }}</span>
                  <span class="day-caption">{{ day.festival || day.lunar }}</span>
                  <StickyNote v-if="notedDates.has(day.key)" :size="13" class="day-note" aria-hidden="true" />
                </button>
              </template>
            </div>
          </section>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.calendar {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.toolbar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.navigation {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.year-navigation {
  display: flex;
  align-items: center;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.year-navigation :deep(.year-select) {
  width: 99px;
  height: 28px;
  padding-inline: 8px;
  border: 0;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.navigation .icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.navigation .today-button,
.navigation .reminder-setting {
  height: 34px;
  font-size: 13px;
}
.calendar-zoom-controls {
  padding: 3px 4px;
  border-radius: 8px;
  background: var(--bg-sunken);
}
.calendar-zoom-controls :deep(.zoom-value) {
  font-size: 13px;
  font-weight: 500;
}
.reminder-setting[aria-pressed="true"] svg {
  color: var(--accent);
}
.details {
  display: grid;
  justify-items: end;
  gap: 2px;
  min-width: 0;
  margin-inline-start: auto;
  text-align: end;
  line-height: 1.35;
}
.date-meta {
  display: flex;
  justify-content: end;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  color: var(--text-2);
  font-size: 13px;
}
.details strong {
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.festival-label {
  padding: 2px 6px;
  border-radius: 5px;
  color: var(--accent);
  background: var(--accent-soft);
}
@media (max-width: 720px) {
  .details {
    justify-items: start;
    margin-inline-start: 0;
    text-align: start;
  }
  .date-meta {
    justify-content: start;
  }
}
.editor-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.date-popup {
  --date-popup-collapsed: inset(0 100% 100% 0);
  position: fixed;
  z-index: 101;
  display: grid;
  justify-items: start;
  gap: 10px;
  width: min(318px, calc(100vw - 16px));
  max-height: min(420px, calc(100vh - 16px));
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  overflow: auto;
  outline: none;
}
.date-popup-left {
  --date-popup-collapsed: inset(0 0 100% 100%);
}
.calendar-popup-enter-active {
  transition: clip-path var(--dur) var(--ease-out);
}
.calendar-popup-leave-active {
  transition: clip-path calc(var(--dur-fast) * 0.65) ease-in;
  pointer-events: none;
}
.calendar-popup-enter-from,
.calendar-popup-leave-to {
  clip-path: var(--date-popup-collapsed);
}
.calendar-popup-enter-to,
.calendar-popup-leave-from {
  clip-path: inset(-32px);
}
.date-popup-pinned {
  width: min(360px, calc(100vw - 16px));
  max-height: min(540px, calc(100vh - 16px));
  padding: 16px;
}
.popup-header,
.popup-date {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.popup-header {
  justify-content: space-between;
}
.popup-header strong {
  font-size: 14px;
  font-weight: 600;
}
.popup-date {
  flex-wrap: wrap;
  color: var(--text-2);
  font-size: 12px;
}
.note-label {
  display: grid;
  justify-items: start;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-sunken);
  color: var(--text);
  text-align: start;
  font-size: 13px;
}
.note-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  color: var(--text-2);
  font-size: 12px;
}
.note-heading b {
  color: var(--syntax-key);
}
.note-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.note-editor {
  display: grid;
  width: 100%;
  gap: 10px;
}
.note-editor textarea {
  padding: 6px 8px;
  min-height: 104px;
  resize: vertical;
}
.reminder-field {
  display: grid;
  width: min(260px, 100%);
  gap: 5px;
  color: var(--text-2);
  font-size: 13px;
}
.year-list {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overflow-anchor: none;
}
.year {
  padding-block: 16px 28px;
}
.year h2 {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 0 12px;
  font-size: calc(21px * var(--calendar-zoom));
  line-height: calc(27px * var(--calendar-zoom));
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition: font-size var(--dur) var(--ease-out);
}
.year h2::after {
  flex: 1;
  height: 1px;
  background: var(--border);
  content: "";
}
.months {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(322px * var(--calendar-zoom))), 1fr));
  align-items: start;
  gap: 14px;
}
.month-card {
  min-width: 0;
  padding: clamp(12px, calc(14px * var(--calendar-zoom)), 22px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.month-card h3 {
  margin: 0 0 calc(10px * var(--calendar-zoom));
  padding-inline: 4px;
  font-size: clamp(14px, calc(16px * var(--calendar-zoom)), 24px);
  font-weight: 600;
}
.days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  grid-template-rows: 24px;
  grid-auto-rows: minmax(calc(56px * var(--calendar-zoom)), auto);
  column-gap: 3px;
  row-gap: 2px;
  text-align: center;
}
.weekday {
  align-self: center;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
}
.day {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  gap: 2px;
  padding: 3px 0 5px;
  border: 0;
  border-radius: 8px;
  color: var(--text);
  background: transparent;
  font-family: var(--font-sans);
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.day-number {
  display: grid;
  flex: none;
  place-items: center;
  inline-size: min(100%, clamp(23px, calc(28px * var(--calendar-zoom)), 48px));
  aspect-ratio: 1;
  border-radius: 50%;
  font-size: clamp(14px, calc(17px * var(--calendar-zoom)), 30px);
  font-weight: 500;
  transition: font-size var(--dur) var(--ease-out);
}
.day-caption {
  max-width: 100%;
  color: var(--text-2);
  font-size: clamp(11px, calc(12px * var(--calendar-zoom)), 18px);
  overflow-wrap: anywhere;
  hyphens: auto;
  text-wrap: pretty;
}
button.day {
  cursor: pointer;
}
.outside,
.outside .day-caption {
  color: var(--text-3);
}
button.day:hover {
  background: var(--hover);
}
.festival .day-caption {
  color: var(--accent-hover);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.day-note {
  flex: none;
  color: var(--syntax-key);
}
.day.has-note {
  background: var(--bg-sunken);
}
.day[aria-pressed="true"] {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.day[aria-current="date"] .day-number {
  color: var(--surface);
  background: var(--accent-hover);
}
.day:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>
