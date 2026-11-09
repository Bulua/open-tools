// @vitest-environment jsdom
import { createApp, nextTick } from "vue";
import { expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import TimezoneConvert from "./TimezoneConvert.vue";

it("实时时钟刷新时保持添加城市的下拉列表打开，并允许添加城市", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  localStorage.setItem("timezone.base", JSON.stringify("Asia/Shanghai"));
  localStorage.setItem("timezone.zones", JSON.stringify([]));
  const container = document.createElement("div");
  document.body.append(container);
  const app = createApp(TimezoneConvert).use(i18n);

  try {
    app.mount(container);
    const clock = container.querySelector(".big-time");
    const initialTime = clock?.textContent;
    const trigger = container.querySelector<HTMLButtonElement>(".add-zone-select");
    expect(trigger).not.toBeNull();
    trigger!.click();
    await nextTick();

    const list = document.body.querySelector('[role="listbox"]');
    expect(list).not.toBeNull();
    vi.advanceTimersByTime(2_000);
    await nextTick();
    expect(clock?.textContent).not.toBe(initialTime);
    expect(document.body.querySelector('[role="listbox"]')).toBe(list);
    expect(trigger!.classList.contains("open")).toBe(true);

    const options = Array.from(list!.querySelectorAll<HTMLElement>('[role="option"]'));
    const tokyo = options.find((option) => option.textContent?.includes("Asia/Tokyo"));
    expect(tokyo).toBeDefined();
    tokyo!.click();
    await nextTick();
    const addButton = container.querySelector<HTMLButtonElement>('.add button[type="submit"]');
    expect(addButton?.disabled).toBe(false);
    addButton!.click();
    await nextTick();

    expect(container.querySelector(".rows .row:not(.base-row) .city b")?.textContent).toBe("东京");
    expect(JSON.parse(localStorage.getItem("timezone.zones") ?? "[]")).toEqual(["Asia/Tokyo"]);
  } finally {
    app.unmount();
    container.remove();
    localStorage.clear();
    vi.useRealTimers();
  }
});
