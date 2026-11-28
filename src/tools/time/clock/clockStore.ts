import { ref } from "vue";
import { clockApi } from "@/api/clock";
import { locale, t } from "@/locales";
import { formatNowDateTime } from "@/utils/datetime";
import { notifyDesktop } from "@/utils/desktopNotification";
import { showError } from "@/utils/errorToast";
import { nextAlarmTarget, type AlarmSchedule } from "./alarm";
import { countdownTitle, nextOccurrence, type CountdownItem } from "./reminders";

/**
 * 闹钟与计时器状态管理（统一经由 SQLite 持久化）：
 * - 所有新增条目的雪花主键与 `createdAt` / `updatedAt` 均由 Rust 后端生成并返回；
 * - 程序启动后每秒检查一次到期项，不打开时钟工具也会提醒。
 */
export const countdowns = ref<CountdownItem[]>([]);
export const countdownsReady = ref(false);
export const now = ref(Date.now());
/** 刚到期、等待用户确认的提醒 */
export const alerts = ref<Pick<CountdownItem, "id" | "title" | "target" | "duration" | "defaultTitle" | "alarm">[]>([]);

let writes: Promise<void> = Promise.resolve();

function applyBackendList(next: CountdownItem[]) {
  countdowns.value = next;
  now.value = Date.now();
  const activeIds = new Set(next.map((item) => item.id));
  alerts.value = alerts.value.filter((a) => {
    if (!activeIds.has(a.id)) return false;
    const item = next.find((x) => x.id === a.id);
    return !!item && item.enabled !== false && (item.done || item.target <= now.value);
  });
}

function enqueueWrite(task: () => Promise<CountdownItem[]>) {
  writes = writes
    .then(async () => {
      const next = await task();
      applyBackendList(next);
    })
    .catch(showError);
  return writes;
}

async function load() {
  try {
    applyBackendList(await clockApi.list());
  } catch (error) {
    showError(error);
  }

  void clockApi
    .onChanged(async () => {
      await writes;
      try {
        applyBackendList(await clockApi.list());
      } catch (error) {
        showError(error);
      }
    })
    .catch(() => {});
}

export function addCountdown(item: Omit<CountdownItem, "id" | "createdAt" | "done">) {
  const payload: CountdownItem = {
    ...item,
    id: "",
    createdAt: formatNowDateTime(),
    done: false,
  };
  void enqueueWrite(() => clockApi.upsert(payload));
}

export function removeCountdown(id: string) {
  countdowns.value = countdowns.value.filter((c) => c.id !== id);
  alerts.value = alerts.value.filter((a) => a.id !== id);
  if (!id) return;
  void enqueueWrite(() => clockApi.remove(id));
}

export function updateCountdown(id: string, patch: Partial<CountdownItem>) {
  const current = countdowns.value.find((c) => c.id === id);
  if (!current) return;
  const updated: CountdownItem = { ...current, ...patch };
  countdowns.value = countdowns.value.map((c) => (c.id === id ? updated : c));
  if (!id) return;
  void enqueueWrite(() => clockApi.upsert(updated));
}

export function saveAlarm(schedule: AlarmSchedule, title: string, id?: string) {
  const patch = {
    alarm: { time: schedule.time, weekdays: [...new Set(schedule.weekdays)] },
    title,
    target: nextAlarmTarget(schedule, Date.now()),
    repeat: "none" as const,
    done: false,
    enabled: true,
  };
  if (id) {
    updateCountdown(id, patch);
    dismissAlert(id);
  } else {
    addCountdown(patch);
  }
}

export function toggleAlarm(item: CountdownItem) {
  if (!item.alarm) return;
  const enabled = item.enabled === false || item.done;
  updateCountdown(
    item.id,
    enabled
      ? { enabled: true, done: false, target: nextAlarmTarget(item.alarm, Date.now()) }
      : { enabled: false },
  );
  dismissAlert(item.id);
}

export function togglePause(item: CountdownItem) {
  if (item.pausedRemaining !== undefined) {
    updateCountdown(item.id, {
      target: Date.now() + item.pausedRemaining,
      pausedRemaining: undefined,
    });
  } else {
    updateCountdown(item.id, { pausedRemaining: Math.max(0, item.target - Date.now()) });
  }
}

/** 计时器重新开始 */
export function restart(item: CountdownItem) {
  if (!item.duration) return;
  updateCountdown(item.id, {
    target: Date.now() + item.duration,
    pausedRemaining: undefined,
    done: false,
  });
  alerts.value = alerts.value.filter((a) => a.id !== item.id);
}

export const dismissAlert = (id: string) => {
  alerts.value = alerts.value.filter((a) => a.id !== id);
};

// ---------- 提醒 ----------

/** 用 Web Audio 播放三声提示音，不需要音频文件 */
function beep() {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.3);
    }
    setTimeout(() => ctx.close(), 1500);
  } catch {
    // 不能播放声音时只显示提醒
  }
}

/** 窗口隐藏在托盘或最小化时，把它显示出来 */
async function bringToFront() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.show();
    await win.unminimize();
    await win.setFocus();
  } catch {
    // 没有权限或窗口不可用时忽略
  }
}

function check() {
  now.value = Date.now();
  const due = countdowns.value.filter(
    (c) => c.enabled !== false && !c.done && c.pausedRemaining === undefined && c.target <= now.value,
  );
  if (!due.length) return;
  for (const c of due) {
    alerts.value = [
      ...alerts.value.filter((a) => a.id !== c.id),
      {
        id: c.id,
        title: c.title,
        target: c.target,
        duration: c.duration,
        defaultTitle: c.defaultTitle,
        alarm: c.alarm,
      },
    ];
    // 重复的倒计时直接排到下一次；不重复的标记为已到期，保留到用户删除
    if (c.alarm) {
      updateCountdown(
        c.id,
        c.alarm.weekdays.length
          ? { target: nextAlarmTarget(c.alarm, now.value) }
          : { done: true, enabled: false },
      );
    } else if (c.repeat !== "none") {
      updateCountdown(c.id, { target: nextOccurrence(c.target, c.repeat, now.value) });
    } else {
      updateCountdown(c.id, { done: true });
    }
    const time = new Intl.DateTimeFormat(locale.value, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(c.target);
    void notifyDesktop(
      t("clock.notificationTitle"),
      t("clock.notificationBody", { time, label: countdownTitle(c) || t("clock.alarm") }),
    ).catch((error) => showError(error, t("clock.notificationFailed")));
  }
  beep();
  bringToFront();
}

let started = false;
/** 程序启动时调用一次；读取完保存的数据后才开始检查 */
export async function startCountdownTicker() {
  if (started) return;
  started = true;
  await load();
  countdownsReady.value = true;
  check();
  setInterval(check, 1000);
}
