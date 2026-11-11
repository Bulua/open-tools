<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowUpRight, Bell, CalendarDays, Clock3, Star, Timer } from "lucide-vue-next";
import MascotCarousel from "./MascotCarousel.vue";
import ToolSearchButton from "@/components/common/ToolSearchButton.vue";
import ToolActivity from "./ToolActivity.vue";
import FavoriteToolButton from "@/components/common/FavoriteToolButton.vue";
import type { Category } from "@/tools";
import { favoriteToolIds, recentToolIds } from "@/composables/toolLibrary";
import { countdowns, now } from "@/tools/utility/countdownStore";
import { formatRemaining } from "@/tools/utility/countdown";
import { calendarNotes, loadCalendarNotes } from "@/tools/utility/calendarStore";
import { calendarDateKey, calendarNotesOn, localCalendarDate } from "@/tools/utility/calendar";
import { showError } from "@/utils/errorToast";
const props = defineProps<{ categories: Category[]; embedded?: boolean }>();
const emit = defineEmits<{ select: [categoryId: string, toolId: string]; search: [] }>();
const { t, locale } = useI18n();
const deadlineFormat = computed(() => new Intl.DateTimeFormat(locale.value, {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
}));
const date = computed(() => new Intl.DateTimeFormat(locale.value, { month: "long", day: "numeric", weekday: "long" }).format(now.value));
const tools = computed(() => props.categories.flatMap((category) => category.tools.map((tool) => ({ category, tool }))));
const sections = computed(() => [
  { id: "favorites" as const, icon: Star, items: favoriteToolIds.value },
  { id: "recent" as const, icon: Clock3, items: recentToolIds.value },
].map((section) => {
  const entries = section.items.flatMap((id) => {
    const entry = tools.value.find((item) => item.tool.id === id);
    return entry ? [entry] : [];
  });
  return { ...section, entries: section.id === "recent" ? entries.slice(0, 6) : entries };
}));
const pending = computed(() => countdowns.value.filter((item) => !item.done && item.pausedRemaining === undefined)
  .sort((a, b) => a.target - b.target).slice(0, 4));
const notes = computed(() => calendarNotesOn(calendarNotes.value, calendarDateKey(localCalendarDate(new Date(now.value)))));
const canOpen = (id: string) => tools.value.some((entry) => entry.tool.id === id);
onMounted(() => void loadCalendarNotes().catch(showError));
</script>

