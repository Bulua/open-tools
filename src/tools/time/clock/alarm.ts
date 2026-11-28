import type { AlarmSchedule } from "@/types/clock";

export type { AlarmSchedule };

/** 使用本地日历构造下次提醒，跨天时不按固定 24 小时累加。 */
export function nextAlarmTarget(schedule: AlarmSchedule, now: number): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) throw new Error("Invalid alarm time");
  const [hours, minutes] = schedule.time.split(":").map(Number);
  const today = new Date(now);
  for (let offset = 0; offset <= 7; offset++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, hours, minutes);
    if (date.getTime() > now && (!schedule.weekdays.length || schedule.weekdays.includes(date.getDay()))) return date.getTime();
  }
  throw new Error("Invalid alarm weekdays");
}
