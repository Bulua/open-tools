// @vitest-environment jsdom
import { createApp, nextTick } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import ClockTool from "./ClockTool.vue";
import { countdowns, countdownsReady, now } from "./clockStore";
import { stopwatch } from "./clockState";

vi.mock("@/composables/toolLibrary", () => ({ recordToolUsage: vi.fn() }));
let current = 0;
let cleanup: (() => void) | undefined;
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeEach(() => {
  localStorage.clear();
  countdowns.value = []; countdownsReady.value = true; stopwatch.reset(); current = 0;
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  vi.spyOn(performance, "now").mockImplementation(() => current);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
});
afterEach(() => {
  cleanup?.(); cleanup = undefined;
  vi.useRealTimers(); vi.restoreAllMocks();
  for (const [name, descriptor] of [["showModal", originalShow], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
function mount() {
  const host = document.createElement("div"); document.body.append(host);
  const app = createApp(ClockTool).use(i18n); app.mount(host);
  cleanup = () => { app.unmount(); host.remove(); };
  return host;
}
async function click(node: Element | null) {
  expect(node).not.toBeNull(); (node as HTMLElement).click(); await nextTick();
}

it("最后的新增卡片打开弹窗，可多选星期并保存标签、编辑和停用", async () => {
  const host = mount();
  expect(host.querySelectorAll(".alarm-grid > *")).toHaveLength(1);
  await click(host.querySelector(".add-alarm"));
  const dialog = document.querySelector("dialog")!;
  expect(dialog.hasAttribute("open")).toBe(true);
  const [hour, minute] = dialog.querySelectorAll<HTMLElement>('[role="spinbutton"]');
  expect(hour.getAttribute("aria-valuenow")).toBe("9");
  hour.scrollTop = (24 + 8) * 32; hour.dispatchEvent(new Event("scroll"));
  minute.scrollTop = (60 + 35) * 32; minute.dispatchEvent(new Event("scroll"));
  await nextTick();
  await click(dialog.querySelector("button.repeat-select"));
  expect(dialog.querySelector(".select-menu .search input")).not.toBeNull();
  await click(dialog.querySelector('[role="option"][data-value="1"]'));
  await click(dialog.querySelector('[role="option"][data-value="5"]'));
  expect(dialog.querySelector("button.repeat-select > span")?.textContent).toBe("周一、周五");
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  dialog.querySelector('[role="option"][data-value="5"]')!.dispatchEvent(escape); await nextTick();
  expect(escape.defaultPrevented).toBe(true);
  expect(dialog.querySelector("button.repeat-select")?.getAttribute("aria-expanded")).toBe("false");
  expect(dialog.hasAttribute("open")).toBe(true);
  const label = dialog.querySelector<HTMLInputElement>('input[maxlength="80"]')!;
  label.value = "出门"; label.dispatchEvent(new Event("input"));
  dialog.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true })); await nextTick();
  expect(dialog.hasAttribute("open")).toBe(false);
  expect(countdowns.value[0]).toMatchObject({ title: "出门", alarm: { time: "08:35", weekdays: [1, 5] } });
  expect(host.querySelector(".alarm-grid > :last-child")?.classList.contains("add-alarm")).toBe(true);
  await click(host.querySelector(".alarm-toggle"));
  expect(countdowns.value[0].enabled).toBe(false);
  expect(host.querySelector(".alarm-toggle")?.getAttribute("aria-checked")).toBe("false");
  await click(host.querySelector(".alarm-actions button"));
  expect(hour.getAttribute("aria-valuenow")).toBe("8");
  expect(minute.getAttribute("aria-valuenow")).toBe("35");
  expect(label.value).toBe("出门");
  await click(dialog.querySelector("button.repeat-select"));
  expect(dialog.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(2);
  expect(dialog.querySelectorAll('[role="option"][aria-selected="true"] svg.check')).toHaveLength(2);
  expect(dialog.querySelector('input[type="checkbox"]')).toBeNull();
});

it("启动、分段、暂停、继续及复位正确联动，切页不影响秒表且可使用计时器", async () => {
  const host = mount();
  await click(host.querySelector("#clock-tab-stopwatch"));
  const left = host.querySelector(".stopwatch-buttons button:first-child")!;
  const right = host.querySelector(".stopwatch-buttons button:last-child")!;
  expect((left as HTMLButtonElement).disabled).toBe(true);
  await click(right);
  expect(right.textContent).toContain("暂停"); expect(left.textContent).toContain("分段");
  current = 1250; await vi.advanceTimersByTimeAsync(30);
  expect(host.querySelector("output")?.textContent).toBe("00:00:01.25");
  await click(left);
  current = 2750; await click(left);
  expect(host.querySelectorAll(".laps li")).toHaveLength(2);
  expect(host.querySelector(".laps li")?.textContent).toContain("00:00:01.50");
  await click(right);
  expect(left.textContent).toContain("复位"); expect(right.textContent).toContain("启动");
  current = 10000; await vi.advanceTimersByTimeAsync(30);
  expect(host.querySelector("output")?.textContent).toBe("00:00:02.75");
  await click(right);
  await click(host.querySelector("#clock-tab-timer"));
  expect(host.querySelector("#clock-page-timer .timer-composer")).not.toBeNull();
  current = 11000; await vi.advanceTimersByTimeAsync(30);
  await click(host.querySelector("#clock-tab-stopwatch"));
  expect(host.querySelector("output")?.textContent).toBe("00:00:03.75");
  await click(right); await click(left);
  expect(host.querySelector("output")?.textContent).toBe("00:00:00.00");
  expect(host.querySelectorAll(".laps li")).toHaveLength(0);
});

it("时间滚轮支持键盘跨边界循环，重新新增时恢复默认时间和收起的星期选择", async () => {
  const host = mount();
  await click(host.querySelector(".add-alarm"));
  const dialog = document.querySelector("dialog")!;
  const [hour, minute] = dialog.querySelectorAll<HTMLElement>('[role="spinbutton"]');
  for (const [node, key] of [[hour, "End"], [hour, "ArrowDown"], [minute, "Home"], [minute, "ArrowUp"]] as const) {
    node.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true })); await nextTick();
  }
  expect(hour.getAttribute("aria-valuenow")).toBe("0");
  expect(minute.getAttribute("aria-valuenow")).toBe("59");
  await click(dialog.querySelector("button.repeat-select"));
  await click(dialog.querySelector('[role="option"][data-value="0"]'));
  dialog.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true })); await nextTick();
  expect(countdowns.value[0].alarm).toEqual({ time: "00:59", weekdays: [0] });
  await click(host.querySelector(".add-alarm"));
  expect(hour.getAttribute("aria-valuenow")).toBe("9");
  expect(minute.getAttribute("aria-valuenow")).toBe("0");
  expect(dialog.querySelector("button.repeat-select")?.getAttribute("aria-expanded")).toBe("false");
  expect(dialog.querySelector("button.repeat-select > span")?.textContent).toBe("仅一次");
});

