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

it("时间目录和右侧截图可以独立折叠，且不影响其他日期", async () => {
  const container = await mountHistory();
  expect(container.querySelectorAll(".directory-date")).toHaveLength(2);
  expect(container.querySelectorAll(".directory-hour")).toHaveLength(3);
  expect(container.querySelector(".history-day-toggle small")?.textContent).toBe("2 张");
  const date = container.querySelector<HTMLButtonElement>(".directory-date")!;
  const toggle = container.querySelector<HTMLButtonElement>(".history-day-toggle")!;
  date.click();
  await nextTick();
  expect(date.getAttribute("aria-expanded")).toBe("false");
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(container.querySelector("#screenshot-2026-11-09-directory")?.hasAttribute("inert")).toBe(true);

  toggle.click();
  await nextTick();
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(container.querySelector("#screenshot-2026-11-09-content")?.hasAttribute("inert")).toBe(true);
  expect(container.querySelector("#screenshot-2026-11-08-content")?.hasAttribute("inert")).toBe(false);
  date.click();
  await nextTick();
  expect(date.getAttribute("aria-expanded")).toBe("true");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
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
  const panel = container.querySelector<HTMLElement>("#screenshot-2026-11-09-content")!;
  let finish!: () => void;
  const finished = new Promise<Animation>((resolve) => { finish = () => resolve({} as Animation); });
  panel.getAnimations = () => [{ finished } as Animation];
  vi.spyOn(heading, "offsetHeight", "get").mockReturnValue(36);
  container.querySelector<HTMLButtonElement>(".history-day-toggle")!.click();
  await nextTick();
  const link = container.querySelectorAll<HTMLButtonElement>(".directory-hour")[1];
  link.click();
  await nextTick();
  expect(panel.hasAttribute("inert")).toBe(false);
  expect(scrollTo).not.toHaveBeenCalled();
  finish();
  await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 304, behavior: "smooth" }));
  expect(link.getAttribute("aria-current")).toBe("location");
  const date = container.querySelector<HTMLButtonElement>(".directory-date")!;
  date.click();
  await nextTick();
  expect(date.getAttribute("aria-expanded")).toBe("false");
  expect(panel.hasAttribute("inert")).toBe(false);
  expect(scrollTo).toHaveBeenCalledTimes(1);
});

it("收到截图保存事件后更新目录与数量，并保留已有日期的折叠状态", async () => {
  const container = await mountHistory();
  container.querySelector<HTMLButtonElement>(".history-day-toggle")!.click();
  container.querySelector<HTMLButtonElement>(".directory-date")!.click();
  await nextTick();
  state.items.unshift({ id: "d", name: "d.png", createdAt: "2026-11-09T16:00:00", day: "2026-11-09", hour: "16" });
  state.saved!();
  await vi.waitFor(() => expect(container.querySelectorAll(".directory-hour")).toHaveLength(4));
  expect(container.querySelector(".history-day-toggle small")?.textContent).toBe("3 张");
  expect(container.querySelector("#screenshot-2026-11-09-content")?.hasAttribute("inert")).toBe(true);
  expect(container.querySelector("#screenshot-2026-11-09-directory")?.hasAttribute("inert")).toBe(true);
});
