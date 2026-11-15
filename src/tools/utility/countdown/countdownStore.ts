import { ref, watch } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import { nextOccurrence, type CountdownItem } from "./countdown";

/**
 * 倒计时数据与到期提醒，整个程序共用一份：
 * - 保存在本地，关闭程序后仍然保留，直到用户删除。桌面版存在数据文件夹（安装目录下的 data）里，
 *   程序更新、卸载时都不会删除；浏览器中存在 localStorage
 * - 程序启动后每秒检查一次，不打开倒计时工具也会提醒；程序关闭期间到期的，下次打开时提醒
 */
export const countdowns = ref<CountdownItem[]>([]);

/** 浏览器中、以及旧版本桌面版保存数据的位置 */
const WEB_KEY = "countdowns";

function readLocal(): CountdownItem[] {
  try {
    return JSON.parse(localStorage.getItem(WEB_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function keepInLocal() {
  watch(
    countdowns,
    (v) => {
      try {
        localStorage.setItem(WEB_KEY, JSON.stringify(v));
      } catch {
        // 写入失败不影响使用
      }
    },
    { deep: true },
  );
}

/** 读取保存的倒计时，之后有改动时自动保存；旧版本存在 localStorage 里的，第一次运行时搬进文件 */
async function load() {
  const local = readLocal();
  if (!isTauri()) {
    countdowns.value = local;
    keepInLocal();
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  let data: string | null;
  try {
    data = await invoke<string | null>("countdown_read");
    countdowns.value = data === null ? local : JSON.parse(data);
  } catch (e) {
    // 文件读不了或内容损坏时退回 localStorage，不覆盖原文件
    console.error(e);
    countdowns.value = local;
    keepInLocal();
    return;
  }
  const save = (v: CountdownItem[]) => invoke("countdown_write", { data: JSON.stringify(v) }).catch(console.error);
  if (data === null && local.length) save(local);
  watch(countdowns, save, { deep: true });
}
export const now = ref(Date.now());
/** 刚到期、等待用户确认的提醒 */
export const alerts = ref<{ id: string; title: string; target: number }[]>([]);

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function addCountdown(item: Omit<CountdownItem, "id" | "createdAt" | "done">) {
  countdowns.value = [...countdowns.value, { ...item, id: newId(), createdAt: Date.now(), done: false }];
}

export function removeCountdown(id: string) {
  countdowns.value = countdowns.value.filter((c) => c.id !== id);
  alerts.value = alerts.value.filter((a) => a.id !== id);
}

export function updateCountdown(id: string, patch: Partial<CountdownItem>) {
  countdowns.value = countdowns.value.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

export function togglePause(item: CountdownItem) {
  if (item.pausedRemaining !== undefined) updateCountdown(item.id, { target: Date.now() + item.pausedRemaining, pausedRemaining: undefined });
  else updateCountdown(item.id, { pausedRemaining: Math.max(0, item.target - Date.now()) });
}

/** 计时器重新开始 */
export function restart(item: CountdownItem) {
  if (!item.duration) return;
  updateCountdown(item.id, { target: Date.now() + item.duration, createdAt: Date.now(), pausedRemaining: undefined, done: false });
  alerts.value = alerts.value.filter((a) => a.id !== item.id);
}

export const dismissAlert = (id: string) => (alerts.value = alerts.value.filter((a) => a.id !== id));

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
  if (!isTauri()) return;
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
  const due = countdowns.value.filter((c) => !c.done && c.pausedRemaining === undefined && c.target <= now.value);
  if (!due.length) return;
  for (const c of due) {
    alerts.value = [...alerts.value.filter((a) => a.id !== c.id), { id: c.id, title: c.title, target: c.target }];
    // 重复的倒计时直接排到下一次；不重复的标记为已到期，保留到用户删除
    if (c.repeat !== "none") updateCountdown(c.id, { target: nextOccurrence(c.target, c.repeat, now.value) });
    else updateCountdown(c.id, { done: true });
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
  check();
  setInterval(check, 1000);
}
