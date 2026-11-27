/**
 * 倒计时的纯计算：剩余时间拆分、重复提醒的下一次时间。
 */
import { i18n, locale, LOCALES, t, type Locale } from "@/locales";
import type { CountdownItem, Repeat } from "@/types/clock";
import { parseDateTimeMillis } from "@/utils/datetime";
import type { AlarmSchedule } from "./alarm";

export type { CountdownItem, Repeat };

// 与 locales 入口一致，收窄翻译函数类型，避免全量文案的递归类型推导。
const translateIn = (i18n.global as unknown as {
  t: (key: string, named: Record<string, unknown>, options: { locale: Locale }) => string;
}).t;

/** 重复方式，名称见文案 utility.repeatNone 等 */
export const REPEATS: { value: Repeat; label: string }[] = [
  { value: "none", label: "repeatNone" },
  { value: "daily", label: "repeatDaily" },
  { value: "weekly", label: "repeatWeekly" },
  { value: "monthly", label: "repeatMonthly" },
  { value: "yearly", label: "repeatYearly" },
];

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
export function formatRemaining(ms: number, language: Locale = locale.value): string {
  const r = splitRemaining(ms);
  const clock = r.hours || r.days ? `${pad(r.hours)}:${pad(r.minutes)}:${pad(r.seconds)}` : `${pad(r.minutes)}:${pad(r.seconds)}`;
  return r.days ? translateIn("utility.daysClock", { n: r.days, clock }, { locale: language }) : clock;
}

/** 默认名称按当前语言生成；旧数据仅在名称与原始时长的完整默认文案一致时兼容。 */
export function countdownTitle(item: Pick<CountdownItem, "title" | "defaultTitle" | "duration" | "alarm">): string {
  if (item.alarm || !item.duration) return item.title;
  const isDefault = item.defaultTitle ?? (!item.title || LOCALES.some(({ value }) =>
    item.title === translateIn("utility.timerName", { time: formatRemaining(item.duration!, value) }, { locale: value })));
  return isDefault ? t("utility.timerName", { time: formatRemaining(item.duration) }) : item.title;
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
  const total = item.duration ?? item.target - parseDateTimeMillis(item.createdAt);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remainingOf(item, now) / total));
}

/** 时长输入 → 毫秒 */
export const toMs = (h: number, m: number, s: number) => ((h || 0) * 3600 + (m || 0) * 60 + (s || 0)) * 1000;
