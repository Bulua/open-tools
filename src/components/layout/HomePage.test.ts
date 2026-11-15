// @vitest-environment jsdom
import { createApp, h } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import { favoriteToolIds, recentToolIds } from "@/composables/toolLibrary";
import type { Category } from "@/tools";
import HomePage from "./HomePage.vue";

vi.mock("@/tools/utility/calendar/calendarStore", async () => {
  const { ref } = await import("vue");
  return { calendarNotes: ref({}), loadCalendarNotes: vi.fn().mockResolvedValue(undefined) };
});

let dispose = () => {};
afterEach(() => {
  dispose();
  favoriteToolIds.value = [];
  recentToolIds.value = [];
});

function mountHome(count: number) {
  const categories: Category[] = [{
    id: "test", name: "测试分类",
    tools: Array.from({ length: count }, (_, index) => ({
      id: `tool-${index}`, name: `工具 ${index}`, desc: "", icon: { render: () => h("span") },
    })),
  }];
  favoriteToolIds.value = categories[0].tools.map((tool) => tool.id);
  recentToolIds.value = [...favoriteToolIds.value];
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp(() => h(HomePage, { categories })).use(i18n);
  app.mount(root);
  dispose = () => { app.unmount(); root.remove(); };
  return root.querySelectorAll<HTMLElement>(".tool-section");
}

it.each([0, 5, 6])("只有 %i 个工具时全部显示，不显示查看更多", (count) => {
  for (const section of mountHome(count)) {
    expect(section.querySelectorAll(".tool-card")).toHaveLength(count);
    expect(section.querySelector(".show-more")).toBeNull();
  }
});

it.each([12, 13, 22])("%i 个收藏全部放入滚动区，最近使用仅显示六个，不再提供展开按钮", (count) => {
  const sections = mountHome(count);
  expect(sections[0].querySelectorAll(".tool-card")).toHaveLength(count);
  expect(sections[0].querySelector(".favorites-grid")).not.toBeNull();
  expect(sections[1].querySelectorAll(".tool-card")).toHaveLength(6);
  expect(sections[1].querySelector(".section-heading > span")?.textContent).toBe("6");
  for (const section of sections) expect(section.querySelector(".show-more")).toBeNull();
});
