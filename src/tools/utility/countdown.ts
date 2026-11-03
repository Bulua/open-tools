/**
 * 倒计时的纯计算：剩余时间拆分、重复提醒的下一次时间。
 */
import { t } from "@/locales";

export type Repeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

/** 重复方式，名称见文案 utility.repeatNone 等 */
export const REPEATS: { value: Repeat; label: string }[] = [
  { value: "none", label: "repeatNone" },
  { value: "daily", label: "repeatDaily" },
  { value: "weekly", label: "repeatWeekly" },
  { value: "monthly", label: "repeatMonthly" },
  { value: "yearly", label: "repeatYearly" },
];

export interface CountdownItem {
  id: string;
  title: string;
  /** 到期时刻（毫秒时间戳） */
  target: number;
  createdAt: number;
  /** 计时器的总时长（毫秒）；到指定时间的倒计时没有 */
  duration?: number;
  /** 暂停时剩余的毫秒数 */
  pausedRemaining?: number;
  repeat: Repeat;
  /** 已经提醒过 */
  done: boolean;
}

export interface Remaining {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function splitRemaining(ms: number): Remaining {
  const total = Math.max(0, ms);
  const s = Math.ceil(total / 1000);
  return { total, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 剩余时间显示为「3 天 04:05:06」或「04:05」 */
export function formatRemaining(ms: number): string {
  const r = splitRemaining(ms);
  const clock = r.hours || r.days ? `${pad(r.hours)}:${pad(r.minutes)}:${pad(r.seconds)}` : `${pad(r.minutes)}:${pad(r.seconds)}`;
  return r.days ? t("utility.daysClock", { n: r.days, clock }) : clock;
}

/** 重复的倒计时到期后，下一次到期的时刻（晚于 now） */
export function nextOccurrence(target: number, repeat: Repeat, now: number): number {
  if (repeat === "none") return target;
  let d = new Date(target);
  const day = d.getDate();
  for (let i = 0; d.getTime() <= now && i < 100000; i++) {
    if (repeat === "daily") d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, d.getHours(), d.getMinutes(), d.getSeconds());
    else if (repeat === "weekly") d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, d.getHours(), d.getMinutes(), d.getSeconds());
    else {
      // 每月 / 每年：保持原来的日期，遇到 31 日、2 月 29 日这类不存在的日期取当月最后一天
      const months = repeat === "monthly" ? 1 : 12;
      const y = d.getFullYear();
      const m = d.getMonth() + months;
      const last = new Date(y, m + 1, 0).getDate();
      d = new Date(y, m, Math.min(day, last), d.getHours(), d.getMinutes(), d.getSeconds());
    }
  }
  return d.getTime();
}

/** 当前剩余毫秒数（暂停时固定不变） */
export const remainingOf = (item: CountdownItem, now: number) => item.pausedRemaining ?? item.target - now;

/** 计时器的进度（0～1），到指定时间的倒计时按创建时间计算 */
export function progressOf(item: CountdownItem, now: number): number {
  const total = item.duration ?? item.target - item.createdAt;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remainingOf(item, now) / total));
}

/** 时长输入 → 毫秒 */
export const toMs = (h: number, m: number, s: number) => ((h || 0) * 3600 + (m || 0) * 60 + (s || 0)) * 1000;
