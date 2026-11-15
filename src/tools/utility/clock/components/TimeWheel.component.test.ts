// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { expect, it, vi } from "vitest";
import TimeWheel from "./TimeWheel.vue";

it("滚轮和键盘通过平滑滚动移动选中行，滚动中的值与显示保持同步", async () => {
  const value = ref(9);
  const host = document.createElement("div"); document.body.append(host);
  const app = createApp(() => h(TimeWheel, { modelValue: value.value, count: 24, label: "小时", "onUpdate:modelValue": next => { value.value = next; } }));
  app.mount(host);
  const wheel = host.querySelector<HTMLElement>('[role="spinbutton"]')!;
  const scroll = vi.fn((options: ScrollToOptions) => {
    wheel.scrollTop = options.top!;
    wheel.dispatchEvent(new Event("scroll"));
  });
  Object.defineProperty(wheel, "scrollTo", { value: scroll });
  try {
    wheel.scrollTop = (24 + 9) * 32;
    const gesture = new WheelEvent("wheel", { deltaY: 32, cancelable: true });
    wheel.dispatchEvent(gesture); await nextTick();
    expect(gesture.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenLastCalledWith({ top: (24 + 10) * 32, behavior: "smooth" });
    expect(value.value).toBe(10);
    wheel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true })); await nextTick();
    expect(scroll).toHaveBeenLastCalledWith({ top: (24 + 11) * 32, behavior: "smooth" });
    expect(value.value).toBe(11);
  } finally { app.unmount(); host.remove(); }
});
