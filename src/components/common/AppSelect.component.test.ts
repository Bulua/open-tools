// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { expect, it } from "vitest";
import { i18n } from "@/locales";
import AppSelect from "./AppSelect.vue";

it("单选仍返回单值并关闭菜单，有足够空间时菜单出现在触发按钮下方", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const value = ref("Beijing");
  const app = createApp(() => h(AppSelect<string>, {
    modelValue: value.value, options: [{ value: "Beijing", label: "北京" }, { value: "HongKong", label: "香港" }],
    "onUpdate:modelValue": next => { value.value = next; },
  })).use(i18n);
  app.mount(host);
  try {
    const trigger = host.querySelector("button")!;
    trigger.getBoundingClientRect = () => ({ top: 100, bottom: 134, left: 10, right: 210, width: 200, height: 34, x: 10, y: 100, toJSON() {} });
    trigger.click(); await nextTick(); await nextTick();
    const menu = document.querySelector<HTMLElement>(".select-menu")!;
    expect(menu.style.top).toBe("138px");
    menu.querySelectorAll<HTMLElement>('[role="option"]')[1].click(); await nextTick();
    expect(value.value).toBe("HongKong");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  } finally { app.unmount(); host.remove(); }
});