it("周一至周五统一显示工作日，加入周末后显示具体星期，七天显示每天", async () => {
  const host = mount();
  await click(host.querySelector(".add-alarm"));
  const dialog = document.querySelector("dialog")!;
  await click(dialog.querySelector("button.repeat-select"));
  for (const day of [5, 3, 1, 4, 2]) await click(dialog.querySelector(`[role="option"][data-value="${day}"]`));
  const summary = () => dialog.querySelector("button.repeat-select > span")?.textContent;
  expect(summary()).toBe("工作日");
  await click(dialog.querySelector('[role="option"][data-value="6"]'));
  expect(summary()).not.toBe("工作日");
  await click(dialog.querySelector('[role="option"][data-value="0"]'));
  expect(summary()).toBe("每天");
  await click(dialog.querySelector('[role="option"][data-value="0"]'));
  await click(dialog.querySelector('[role="option"][data-value="6"]'));
  dialog.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true })); await nextTick();
  expect(host.querySelector(".alarm-schedule")?.textContent).toBe("工作日");
  expect(countdowns.value[0].alarm?.weekdays).toHaveLength(5);
});

it("重复选项使用与城市选择相同的搜索菜单，多选后保持展开", async () => {
  const host = mount();
  await click(host.querySelector(".add-alarm"));
  const dialog = document.querySelector("dialog")!;
  await click(dialog.querySelector("button.repeat-select"));
  const search = dialog.querySelector<HTMLInputElement>(".select-menu .search input")!;
  search.value = "五"; search.dispatchEvent(new Event("input")); await nextTick();
  expect(dialog.querySelectorAll('.select-menu [role="option"]')).toHaveLength(1);
  await click(dialog.querySelector('.select-menu [role="option"]'));
  expect(dialog.querySelector('[role="option"][data-value="5"][aria-selected="true"]')).not.toBeNull();
  expect(dialog.querySelector("button.repeat-select")?.getAttribute("aria-expanded")).toBe("true");
  expect(dialog.querySelector("button.repeat-select > span")?.textContent).toBe("周五");
});

