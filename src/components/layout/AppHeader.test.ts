// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import AppHeader from "./AppHeader.vue";

vi.mock("./AppLogo.vue", () => ({ default: { render: () => h("span") } }));

it("主页隐藏顶部搜索并禁用交互，进入工具后显示，返回主页再次收起", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const scroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  const activeId = ref("home");
  const root = document.createElement("div");
  const search = vi.fn();
  const app = createApp(() => h(AppHeader, { activeId: activeId.value, categories: [], theme: "light", onOpenSearch: search })).use(i18n);
  try {
    app.mount(root);
    const slot = root.querySelector<HTMLElement>(".search-slot")!;
    expect(slot.classList.contains("hidden")).toBe(true);
    expect(slot.getAttribute("aria-hidden")).toBe("true");
    activeId.value = "developer";
    await nextTick();
    expect(slot.classList.contains("hidden")).toBe(false);
    expect(slot.getAttribute("aria-hidden")).toBe("false");
    slot.querySelector<HTMLButtonElement>("button")!.click();
    expect(search).toHaveBeenCalledTimes(1);
    activeId.value = "home";
    await nextTick();
    expect(slot.classList.contains("hidden")).toBe(true);
    expect(slot.getAttribute("aria-hidden")).toBe("true");
  } finally {
    app.unmount();
    if (scroll) Object.defineProperty(Element.prototype, "scrollIntoView", scroll);
    else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    vi.unstubAllGlobals();
  }
});
