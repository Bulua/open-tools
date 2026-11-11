/** 只滚动日历列表，避免 scrollIntoView 同时改变外层工作区的位置。 */
export function centerCalendarDay(panel: HTMLElement, day: HTMLElement): boolean {
  if (!panel.isConnected || !panel.clientHeight) return false;
  const target = day.getBoundingClientRect();
  if (!target.height) return false;
  const viewport = panel.getBoundingClientRect();
  panel.scrollTop = Math.max(0, panel.scrollTop + target.top - viewport.top - panel.clientTop
    - (panel.clientHeight - target.height) / 2);
  return true;
}
