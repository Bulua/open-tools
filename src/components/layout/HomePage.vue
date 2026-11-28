<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  AlarmClock,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Clock3,
  FileText,
  RotateCcw,
  Sparkles,
  Star,
  Timer,
  Trash2,
} from "lucide-vue-next";
import MascotCarousel from "./MascotCarousel.vue";
import ToolSearchButton from "@/components/common/ToolSearchButton.vue";
import ToolActivity from "./ToolActivity.vue";
import FavoriteToolButton from "@/components/common/FavoriteToolButton.vue";
import type { Category } from "@/tools";
import { clearRecentTools, favoriteToolIds, recentToolIds } from "@/composables/toolLibrary";
import { countdowns, now } from "@/tools/time/clock/clockStore";
import { clockTab, stopwatch, type ClockTab } from "@/tools/time/clock/clockState";
import { formatStopwatch } from "@/tools/time/clock/stopwatch";
import { countdownTitle, formatRemaining, progressOf } from "@/tools/time/clock/reminders";
import { calendarNotes, loadCalendarNotes } from "@/tools/time/calendar/calendarStore";
import {
  calendarCrossDayRemindersOn,
  calendarDateKey,
  calendarFestivals,
  calendarNotesOn,
  calendarReminderDisplay,
  calendarReminderParts,
  calendarReminderTargetDate,
  localCalendarDate,
} from "@/tools/time/calendar/calendar";
import { useNotebook } from "@/tools/daily/notebook/storage";
import type { Note } from "@/tools/daily/notebook/notebook";
import { showError } from "@/utils/errorToast";

const props = defineProps<{ categories: Category[] }>();
const emit = defineEmits<{
  select: [categoryId: string, toolId: string];
  search: [];
  ai: [];
}>();

const { t, locale } = useI18n();

const QUICK_TOOL_IDS = ["screenshot-history", "clipboard-history", "notebook", "calculator", "json-format"];
const RECOMMENDED_TOOL_IDS = ["json-format", "screenshot-history", "clipboard-history", "password", "image-compress", "calculator"];

const deadlineFormat = computed(() => new Intl.DateTimeFormat(locale.value, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}));

