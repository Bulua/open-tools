export type ToolActivity = Record<string, number>;

/** 按本地日历日期统计，避免 UTC 时差将使用次数计入另一天。 */
export function activityDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function normalizeActivity(value: unknown): ToolActivity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, count]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isSafeInteger(count) || count <= 0) return false;
    const date = new Date(`${key}T12:00:00`);
    return Number.isFinite(date.getTime()) && activityDateKey(date) === key;
  }));
}

export function activityLevel(count: number): number {
  return count <= 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4;
}

/** 最近六个自然月（含本月）的本地日历日，按周日到周六排列，首尾留出占位格。 */
export function activityCalendar(activity: ToolActivity, today = new Date()) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const start = new Date(end.getFullYear(), end.getMonth() - 5, 1, 12);
  const dayCount = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
    - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000) + 1;
  const offset = start.getDay();
  const length = Math.ceil((dayCount + offset) / 7) * 7;
  return Array.from({ length }, (_, index) => {
    const dayIndex = index - offset;
    if (dayIndex < 0 || dayIndex >= dayCount) return null;
    const date = new Date(start);
    date.setDate(date.getDate() + dayIndex);
    const key = activityDateKey(date);
    const count = activity[key] ?? 0;
    return { key, date, count, level: activityLevel(count) };
  });
}