it("离开工具并重新挂载后，秒表继续按经过时间计时", async () => {
  let host = mount();
  await click(host.querySelector("#clock-tab-stopwatch"));
  await click(host.querySelector(".stopwatch-buttons button:last-child"));
  current = 500; cleanup?.(); cleanup = undefined;
  current = 4500; host = mount();
  expect(host.querySelector("output")?.textContent).toBe("00:00:04.50");
});

it("收起重复菜单或点击面板空白处不关闭编辑器，仍能填写标签并点击保存新增", async () => {
  const host = mount();
  await click(host.querySelector(".add-alarm"));
  const dialog = document.querySelector("dialog")!;
  await click(dialog.querySelector("button.repeat-select"));
  await click(dialog.querySelector("button.repeat-select"));
  expect(dialog.querySelector("button.repeat-select")?.getAttribute("aria-expanded")).toBe("false");
  // 原生 dialog 会将模态框外的点击定向到 dialog 本身，不能据此丢弃当前表单。
  dialog.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: -1, clientY: -1 }));
  await nextTick();
  expect(dialog.hasAttribute("open")).toBe(true);
  const label = dialog.querySelector<HTMLInputElement>('input[maxlength="80"]')!;
  label.value = "保存后新增"; label.dispatchEvent(new Event("input")); await nextTick();
  await click(dialog.querySelector('button[type="submit"]'));
  expect(countdowns.value).toHaveLength(1);
  expect(countdowns.value[0].title).toBe("保存后新增");
  expect(dialog.hasAttribute("open")).toBe(false);
});

it("原生取消事件先收起重复菜单，再次取消才关闭表单", async () => {
  const host = mount();
  await click(host.querySelector(".add-alarm"));
  const dialog = document.querySelector("dialog")!;
  await click(dialog.querySelector("button.repeat-select"));
  const cancelMenu = new Event("cancel", { cancelable: true });
  dialog.dispatchEvent(cancelMenu); await nextTick();
  expect(cancelMenu.defaultPrevented).toBe(true);
  expect(dialog.hasAttribute("open")).toBe(true);
  expect(dialog.querySelector("button.repeat-select")?.getAttribute("aria-expanded")).toBe("false");
  dialog.dispatchEvent(new Event("cancel", { cancelable: true })); await nextTick();
  expect(dialog.hasAttribute("open")).toBe(false);
  expect(countdowns.value).toHaveLength(0);
});

