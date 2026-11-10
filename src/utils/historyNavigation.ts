const DAY = '[data-history-anchor="day"]';
const HOUR = '[data-history-anchor="hour"]';

function hourInset(day: Element | null, gap: number) {
  return (day?.querySelector<HTMLElement>(".day-heading")?.offsetHeight ?? 0) + gap;
}

/** 等待日组展开再滚动，避免目标位置受折叠高度限制。 */
export async function scrollToHistoryHour(
  container: HTMLElement,
  target: HTMLElement,
  gap: number,
  isCurrent: () => boolean,
) {
  const day = target.closest(DAY);
  const panel = day?.querySelector(".history-fold");
  if (panel) await Promise.allSettled(panel.getAnimations().map((animation) => animation.finished));
  if (!isCurrent() || !target.isConnected) return false;

  container.scrollTo({
    top: container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - hourInset(day, gap),
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
  return true;
}

/** 找到滚动视口顶部的日期或小时，跳过已折叠的小时。 */
export function activeHistoryLocation(container: HTMLElement, gap: number) {
  const top = container.getBoundingClientRect().top;
  const anchors = container.querySelectorAll<HTMLElement>(`${DAY}, ${HOUR}`);
  let current = anchors[0]?.id ?? "";
  for (const anchor of anchors) {
    if (anchor.closest(".history-fold[inert]")) continue;
    const inset = anchor.matches(HOUR) ? hourInset(anchor.closest(DAY), gap) : 0;
    if (anchor.getBoundingClientRect().top > top + inset + 2) break;
    current = anchor.id;
  }
  return current;
}
