// @vitest-environment jsdom
import { createApp, nextTick } from "vue";
import { expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import CalendarTool from "./CalendarTool.vue";

it("在有备注的日期旁预览，点击后固定详情并可编辑", async () => {
  const year = new Date().getFullYear();
  const date = Date.UTC(year, 9, 1);
  const container = document.createElement("div");
  const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });
  localStorage.setItem("calendar.notes", JSON.stringify({
    [`${year}-10-01`]: { text: "纪念日安排", annual: true, reminderTime: "10:20:30" },
  }));
  document.body.append(container);
  const app = createApp(CalendarTool).use(i18n);
  try {
    app.mount(container);
    const day = container.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;
    await vi.waitFor(() => expect(day.querySelector(".day-note")).not.toBeNull());
    expect(day.querySelector(".day-caption")?.textContent).toBe("国庆节");
    vi.spyOn(day, "getBoundingClientRect").mockReturnValue(new DOMRect(window.innerWidth - 60, 100, 50, 50));

    const enter = Object.assign(new MouseEvent("pointerenter"), { pointerType: "mouse" });
    day.dispatchEvent(enter);
    await nextTick();
    const preview = document.querySelector('[role="tooltip"]');
    expect(preview?.classList.contains("date-popup-left")).toBe(true);
    expect(preview?.textContent).toContain("纪念日安排");
    expect(preview?.textContent).toContain("10:20:30");
    expect(preview?.textContent).toContain("国庆节（中国）");

    day.click();
    await nextTick();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("纪念日安排");
    expect(container.querySelector(".toolbar")?.textContent).not.toContain("纪念日安排");
    dialog?.querySelector<HTMLButtonElement>(".note-label button")?.click();
    await nextTick();
    const textarea = dialog?.querySelector("textarea");
    expect(textarea?.value).toBe("纪念日安排");
    textarea!.value = "滚动时保留的草稿";
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    const yearList = container.querySelector(".year-list")!;
    yearList.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    yearList.dispatchEvent(new Event("scroll"));
    await nextTick();
    expect(dialog?.querySelector("textarea")?.value).toBe("滚动时保留的草稿");

    const trigger = dialog!.querySelector<HTMLButtonElement>(".dt-trigger")!;
    expect(trigger.textContent).toContain("10:20:30");
    expect(document.querySelector(".dt-panel")).toBeNull();
    trigger.click();
    await nextTick();
    const timePanel = document.querySelector(".dt-panel.fixed-date")!;
    const selectedTime = timePanel.querySelectorAll<HTMLButtonElement>(".time-option-list button.selected");
    expect(Array.from(selectedTime, (button) => button.textContent?.trim())).toEqual(["10", "20", "30"]);
    timePanel.querySelector<HTMLButtonElement>('.time-option-list:nth-child(3) [data-v="45"]')!.click();
    timePanel.querySelector<HTMLButtonElement>("footer .primary")!.click();
    await nextTick();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain(`${year}-10-01  10:20:45`);
    dialog!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("calendar.notes") ?? "{}");
      expect(stored[`${year}-10-01`]).toEqual({ text: "滚动时保留的草稿", annual: true, reminderTime: "10:20:45" });
    });
  } finally {
    app.unmount();
    container.remove();
    localStorage.removeItem("calendar.notes");
    if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});
