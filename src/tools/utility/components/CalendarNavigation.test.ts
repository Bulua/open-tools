// @vitest-environment jsdom
import { createApp, defineAsyncComponent, defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import CalendarTool from "./CalendarTool.vue";

vi.mock("../calendarStore", async () => {
  const { ref } = await import("vue");
  return {
    calendarDesktop: false, calendarNotes: ref({}), calendarNotesReady: ref(true), calendarReminders: ref(true),
    loadCalendarNotes: vi.fn().mockResolvedValue(undefined), saveCalendarNote: vi.fn().mockResolvedValue(undefined),
  };
});

let dispose = () => {};
afterEach(() => { dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function mountCalendar(height: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 11, 23, 59));
  const layout = { height, targetOffset: 1200 };
  const centeredDates: string[] = [];
  const observers: { elements: Element[]; disconnect: ReturnType<typeof vi.fn>; notify: () => void }[] = [];
  vi.stubGlobal("ResizeObserver", class {
    elements: Element[] = [];
    disconnect = vi.fn();
    constructor(private callback: ResizeObserverCallback) { observers.push(this); }
    observe(element: Element) { this.elements.push(element); }
    notify() { this.callback([], this as unknown as ResizeObserver); }
  });
  const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() { return this.classList.contains("year-list") ? layout.height : 0; },
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.classList.contains("year-list")) return new DOMRect(0, 100, 800, layout.height);
    const date = this.getAttribute("data-date");
    if (date) {
      centeredDates.push(date);
      const panel = this.closest<HTMLElement>(".year-list")!;
      return new DOMRect(0, 100 + layout.targetOffset - panel.scrollTop, 40, 44);
    }
    return new DOMRect();
  });
  const home = ref(false);
  const root = document.createElement("div");
  document.body.append(root);
  // 与真实入口一致：缓存的是外层工具视图，日历是内部按需加载的组件。
  const AsyncCalendar = defineAsyncComponent(() => Promise.resolve(CalendarTool));
  const ToolView = defineComponent({ setup: () => () => h("main", [h(AsyncCalendar)]) });
  const app = createApp(() => h(KeepAlive, () => home.value ? h("div", "主页") : h(ToolView))).use(i18n);
  dispose = () => {
    app.unmount();
    root.remove();
    if (originalHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalHeight);
    else Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  };
  app.mount(root);
  const settle = async () => { await nextTick(); await vi.advanceTimersByTimeAsync(40); await nextTick(); };
  await settle();
  const panel = root.querySelector<HTMLElement>(".year-list")!;
  const observer = () => {
    const matches = observers.filter((item) => item.elements.includes(panel));
    return matches[matches.length - 1];
  };
  return { root, home, panel, layout, centeredDates, observer, settle };
}

it("异步打开时布局尚未就绪，容器获得高度后再将当天实际滚动到中央", async () => {
  const { panel, layout, centeredDates, observer, settle } = await mountCalendar(0);
  expect(panel.scrollTop).toBe(0);
  layout.height = 400;
  observer().notify();
  await settle();
  expect(centeredDates[centeredDates.length - 1]).toBe(String(Date.UTC(2026, 10, 11)));
  expect(panel.scrollTop).toBe(1022);
});

it("侧栏展开导致月历重新排列后校正位置，用户手动浏览后停止校正", async () => {
  const { panel, layout, observer, settle } = await mountCalendar(400);
  expect(panel.scrollTop).toBe(1022);
  layout.targetOffset = 2100;
  observer().notify();
  await settle();
  expect(panel.scrollTop).toBe(1922);
  panel.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 100 }));
  expect(observer().disconnect).toHaveBeenCalled();
  panel.scrollTop = 200;
  layout.targetOffset = 2400;
  observer().notify();
  await settle();
  expect(panel.scrollTop).toBe(200);
});

it("从主页再次进入缓存的日历时更新跨年日期，并重新定位实际滚动位置", async () => {
  const { root, home, panel, layout, observer, settle } = await mountCalendar(400);
  home.value = true;
  await settle();
  expect(observer().disconnect).toHaveBeenCalled();
  vi.setSystemTime(new Date(2027, 0, 1, 0, 1));
  layout.targetOffset = 1800;
  home.value = false;
  await settle();
  expect(root.querySelector(".year-list")).toBe(panel);
  expect(panel.scrollTop).toBe(1622);
  const today = root.querySelector('[aria-current="date"]');
  expect(today?.getAttribute("data-date")).toBe(String(Date.UTC(2027, 0, 1)));
  expect(today?.getAttribute("aria-pressed")).toBe("true");
  expect(root.querySelector('[data-year="2028"]')).not.toBeNull();
});