it("计时器支持预设、自定义名称、多任务和暂停继续，切页及重新挂载保留状态", async () => {
  let wallTime = 1000000;
  vi.spyOn(Date, "now").mockImplementation(() => wallTime);
  let host = mount();
  await click(host.querySelector("#clock-tab-timer"));
  await click(host.querySelector(".timer-presets button"));
  const name = host.querySelector<HTMLInputElement>(".timer-name input")!;
  name.value = "泡茶"; name.dispatchEvent(new Event("input")); await nextTick();
  await click(host.querySelector(".start-timer"));
  expect(countdowns.value[0]).toMatchObject({ title: "泡茶", duration: 60000, target: 1060000 });
  expect(host.querySelector(".timer-card time")?.textContent).toBe("01:00");
  expect(host.querySelectorAll(".alarm-grid .alarm-card:not(.add-alarm)")).toHaveLength(0);
  wallTime += 15000; now.value = wallTime; await nextTick();
  expect(host.querySelector(".timer-card time")?.textContent).toBe("00:45");
  expect(host.querySelector<HTMLProgressElement>(".timer-card progress")?.value).toBe(0.25);
  await click(host.querySelector(".timer-actions .btn"));
  wallTime += 20000; now.value = wallTime; await nextTick();
  expect(host.querySelector(".timer-card time")?.textContent).toBe("00:45");
  expect(host.querySelector(".timer-status")?.textContent).toContain("已暂停");
  await click(host.querySelector(".timer-actions .btn"));
  expect(countdowns.value[0].target).toBe(wallTime + 45000);
  await click(host.querySelector(".start-timer"));
  expect(host.querySelectorAll(".timer-card")).toHaveLength(2);
  await click(host.querySelector("#clock-tab-alarm"));
  wallTime += 5000; now.value = wallTime;
  cleanup?.(); cleanup = undefined; host = mount();
  await click(host.querySelector("#clock-tab-timer"));
  expect(host.querySelector(".timer-card time")?.textContent).toBe("00:40");
  await click(host.querySelector(".timer-actions .icon-btn"));
  expect(host.querySelector(".timer-card time")?.textContent).toBe("01:00");
  await click(host.querySelector(".delete-timer"));
  await click(host.querySelector(".delete-timer"));
  expect(countdowns.value).toHaveLength(0);
  expect(host.querySelector(".timer-empty")).not.toBeNull();
});

it("计时器校验时长，支持秒级输入和到期后重新开始，加载完成前禁止新增", async () => {
  let wallTime = 1000000;
  vi.spyOn(Date, "now").mockImplementation(() => wallTime);
  const host = mount();
  await click(host.querySelector("#clock-tab-timer"));
  const inputs = host.querySelectorAll<HTMLInputElement>('.duration-fields input');
  const setDuration = async (values: string[]) => {
    inputs.forEach((input, i) => { input.value = values[i]; input.dispatchEvent(new Event("input")); });
    await nextTick(); await click(host.querySelector(".start-timer"));
  };
  await setDuration(["0", "0", "0"]);
  expect(host.querySelector("#timer-duration-error")).not.toBeNull();
  await setDuration(["0", "60", "0"]);
  await setDuration(["-1", "0", "0"]);
  await setDuration(["0", "0.5", "0"]);
  expect(countdowns.value).toHaveLength(0);
  countdownsReady.value = false; await nextTick();
  expect(host.querySelector<HTMLButtonElement>(".start-timer")?.disabled).toBe(true);
  countdownsReady.value = true; await nextTick();
  await setDuration(["0", "0", "10"]);
  expect(countdowns.value[0].duration).toBe(10000);
  expect(host.querySelector("#timer-duration-error")).toBeNull();
  wallTime += 10000; now.value = wallTime; await nextTick();
  expect(host.querySelector(".timer-status")?.textContent).toContain("时间到");
  expect(host.querySelector(".timer-card time")?.textContent).toBe("00:00");
  await click(host.querySelector(".timer-actions .btn"));
  expect(countdowns.value[0]).toMatchObject({ target: wallTime + 10000, done: false });
  expect(host.querySelector(".timer-status")?.textContent).toContain("计时中");
});
