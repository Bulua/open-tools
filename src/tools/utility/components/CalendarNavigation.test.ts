// @vitest-environment jsdom
import { createApp, h, KeepAlive, nextTick, ref } from "vue";
import { expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import CalendarTool from "./CalendarTool.vue";

vi.mock("../calendarStore", async () => {
  const { ref } = await import("vue");
  return {
    calendarDesktop: false, calendarNotes: ref({}), calendarNotesReady: ref(true), calendarReminders: ref(true),
    loadCalendarNotes: vi.fn().mockResolvedValue(undefined), saveCalendarNote: vi.fn().mockResolvedValue(undefined),
  };
});

it("首次打开居中定位当天，从缓存再次打开时更新日期并重新定位", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 11, 23, 59));
  const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  const scrolled: { date: string | null; options?: ScrollIntoViewOptions | boolean }[] = [];
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: function (this: Element, options?: ScrollIntoViewOptions | boolean) {
      scrolled.push({ date: this.getAttribute("data-date"), options });
    },
  });
  const visible = ref(true);
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp(() => h(KeepAlive, () => visible.value ? h(CalendarTool) : null)).use(i18n);
  try {
    app.mount(root);
    await nextTick();
    await vi.advanceTimersByTimeAsync(20);
    expect(scrolled[scrolled.length - 1]).toEqual({
      date: String(Date.UTC(2026, 10, 11)), options: { block: "center", inline: "nearest" },
    });
    visible.value = false;
    await nextTick();
    vi.setSystemTime(new Date(2026, 10, 12, 0, 1));
    visible.value = true;
    await nextTick();
    await vi.advanceTimersByTimeAsync(20);
    expect(scrolled[scrolled.length - 1].date).toBe(String(Date.UTC(2026, 10, 12)));
    const today = root.querySelector('[aria-current="date"]');
    expect(today?.getAttribute("data-date")).toBe(String(Date.UTC(2026, 10, 12)));
    expect(today?.getAttribute("aria-pressed")).toBe("true");
  } finally {
    app.unmount();
    root.remove();
    if (original) Object.defineProperty(Element.prototype, "scrollIntoView", original);
    else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    vi.useRealTimers();
  }
});