<template>
  <div class="home" :class="{ embedded }">
    <div class="home-inner">
      <header class="welcome">
        <div class="welcome-main">
          <div class="welcome-copy">
            <p class="date">{{ date }}</p>
            <h1>{{ t('home.welcome') }}</h1>
            <p class="intro">{{ t('home.subtitle') }}</p>
            <ToolSearchButton @search="emit('search')" />
          </div>
          <ToolActivity class="welcome-activity" />
        </div>
        <MascotCarousel />
      </header>

      <div class="home-columns">
        <div class="library">
          <section v-for="section in sections" :key="section.id" class="tool-section">
            <header class="section-heading"><component :is="section.icon" :size="18" /><h2>{{ t(`home.${section.id}`) }}</h2><span>{{ section.entries.length }}</span></header>
            <TransitionGroup v-if="section.entries.length" name="home-card" tag="div" class="tool-grid" :class="{ 'favorites-grid': section.id === 'favorites' }">
              <article v-for="{ category, tool } in section.entries" :key="tool.id" class="tool-card">
                <button class="open-tool" @click="emit('select', category.id, tool.id)">
                  <span class="tool-icon"><component :is="tool.icon" :size="22" :stroke-width="1.7" /></span>
                  <span class="tool-copy"><strong>{{ tool.name }}</strong><small>{{ category.name }}</small></span>
                  <ArrowUpRight class="open-arrow" :size="16" />
                </button>
                <FavoriteToolButton class="favorite" :tool-id="tool.id" />
              </article>
            </TransitionGroup>
            <div v-else class="empty-library"><component :is="section.icon" :size="26" :stroke-width="1.3" /><p>{{ t(`home.${section.id}Empty`) }}</p><button class="btn" @click="emit('search')">{{ t('home.findTool') }}<ArrowUpRight :size="14" /></button></div>
          </section>
        </div>

        <aside class="reminders">
          <header class="section-heading"><Bell :size="18" /><h2>{{ t('home.reminders') }}</h2></header>
          <section class="reminder-section">
            <header class="reminder-section-heading">
              <h3><CalendarDays :size="15" />{{ t('home.today') }}</h3>
              <button v-if="canOpen('calendar')" class="reminder-link" @click="emit('select', 'time', 'calendar')">{{ t('home.openCalendar') }}<ArrowUpRight :size="14" /></button>
            </header>
            <div v-if="notes.length" class="reminder-list">
              <button v-for="[id, note] in notes" :key="id" class="reminder-card" :title="note.text" @click="emit('select', 'time', 'calendar')">
                <span class="reminder-icon calendar-icon"><CalendarDays :size="18" /></span>
                <span class="reminder-content">
                  <strong>{{ note.text }}</strong>
                  <span class="reminder-meta"><Clock3 :size="12" />{{ note.reminderTime || t('home.allDay') }}</span>
                </span>
                <ArrowUpRight class="reminder-arrow" :size="15" />
              </button>
            </div>
            <p v-else class="quiet">{{ t('home.noNotes') }}</p>
          </section>
          <section class="reminder-section">
            <header class="reminder-section-heading">
              <h3><Timer :size="15" />{{ t('home.countdowns') }}</h3>
              <button v-if="canOpen('countdown')" class="reminder-link" @click="emit('select', 'time', 'countdown')">{{ t('home.openCountdown') }}<ArrowUpRight :size="14" /></button>
            </header>
            <div v-if="pending.length" class="reminder-list">
              <button v-for="item in pending" :key="item.id" class="reminder-card countdown-card" :class="{ soon: item.target - now <= 3600000 }" @click="emit('select', 'time', 'countdown')">
                <span class="reminder-icon"><Timer :size="18" /></span>
                <span class="reminder-content">
                  <span class="countdown-heading"><strong>{{ item.title }}</strong><span class="countdown-remaining" :title="t('home.remaining')">{{ formatRemaining(item.target - now) }}</span></span>
                  <span class="reminder-meta">{{ t('home.dueAt', { date: deadlineFormat.format(item.target) }) }}</span>
                </span>
                <ArrowUpRight class="reminder-arrow" :size="15" />
              </button>
            </div>
            <p v-else class="quiet">{{ t('home.noCountdowns') }}</p>
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
.welcome-copy { min-width: 0; }
.welcome .welcome-activity { justify-self: start; }
.date {
  line-height: 20px;
  color: var(--text-3);
  font-size: 13px;
  margin: 0 0 12px;
}
h1 {
  font: 400 32px/1.35 var(--font-serif);
  margin: 0 0 10px;
}
.intro {
  color: var(--text-2);
  font-size: 14px;
  margin: 0 0 22px;
}
.library {
  display: grid;
  gap: 34px;
  min-width: 0;
}
.section-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 18px;
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
.tool-grid {
  --tool-card-height: 84px;
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
  gap: 6px;
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
}
.empty-library {
  display: grid;
  justify-items: start;
  gap: 12px;
  background: var(--bg-sunken);
  border-radius: var(--radius);
  padding: 24px;
  color: var(--text-3);
}
.empty-library p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
}
.reminders {
  min-width: 0;
}
.reminder-section + .reminder-section {
  margin-top: 26px;
}
.reminder-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 12px;
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
  padding: 18px;
  margin: 0;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--text-3);
  line-height: 1.8;
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
.calendar-icon {
  color: var(--accent);
  background: var(--accent-soft);
}
.reminder-content {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.reminder-content strong {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.reminder-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
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
.countdown-heading strong { flex: 1; min-width: 0; }
.countdown-remaining {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.countdown-card.soon {
  border-color: var(--accent);
}
.soon .countdown-remaining {
  color: var(--accent);
}
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
  .welcome { grid-template-columns: minmax(0, 1fr) 144px; gap: 20px; }
  .welcome-main { gap: 20px; }
  .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .home-columns { grid-template-columns: 1fr; }
  .tool-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .reminders { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; padding-top: 22px; border-top: 1px solid var(--border); }
  .reminders > .section-heading { grid-column: 1 / -1; margin-bottom: 0; }
  .reminder-section + .reminder-section { margin-top: 0; }
}
@media (max-width: 820px) {
  .welcome { grid-template-columns: minmax(0, 1fr) 128px; gap: 16px; }
  .welcome-main { display: contents; }
  .welcome-copy { grid-column: 1; grid-row: 1; }
  .welcome > .mascot-carousel { grid-column: 2; grid-row: 1; }
  .welcome-activity { grid-column: 1 / -1; grid-row: 2; }
}
@media (max-width: 720px) {
  .home-inner, .embedded .home-inner { padding: 12px 0 24px; }
  .welcome { padding-bottom: 20px; margin-bottom: 24px; }
  h1 { font-size: 25px; }
  .intro { font-size: 13px; margin-bottom: 16px; }
  .embedded { overflow: visible; }
}
@media (max-width: 620px) {
  .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .reminders { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .welcome { grid-template-columns: minmax(0, 1fr) 96px; gap: 14px; }
  .tool-grid { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
