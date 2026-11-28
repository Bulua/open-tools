import { computed, ref, watch } from "vue";
import { calendarApi } from "@/api/calendar";
import { locale, t } from "@/locales";
import { useStoredRef } from "@/composables/useStoredRef";
import { showError } from "@/utils/errorToast";
import {
  calendarDateKey,
  calendarFestivals,
  calendarNoteOccursOn,
  calendarReminderSecond,
  calendarRemindersOn,
  calendarReminderTargetDate,
  localCalendarDate,
  type CalendarNote,
  type CalendarNotes,
} from "./calendar";

const notes = ref<CalendarNotes>({});
export const calendarNotes = computed(() => notes.value);
export const calendarNotesReady = ref(false);
export const calendarReminders = useStoredRef("calendar.reminders", true);
const sent = useStoredRef<{ date: string; ids: string[] }>("calendar.sent", { date: "", ids: [] });

let loading: Promise<void> | undefined;
let writing: Promise<void> = Promise.resolve();

export function loadCalendarNotes() {
  loading ??= (async () => {
    const records = await calendarApi.listNotes();
    const map: CalendarNotes = {};
    for (const item of records) {
      map[item.date] = {
        text: item.text,
        annual: item.annual,
        ...(item.reminderAt ? { reminderAt: item.reminderAt } : {}),
      };
    }
    notes.value = map;
    calendarNotesReady.value = true;
  })().catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

export function saveCalendarNote(date: string, note: CalendarNote | null) {
  // 桌面和窄屏布局切换时可能有前一笔保存仍在进行，按提交顺序写入。
  const save = writing.then(async () => {
    await loadCalendarNotes();
    const next = { ...notes.value };
    if (note) {
      const saved = await calendarApi.upsertNote({
        date,
        text: note.text,
        annual: note.annual,
        reminderAt: note.reminderAt ?? null,
      });
      next[saved.date] = {
        text: saved.text,
        annual: saved.annual,
        ...(saved.reminderAt ? { reminderAt: saved.reminderAt } : {}),
      };
    } else {
      await calendarApi.deleteNote(date);
      delete next[date];
    }
    notes.value = next;
  });
  writing = save.catch(() => {});
  return save;
}

const maxWait = 30_000;
let reminderFailed = false;
const reminderDate = ref(localCalendarDate());
const reminderEntries = computed(() => {
  const date = reminderDate.value;
  const dateKey = calendarDateKey(date);
  return [
    ...calendarFestivals(date).map((key) => ({ id: `festival:${key}`, text: t(`utility.calendar.${key}`), second: 0 })),
    ...calendarRemindersOn(notes.value, dateKey).map(([key, note]) => {
      const isCrossDay = !calendarNoteOccursOn(key, note, dateKey);
      const targetDate = isCrossDay ? calendarReminderTargetDate(key, note, dateKey) : "";
      return {
        id: note.reminderAt ? `note:${key}:${note.reminderAt}` : `note:${key}`,
        text: isCrossDay ? `${targetDate} · ${note.text}` : note.text,
        second: calendarReminderSecond(note.reminderAt),
      };
    }),
  ];
});

async function checkCalendarReminders() {
  try {
    await loadCalendarNotes();
    const now = new Date();
    const today = localCalendarDate(now);
    if (+today !== +reminderDate.value) reminderDate.value = today;
    const date = calendarDateKey(today);
    const alreadySent = sent.value.date === date ? sent.value.ids : [];
    const second = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const pending = reminderEntries.value.filter(({ id }) => !alreadySent.includes(id));
    const due = pending.filter((entry) => entry.second <= second);
    if (due.length && calendarReminders.value) {
      const dateLabel = new Intl.DateTimeFormat(locale.value, { dateStyle: "full", timeZone: "UTC" }).format(today);
      const lines = due.slice(0, 4).map(({ text }) => text);
      if (due.length > lines.length) lines.push(t("utility.calendar.moreReminders", { count: due.length - lines.length }));
      await calendarApi.notify(t("utility.calendar.reminderTitle"), [dateLabel, ...lines].join("\n"));
      sent.value = { date, ids: [...alreadySent, ...due.map(({ id }) => id)] };
    }
    reminderFailed = false;
    // 到下一条提醒或午夜时检查，空闲时定期检查系统时间是否变化。
    const nextSecond = pending.reduce((next, entry) => entry.second > second ? Math.min(next, entry.second) : next, 86400);
    const deadline = now.getTime() - now.getMilliseconds() + (nextSecond - second) * 1000;
    return Math.min(maxWait, Math.max(1, deadline - Date.now()));
  } catch (error) {
    if (!reminderFailed) showError(error, t("utility.calendar.reminderFailed"));
    reminderFailed = true;
    return maxWait;
  }
}

export function startCalendarReminders() {
  let running = true;
  let waiting = false;
  let revision = 0;
  async function tick() {
    if (waiting) return;
    waiting = true;
    try {
      while (running && calendarReminders.value) {
        const delayMs = await checkCalendarReminders();
        if (!running || !calendarReminders.value) return;
        try {
          revision = await calendarApi.wait(delayMs, revision);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 1000)));
        }
      }
    } finally {
      waiting = false;
    }
  }
  function reschedule() {
    if (waiting) void calendarApi.wake().catch(() => {});
    else if (calendarReminders.value) void tick();
  }
  const stopWatching = watch([calendarReminders, notes], reschedule, { immediate: true });
  window.addEventListener("focus", reschedule);
  return () => {
    running = false;
    stopWatching();
    window.removeEventListener("focus", reschedule);
    if (waiting) void calendarApi.wake().catch(() => {});
  };
}
