// @vitest-environment jsdom
import { createApp, nextTick } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import ScreenshotHistory from "./ScreenshotHistory.vue";
import type { ScreenshotItem } from "../screenshot";

const state = vi.hoisted(() => ({
  items: [] as ScreenshotItem[],
  saved: undefined as (() => void) | undefined,
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: vi.fn(async (command: string) => command === "screenshot_list" ? [...state.items] : ""),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, callback: () => void) => {
    state.saved = callback;
    return () => { state.saved = undefined; };
  }),
}));

let cleanup: (() => void) | undefined;
beforeEach(() => {
  state.items = [
    { id: "a", name: "a.png", createdAt: "2026-11-09T14:30:00", day: "2026-11-09", hour: "14" },
    { id: "b", name: "b.png", createdAt: "2026-11-09T09:10:00", day: "2026-11-09", hour: "09" },
    { id: "c", name: "c.png", createdAt: "2026-11-08T10:00:00", day: "2026-11-08", hour: "10" },
  ];
});
afterEach(() => { cleanup?.(); vi.restoreAllMocks(); });

async function mountHistory() {
  const container = document.createElement("div");
  document.body.append(container);
  const app = createApp(ScreenshotHistory).use(i18n);
  cleanup = () => { app.unmount(); container.remove(); };
  app.mount(container);
  await vi.waitFor(() => expect(container.querySelectorAll(".shot-card")).toHaveLength(3));
  return container;
}

it("时间目录按日期和小时列出截图，按天折叠时不影响其他日期", async () => {
  const container = await mountHistory();
  expect(container.querySelectorAll(".directory-date")).toHaveLength(2);
  expect(container.querySelectorAll(".directory-hour")).toHaveLength(3);
  expect(container.querySelector(".day-toggle small")?.textContent).toBe("2 张");
  const toggle = container.querySelector<HTMLButtonElement>(".day-toggle")!;
  toggle.click();
  await nextTick();
  const days = container.querySelectorAll<HTMLElement>(".day-content");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(days[0].hidden).toBe(true);
  expect(days[1].hidden).toBe(false);
  toggle.click();
  await nextTick();
  expect(days[0].hidden).toBe(false);
});

it("点击小时目录自动展开当天，只滚动截图面板并为日期标题留出空间", async () => {
  const container = await mountHistory();
  const scroll = container.querySelector<HTMLElement>(".history-scroll")!;
  const scrollTo = vi.fn();
  scroll.scrollTo = scrollTo;
  vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue({ top: 100 } as DOMRect);
  scroll.scrollTop = 50;
  const target = container.querySelector<HTMLElement>('[id="screenshot-2026-11-09-09"]')!;
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 400 } as DOMRect);
  const heading = container.querySelector<HTMLElement>(".day-heading")!;
  vi.spyOn(heading, "offsetHeight", "get").mockReturnValue(36);
  container.querySelector<HTMLButtonElement>(".day-toggle")!.click();
  await nextTick();
  const link = container.querySelectorAll<HTMLButtonElement>(".directory-hour")[1];
  link.click();
  await nextTick();
  expect(container.querySelector<HTMLElement>(".day-content")!.hidden).toBe(false);
  expect(scrollTo).toHaveBeenCalledWith({ top: 304, behavior: "smooth" });
  await vi.waitFor(() => expect(link.getAttribute("aria-current")).toBe("location"));
  const date = container.querySelector<HTMLButtonElement>(".directory-date")!;
  date.click();
  await nextTick();
  await vi.waitFor(() => expect(date.getAttribute("aria-current")).toBe("location"));
  expect(scrollTo).toHaveBeenCalledTimes(2);
});

it("收到截图保存事件后更新目录与数量，并保留已有日期的折叠状态", async () => {
  const container = await mountHistory();
  container.querySelector<HTMLButtonElement>(".day-toggle")!.click();
  await nextTick();
  state.items.unshift({ id: "d", name: "d.png", createdAt: "2026-11-09T16:00:00", day: "2026-11-09", hour: "16" });
  state.saved!();
  await vi.waitFor(() => expect(container.querySelectorAll(".directory-hour")).toHaveLength(4));
  expect(container.querySelector(".day-toggle small")?.textContent).toBe("3 张");
  expect(container.querySelector<HTMLElement>(".day-content")!.hidden).toBe(true);
});
