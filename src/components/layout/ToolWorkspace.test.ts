// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, ref, shallowRef } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import type { Tool } from "@/tools";
import ToolWorkspace from "./ToolWorkspace.vue";

vi.mock("./HomePage.vue", () => ({ default: { render: () => h("div", { "data-home": "" }, "home") } }));
vi.mock("@/components/tool/ToolView.vue", () => ({
  default: defineComponent({
    props: ["tool"],
    setup(props) {
      const text = ref("");
      return () => h("input", { "data-tool": props.tool.id, value: text.value, onInput: (event: Event) => { text.value = (event.target as HTMLInputElement).value; } });
    },
  }),
}));

let dispose = () => {};
afterEach(() => { dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("从主页打开工具后可以连续切换，并恢复缓存的输入", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  const home = ref(true);
  const tool = shallowRef({ id: "first" } as Tool);
  const container = document.createElement("div");
  document.body.append(container);
  const app = createApp(() => h(ToolWorkspace, { home: home.value, tool: tool.value, categories: [] }));
  app.mount(container);
  // 让入场动画保持运行，覆盖动画结束前再次切换工具的情况。
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
  (container.firstElementChild as HTMLElement).animate = animate;
  dispose = () => { app.unmount(); container.remove(); };
  const settle = async () => { await nextTick(); await vi.advanceTimersByTimeAsync(100); await nextTick(); };
  expect(container.querySelector("[data-home]")).not.toBeNull();
  home.value = false;
  await settle();
  const input = container.querySelector<HTMLInputElement>('[data-tool="first"]');
  expect(input).not.toBeNull();
  input!.value = "保留输入";
  input!.dispatchEvent(new Event("input"));
  tool.value = { id: "second" } as Tool;
  await settle();
  expect(container.querySelector('[data-tool="second"]')).not.toBeNull();
  tool.value = { id: "first" } as Tool;
  await settle();
  expect(container.querySelector<HTMLInputElement>('[data-tool="first"]')?.value).toBe("保留输入");
  home.value = true;
  await settle();
  expect(container.querySelector("[data-home]")).not.toBeNull();
  home.value = false;
  tool.value = { id: "third" } as Tool;
  await settle();
  expect(container.querySelector('[data-tool="third"]')).not.toBeNull();
  expect(animate).toHaveBeenCalledTimes(3);
  expect(cancel).toHaveBeenCalled();
});
