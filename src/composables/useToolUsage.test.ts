// @vitest-environment jsdom
import { createApp, defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { useToolResult } from "./useToolUsage";
import { recordToolUsage } from "./toolLibrary";
import { useClipboard } from "./useClipboard";

vi.mock("./toolLibrary", () => ({ recordToolUsage: vi.fn() }));
let dispose = () => {};
afterEach(() => { dispose(); vi.useRealTimers(); vi.clearAllMocks(); });

function mountTool() {
  vi.useFakeTimers();
  const result = ref("初始示例");
  const visible = ref(true);
  const Tool = defineComponent({ setup() { useToolResult(result); return () => h("div"); } });
  const root = document.createElement("div");
  const app = createApp(() => h(KeepAlive, () => visible.value ? h(Tool) : null));
  app.mount(root);
  dispose = () => { app.unmount(); };
  return { result, visible };
}

it("打开工具的初始示例不计数，连续输入停止后仅计一次", async () => {
  const { result } = mountTool();
  await vi.advanceTimersByTimeAsync(2000);
  expect(recordToolUsage).not.toHaveBeenCalled();
  for (const text of ["a", "ab", "abc"]) {
    result.value = text;
    await nextTick();
    await vi.advanceTimersByTimeAsync(200);
  }
  expect(recordToolUsage).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(recordToolUsage).toHaveBeenCalledTimes(1);
});

it("输入变为无效或空结果时取消待统计的记录", async () => {
  const { result } = mountTool();
  result.value = "有效结果";
  await nextTick();
  result.value = "";
  await nextTick();
  await vi.advanceTimersByTimeAsync(2000);
  expect(recordToolUsage).not.toHaveBeenCalled();
});

it("离开工具时结算已完成的实时操作，重新进入不会多计", async () => {
  const { result, visible } = mountTool();
  result.value = "处理完成";
  await nextTick();
  visible.value = false;
  await nextTick();
  expect(recordToolUsage).toHaveBeenCalledTimes(1);
  result.value = "后台刷新";
  await nextTick();
  visible.value = true;
  await nextTick();
  await vi.advanceTimersByTimeAsync(2000);
  expect(recordToolUsage).toHaveBeenCalledTimes(1);
});

it("复制成功才计次，空内容和复制失败不计数", async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  const { copy } = useClipboard(write);
  await copy("");
  expect(recordToolUsage).not.toHaveBeenCalled();
  write.mockRejectedValueOnce(new Error("失败"));
  await expect(copy("结果")).rejects.toThrow("失败");
  expect(recordToolUsage).not.toHaveBeenCalled();
  await copy("结果");
  expect(recordToolUsage).toHaveBeenCalledTimes(1);
});
