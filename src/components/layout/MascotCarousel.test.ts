// @vitest-environment jsdom
import { createApp, h, KeepAlive, nextTick, ref } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import MascotCarousel from "./MascotCarousel.vue";

let dispose = () => {};
afterEach(() => { dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function mountCarousel(reduced = false) {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduced })));
  const visible = ref(true);
  const root = document.createElement("div");
  const app = createApp(() => h(KeepAlive, () => visible.value ? h(MascotCarousel) : null)).use(i18n);
  app.mount(root);
  dispose = () => app.unmount();
  const selected = () => root.querySelector<HTMLButtonElement>(".mascot-main")!;
  const source = () => root.querySelector<HTMLImageElement>(".mascot-picture:not(.mascot-slide-leave-active) img")!.src;
  return { root, visible, selected, source };
}

it("只展示当前动作，每五秒滑动切换一个并循环所有动作", async () => {
  const { root, source } = mountCarousel();
  const first = source();
  const visited = new Set([first]);
  for (let index = 0; index < 5; index++) {
    expect(root.querySelectorAll(".mascot-main")).toHaveLength(1);
    expect(root.querySelectorAll(".mascot-picture")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    visited.add(source());
    await vi.advanceTimersByTimeAsync(350);
  }
  await vi.advanceTimersByTimeAsync(350);
  expect(visited.size).toBe(5);
  expect(source()).toBe(first);
});

it("点击主体切换下一个动作，离开主页停止计时，返回后恢复", async () => {
  const { root, visible, source } = mountCarousel();
  const first = source();
  root.querySelector<HTMLButtonElement>(".mascot-main")!.click();
  await vi.advanceTimersByTimeAsync(350);
  const expected = source();
  expect(expected).not.toBe(first);
  visible.value = false;
  await nextTick();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(15000);
  visible.value = true;
  await nextTick();
  expect(source()).toBe(expected);
  await vi.advanceTimersByTimeAsync(5000);
  expect(source()).not.toBe(expected);
});

it("鼠标悬停时暂停轮换，离开后重新等待五秒", async () => {
  const { root, source } = mountCarousel();
  const first = source();
  root.firstElementChild!.dispatchEvent(new Event("pointerenter"));
  await vi.advanceTimersByTimeAsync(10000);
  expect(source()).toBe(first);
  root.firstElementChild!.dispatchEvent(new Event("pointerleave"));
  await vi.advanceTimersByTimeAsync(5000);
  expect(source()).not.toBe(first);
});

it("减少动态效果时使用静态图片来源，并保留手动选择", async () => {
  const { root, source } = mountCarousel(true);
  const first = source();
  expect(root.querySelector("picture source")?.getAttribute("srcset")).toContain(".png");
  await vi.advanceTimersByTimeAsync(15000);
  expect(source()).toBe(first);
  root.querySelector<HTMLButtonElement>(".mascot-main")!.click();
  await nextTick();
  expect(source()).not.toBe(first);
});
