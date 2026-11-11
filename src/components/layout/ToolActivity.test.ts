// @vitest-environment jsdom
import { createApp, nextTick } from "vue";
import { expect, it } from "vitest";
import { i18n } from "@/locales";
import { toolActivity } from "@/composables/toolLibrary";
import { now } from "@/tools/utility/countdownStore";
import ToolActivity from "./ToolActivity.vue";

it("展示含本月的近六个月记录，日期、总数和当天次数随数据更新", async () => {
  const previousNow = now.value;
  now.value = new Date(2026, 10, 11, 12).getTime();
  toolActivity.value = { "2026-05-01": 99, "2026-06-01": 1, "2026-11-11": 12 };
  const root = document.createElement("div");
  const app = createApp(ToolActivity).use(i18n);
  try {
    app.mount(root);
    expect(root.querySelectorAll(".months span")).toHaveLength(6);
    expect(root.querySelectorAll(".days .day:not(.placeholder)")).toHaveLength(164);
    expect(root.querySelector("h2")?.textContent).toContain("13");
    const today = root.querySelector<HTMLElement>(".day.today")!;
    expect(today.title).toContain("12");
    expect(today.dataset.level).toBe("4");
    toolActivity.value["2026-11-11"] += 1;
    await nextTick();
    expect(today.title).toContain("13");
    expect(root.querySelector("h2")?.textContent).toContain("14");
    now.value = new Date(2026, 10, 12, 0, 1).getTime();
    await nextTick();
    expect(root.querySelectorAll(".days .day:not(.placeholder)")).toHaveLength(165);
    expect(root.querySelector<HTMLElement>(".day.today")!.title).toContain("0");
  } finally {
    app.unmount();
    toolActivity.value = {};
    now.value = previousNow;
  }
});