const todayDate = computed(() => localCalendarDate(new Date(now.value)));
const date = computed(() => new Intl.DateTimeFormat(locale.value, {
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(now.value));

const lunarFormatter = computed(() => new Intl.DateTimeFormat(locale.value, {
  calendar: "chinese",
  numberingSystem: "latn",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
}));
const lunarText = computed(() => (
  lunarFormatter.value.resolvedOptions().calendar === "chinese"
    ? lunarFormatter.value.format(todayDate.value)
    : ""
));
const festivals = computed(() => calendarFestivals(todayDate.value).map((key) => t(`utility.calendar.${key}`)));

const greetingKey = computed(() => {
  const hour = new Date(now.value).getHours();
  if (hour >= 5 && hour < 12) return "home.greetingMorning";
  if (hour >= 12 && hour < 14) return "home.greetingNoon";
  if (hour >= 14 && hour < 18) return "home.greetingAfternoon";
  if (hour >= 18 && hour < 23) return "home.greetingEvening";
  return "home.greetingLateNight";
});

const tools = computed(() => props.categories.flatMap((category) => category.tools.map((tool) => ({ category, tool }))));
const findToolsByIds = (ids: string[]) => ids.flatMap((id) => {
  const entry = tools.value.find((item) => item.tool.id === id);
  return entry ? [entry] : [];
});

const quickTools = computed(() => findToolsByIds(QUICK_TOOL_IDS));
const favoriteEntries = computed(() => findToolsByIds(favoriteToolIds.value));
const recommendedEntries = computed(() => findToolsByIds(RECOMMENDED_TOOL_IDS));
const recentEntries = computed(() => findToolsByIds(recentToolIds.value).slice(0, 6));
const primaryEntries = computed(() => (favoriteEntries.value.length ? favoriteEntries.value : recommendedEntries.value));

// 仅在主页可见且秒表运行时轻量刷新，避免后台无谓消耗
const perfNow = ref(performance.now());
let homeActive = false;
let stopwatchRefresh: ReturnType<typeof setInterval> | undefined;

function syncStopwatchRefresh() {
  if (homeActive && stopwatch.running) {
    if (stopwatchRefresh !== undefined) return;
    perfNow.value = performance.now();
    stopwatchRefresh = setInterval(() => { perfNow.value = performance.now(); }, 100);
  } else {
    clearInterval(stopwatchRefresh);
    stopwatchRefresh = undefined;
  }
}

watch(() => stopwatch.running, syncStopwatchRefresh);
onActivated(() => { homeActive = true; syncStopwatchRefresh(); });
onDeactivated(() => { homeActive = false; syncStopwatchRefresh(); });
onBeforeUnmount(() => { homeActive = false; syncStopwatchRefresh(); });

const stopwatchRunning = computed(() => stopwatch.running);
const stopwatchElapsed = computed(() => stopwatch.elapsed(perfNow.value));

const runningTimers = computed(() => countdowns.value
  .filter((item) => !item.alarm && !!item.duration && item.enabled !== false && !item.done && item.pausedRemaining === undefined)
  .sort((a, b) => a.target - b.target));

const activeAlarms = computed(() => countdowns.value
  .filter((item) => (item.alarm || !item.duration) && item.enabled !== false && !item.done && item.pausedRemaining === undefined)
  .sort((a, b) => a.target - b.target)
  .slice(0, 4));

const hasClockReminders = computed(() => stopwatchRunning.value || runningTimers.value.length > 0 || activeAlarms.value.length > 0);

function openClockTab(targetTab: ClockTab) {
  clockTab.value = targetTab;
  emit("select", "time", "clock");
}

const todayKey = computed(() => calendarDateKey(todayDate.value));
const notes = computed(() => {
  const key = todayKey.value;
  const occurred = calendarNotesOn(calendarNotes.value, key).map(([id, note]) => ({
    id,
    text: note.text,
    meta: calendarReminderDisplay(id, note, key) || t("home.allDay"),
  }));
  const crossDay = calendarCrossDayRemindersOn(calendarNotes.value, key).map(([id, note]) => ({
    id: `rem:${id}`,
    text: `${calendarReminderTargetDate(id, note, key)} · ${note.text}`,
    meta: calendarReminderParts(note.reminderAt)?.time || t("home.allDay"),
  }));
  return [...occurred, ...crossDay];
});

const { notebook } = useNotebook();

function summarizeMarkdown(markdown: string): string {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+>\d.]+\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 72 ? `${cleaned.slice(0, 72)}…` : cleaned;
}

const recentNotes = computed(() => {
  const state = notebook.value;
  if (!state) return [];
  const allNotes = state.nodes.filter((node): node is Note => node.kind === "note");
  const sorted = [...allNotes].sort((a, b) => {
    if (a.id === state.selectedId) return -1;
    if (b.id === state.selectedId) return 1;
    return 0;
  });
  return sorted.slice(0, 4).map((note) => ({
    id: note.id,
    title: note.name.replace(/\.md$/i, ""),
    preview: summarizeMarkdown(note.markdown) || t("home.emptyNotePreview"),
  }));
});

function openNotebookNote(id: string) {
  if (notebook.value) notebook.value.selectedId = id;
  emit("select", "daily", "notebook");
}

const canOpen = (id: string) => tools.value.some((entry) => entry.tool.id === id);

onMounted(() => {
  homeActive = true;
  syncStopwatchRefresh();
  void loadCalendarNotes().catch(showError);
});
</script>

<template>
  <div class="home">
    <div class="home-inner">
      <header class="welcome">
        <div class="welcome-main">
          <div class="welcome-copy">
            <div class="date-row">
              <p class="date">
                <span>{{ date }}</span>
                <span v-if="lunarText" class="date-lunar">· {{ lunarText }}</span>
              </p>
              <span v-for="festival in festivals" :key="festival" class="festival-badge">{{ festival }}</span>
            </div>
            <h1>{{ t(greetingKey) }}</h1>
            <p class="intro">{{ t('home.subtitle') }}</p>
            <div class="welcome-tools">
              <ToolSearchButton @search="emit('search')" />
              <div class="quick-actions" :aria-label="t('home.quickActions')">
                <button class="quick-chip quick-chip-ai" @click="emit('ai')">
                  <Sparkles :size="14" />
                  <span>{{ t('home.aiWorkspace') }}</span>
                </button>
                <button
                  v-for="{ category, tool } in quickTools"
                  :key="tool.id"
                  class="quick-chip"
                  :title="tool.desc"
                  @click="emit('select', category.id, tool.id)"
                >
                  <component :is="tool.icon" :size="14" />
                  <span>{{ tool.name }}</span>
                </button>
              </div>
            </div>
          </div>
          <ToolActivity class="welcome-activity" />
        </div>
        <MascotCarousel />
      </header>

      <div class="home-columns">
        <div class="library">
          <section class="tool-section">
            <header class="section-heading">
              <Star :size="18" />
              <h2>{{ favoriteEntries.length ? t('home.favorites') : t('home.recommended') }}</h2>
              <span>{{ primaryEntries.length }}</span>
              <span v-if="!favoriteEntries.length" class="section-hint">{{ t('home.recommendedHint') }}</span>
            </header>
            <TransitionGroup
              v-if="primaryEntries.length"
              name="home-card"
              tag="div"
              class="tool-grid"
              :class="{ 'favorites-grid': favoriteEntries.length > 0 }"
            >
              <article v-for="{ category, tool } in primaryEntries" :key="tool.id" class="tool-card">
                <button class="open-tool" :title="tool.desc" @click="emit('select', category.id, tool.id)">
                  <span class="tool-icon"><component :is="tool.icon" :size="22" :stroke-width="1.7" /></span>
                  <span class="tool-copy"><strong>{{ tool.name }}</strong><small>{{ category.name }}</small></span>
                  <ArrowUpRight class="open-arrow" :size="16" />
                </button>
                <FavoriteToolButton class="favorite" :tool-id="tool.id" />
              </article>
            </TransitionGroup>
          </section>

          <section class="tool-section">
            <header class="section-heading">
              <Clock3 :size="18" />
              <h2>{{ t('home.recent') }}</h2>
              <span>{{ recentEntries.length }}</span>
              <button v-if="recentEntries.length" class="section-action" @click="clearRecentTools">
                <Trash2 :size="13" />
                <span>{{ t('home.clearRecent') }}</span>
              </button>
            </header>
            <TransitionGroup v-if="recentEntries.length" name="home-card" tag="div" class="tool-grid">
              <article v-for="{ category, tool } in recentEntries" :key="tool.id" class="tool-card">
                <button class="open-tool" :title="tool.desc" @click="emit('select', category.id, tool.id)">
                  <span class="tool-icon"><component :is="tool.icon" :size="22" :stroke-width="1.7" /></span>
                  <span class="tool-copy"><strong>{{ tool.name }}</strong><small>{{ category.name }}</small></span>
                  <ArrowUpRight class="open-arrow" :size="16" />
                </button>
                <FavoriteToolButton class="favorite" :tool-id="tool.id" />
              </article>
            </TransitionGroup>
            <div v-else class="empty-inline">
              <Clock3 :size="16" />
              <span>{{ t('home.recentEmpty') }}</span>
              <button class="empty-inline-btn" @click="emit('search')">
                <span>{{ t('home.findTool') }}</span>
                <ArrowUpRight :size="13" />
              </button>
            </div>
          </section>
        </div>

        <aside class="reminders">
          <header class="section-heading"><Bell :size="18" /><h2>{{ t('home.reminders') }}</h2></header>
          <section class="reminder-section">
            <header class="reminder-section-heading">
              <h3><CalendarDays :size="15" />{{ t('home.today') }}</h3>
              <button v-if="canOpen('calendar')" class="reminder-link" @click="emit('select', 'time', 'calendar')">
                {{ t('home.openCalendar') }}<ArrowUpRight :size="14" />
              </button>
            </header>
            <div v-if="notes.length" class="reminder-list">
              <button v-for="item in notes" :key="item.id" class="reminder-card" :title="item.text" @click="emit('select', 'time', 'calendar')">
                <span class="reminder-icon calendar-icon"><CalendarDays :size="18" /></span>
                <span class="reminder-content">
                  <strong>{{ item.text }}</strong>
                  <span class="reminder-meta"><Clock3 :size="12" />{{ item.meta }}</span>
                </span>
                <ArrowUpRight class="reminder-arrow" :size="15" />
              </button>
            </div>
            <button v-else-if="canOpen('calendar')" class="quiet quiet-button" @click="emit('select', 'time', 'calendar')">
              {{ t('home.noNotes') }}
            </button>
            <p v-else class="quiet">{{ t('home.noNotes') }}</p>
          </section>

          <section class="reminder-section">
            <header class="reminder-section-heading">
              <h3><Timer :size="15" />{{ t('home.countdowns') }}</h3>
              <button v-if="canOpen('clock')" class="reminder-link" @click="emit('select', 'time', 'clock')">
                {{ t('home.openCountdown') }}<ArrowUpRight :size="14" />
              </button>
            </header>
            <div v-if="hasClockReminders" class="reminder-list">
              <button
                v-if="stopwatchRunning"
                class="reminder-card running-card"
                @click="openClockTab('stopwatch')"
              >
                <span class="reminder-icon"><Timer :size="18" /></span>
                <span class="reminder-content">
                  <span class="countdown-heading">
                    <strong>{{ t('clock.stopwatch') }}</strong>
                    <span class="countdown-remaining">{{ formatStopwatch(stopwatchElapsed) }}</span>
                  </span>
                  <span class="reminder-meta">
                    <span>{{ t('clock.timerRunning') }}</span>
                    <span v-if="stopwatch.laps.length">· {{ t('home.stopwatchLaps', { n: stopwatch.laps.length }) }}</span>
                  </span>
                </span>
                <ArrowUpRight class="reminder-arrow" :size="15" />
              </button>

              <button
                v-for="item in runningTimers"
                :key="item.id"
                class="reminder-card running-card timer-card"
                @click="openClockTab('timer')"
              >
                <span class="reminder-icon"><RotateCcw :size="18" /></span>
                <span class="reminder-content">
                  <span class="countdown-heading">
                    <strong>{{ countdownTitle(item) }}</strong>
                    <span class="countdown-remaining" :title="t('home.remaining')">{{ formatRemaining(item.target - now) }}</span>
                  </span>
                  <span class="reminder-meta">{{ t('clock.timerRunning') }} · {{ t('home.dueAt', { date: deadlineFormat.format(item.target) }) }}</span>
                </span>
                <ArrowUpRight class="reminder-arrow" :size="15" />
                <span class="timer-progress" aria-hidden="true">
                  <span :style="{ width: `${Math.round(progressOf(item, now) * 1000) / 10}%` }" />
                </span>
              </button>

              <button
                v-for="item in activeAlarms"
                :key="item.id"
                class="reminder-card countdown-card"
                :class="{ soon: item.target - now <= 3600000 }"
                @click="openClockTab('alarm')"
              >
                <span class="reminder-icon"><AlarmClock :size="18" /></span>
                <span class="reminder-content">
                  <span class="countdown-heading">
                    <strong>{{ countdownTitle(item) }}</strong>
                    <span class="countdown-remaining" :title="t('home.remaining')">{{ formatRemaining(item.target - now) }}</span>
                  </span>
                  <span class="reminder-meta">{{ t('home.dueAt', { date: deadlineFormat.format(item.target) }) }}</span>
                </span>
                <ArrowUpRight class="reminder-arrow" :size="15" />
              </button>
            </div>
            <button v-else-if="canOpen('clock')" class="quiet quiet-button" @click="emit('select', 'time', 'clock')">
              {{ t('home.noCountdowns') }}
            </button>
            <p v-else class="quiet">{{ t('home.noCountdowns') }}</p>
          </section>

          <section v-if="canOpen('notebook')" class="reminder-section">
            <header class="reminder-section-heading">
              <h3><FileText :size="15" />{{ t('home.recentNotes') }}</h3>
              <button class="reminder-link" @click="emit('select', 'daily', 'notebook')">
                {{ t('home.openNotebook') }}<ArrowUpRight :size="14" />
              </button>
            </header>
            <div v-if="recentNotes.length" class="reminder-list">
              <button
                v-for="note in recentNotes"
                :key="note.id"
                class="reminder-card"
                :title="note.title"
                @click="openNotebookNote(note.id)"
              >
                <span class="reminder-icon note-icon"><FileText :size="18" /></span>
                <span class="reminder-content">
                  <strong class="note-title">{{ note.title }}</strong>
                  <span class="reminder-meta note-preview">{{ note.preview }}</span>
                </span>
                <ArrowUpRight class="reminder-arrow" :size="15" />
              </button>
            </div>
            <button v-else class="quiet quiet-button" @click="emit('select', 'daily', 'notebook')">
              {{ t('home.noNotebookNotes') }}
            </button>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.home-inner {
  --home-aside-width: 320px;
  --home-column-gap: 32px;
  max-width: 1400px;
  margin: 0 auto;
  padding: 36px 44px 48px;
}
.welcome, .home-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--home-aside-width);
  align-items: start;
  gap: var(--home-column-gap);
}
.welcome {
  padding: 0 0 28px;
  margin-bottom: 32px;
  border-bottom: 1px solid var(--border);
}
.welcome-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: start;
  gap: 24px;
  min-width: 0;
}
.welcome-copy {
  min-width: 0;
}
.welcome .welcome-activity {
  justify-self: start;
}
.date-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 10px;
}
.date {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  line-height: 20px;
  color: var(--text-3);
  font-size: 13px;
  margin: 0;
}
.date-lunar {
  color: var(--text-2);
}
.festival-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
}
h1 {
  font: 400 32px/1.35 var(--font-sans);
  margin: 0 0 8px;
}
.intro {
  color: var(--text-2);
  font-size: 14px;
  margin: 0 0 18px;
}
.welcome-tools {
  display: grid;
  gap: 12px;
  justify-items: start;
}
.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.quick-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.quick-chip:hover {
  border-color: var(--border-strong);
  color: var(--text);
  background: var(--hover);
}
.quick-chip-ai {
  border-color: color-mix(in srgb, var(--accent) 36%, var(--border));
  background: var(--accent-soft);
  color: var(--accent);
}
.quick-chip-ai:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent-soft) 140%, var(--surface));
}
.library {
  display: grid;
  gap: 32px;
  min-width: 0;
}
.section-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 16px;
  color: var(--text-2);
}
h2 {
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}
.section-heading > span {
  font-size: 12px;
  color: var(--text-3);
}
.section-hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
}
.section-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 3px 8px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text-3);
  font-size: 12px;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.section-action:hover {
  color: var(--text);
  background: var(--hover);
}
.tool-grid {
  --tool-card-height: 82px;
  --tool-grid-gap: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: var(--tool-card-height);
  gap: var(--tool-grid-gap);
  position: relative;
}
.favorites-grid {
  max-height: calc(4 * var(--tool-card-height) + 3 * var(--tool-grid-gap));
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  overscroll-behavior: contain;
}
.tool-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: border-color var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out);
}
.tool-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow);
}
.open-tool {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  gap: 12px;
  padding: 16px 42px 16px 16px;
  text-align: left;
  background: none;
  border: 0;
  color: var(--text);
  cursor: pointer;
  border-radius: inherit;
}
.tool-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 10px;
}
.tool-copy {
  min-width: 0;
  display: grid;
  gap: 5px;
}
.tool-copy strong {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tool-copy small {
  font-size: 12px;
  color: var(--text-3);
}
.open-arrow {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--text-3);
  transition: transform var(--dur) var(--ease-out);
}
.open-tool:hover .open-arrow {
  transform: translate(2px, -2px);
}
.favorite {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0.45;
  transition: opacity var(--dur-fast) var(--ease-out), color var(--dur) var(--ease-out), background var(--dur) var(--ease-out), transform var(--dur) var(--ease-out);
}
.tool-card:hover .favorite,
.tool-card:focus-within .favorite,
.tool-card .favorite.selected {
  opacity: 1;
}
.empty-inline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 16px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  color: var(--text-3);
  font-size: 13px;
}
.empty-inline-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.empty-inline-btn:hover {
  border-color: var(--border-strong);
}
.reminders {
  min-width: 0;
}
.reminder-section + .reminder-section {
  margin-top: 24px;
}
.reminder-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 10px;
}
h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  margin: 0;
  color: var(--text-2);
}
.reminder-list {
  display: grid;
  gap: 10px;
}
.quiet {
  width: 100%;
  padding: 12px 14px;
  margin: 0;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: none;
  text-align: start;
  font-size: 13px;
  color: var(--text-3);
  line-height: 1.6;
}
.quiet-button {
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.quiet-button:hover {
  border-color: var(--border-strong);
  color: var(--text-2);
  background: var(--bg-sunken);
}
.reminder-card {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 15px;
  align-items: start;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: start;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: border-color var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out), transform var(--dur) var(--ease-out);
}
.reminder-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.reminder-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--bg-sunken);
  color: var(--text-2);
}
.calendar-icon,
.note-icon {
  color: var(--accent);
  background: var(--accent-soft);
}
.reminder-content {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.reminder-content strong {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.note-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reminder-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}
.note-preview {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reminder-arrow {
  color: var(--text-3);
  margin-top: 3px;
}
.countdown-heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 10px;
  justify-content: space-between;
}
.countdown-heading strong {
  flex: 1;
  min-width: 0;
}
.countdown-remaining {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.running-card {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.timer-card {
  position: relative;
  overflow: hidden;
}
.timer-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: var(--bg-sunken);
}
.timer-progress > span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.4s linear;
}
.countdown-card.soon {
  border-color: var(--accent);
}
.running-card .countdown-remaining,
.soon .countdown-remaining {
  color: var(--accent);
}
.running-card .reminder-icon,
.soon .reminder-icon {
  background: var(--accent-soft);
  color: var(--accent);
}
.reminder-link {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 0;
  color: var(--accent);
  background: none;
  border: 0;
  font-size: 12px;
  cursor: pointer;
}
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.home-card-move, .home-card-enter-active, .home-card-leave-active {
  transition: transform var(--dur-slow) var(--ease-out), clip-path var(--dur) var(--ease-out);
}
.home-card-enter-from, .home-card-leave-to {
  transform: translateY(8px);
  clip-path: inset(0 0 100% 0);
}
.home-card-leave-active {
  position: absolute;
}
@media (max-width: 1200px) {
  .home-inner {
    --home-aside-width: 280px;
    --home-column-gap: 24px;
    padding: 24px;
  }
  .welcome {
    grid-template-columns: minmax(0, 1fr) 144px;
    gap: 20px;
  }
  .welcome-main {
    gap: 20px;
  }
  .tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 900px) {
  .home-columns {
    grid-template-columns: 1fr;
  }
  .tool-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .reminders {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 24px;
    padding-top: 22px;
    border-top: 1px solid var(--border);
  }
  .reminders > .section-heading {
    grid-column: 1 / -1;
    margin-bottom: 0;
  }
  .reminder-section + .reminder-section {
    margin-top: 0;
  }
}
@media (max-width: 820px) {
  .welcome {
    grid-template-columns: minmax(0, 1fr) 128px;
    gap: 16px;
  }
  .welcome-main {
    display: contents;
  }
  .welcome-copy {
    grid-column: 1;
    grid-row: 1;
  }
  .welcome > .mascot-carousel {
    grid-column: 2;
    grid-row: 1;
  }
  .welcome-activity {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
@media (max-width: 720px) {
  .home-inner {
    padding: 12px 0 24px;
  }
  .welcome {
    padding-bottom: 20px;
    margin-bottom: 24px;
  }
  h1 {
    font-size: 25px;
  }
  .intro {
    font-size: 13px;
    margin-bottom: 16px;
  }
}
@media (max-width: 620px) {
  .tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .reminders {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 480px) {
  .welcome {
    grid-template-columns: minmax(0, 1fr) 96px;
    gap: 14px;
  }
  .tool-grid {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
