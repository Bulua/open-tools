// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import AppToast from "@/components/layout/AppToast.vue";
import { i18n } from "@/locales";
import { dismissToast, toasts } from "@/utils/errorToast";
import { saveFiles } from "@/utils/saveFile";
import MediaCompress from "./MediaCompress.vue";

vi.mock("@/utils/saveFile", () => ({ saveFiles: vi.fn() }));

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  for (const toast of toasts.value) dismissToast(toast.id);
  vi.clearAllMocks();
});

it.each([
  ["audio", "clip.wav", "audio/wav", "试听压缩音频"],
  ["video", "clip.mp4", "video/mp4", "压缩结果预览"],
] as const)("未压缩的 %s 在预览和保存时显示相应的共用提示", async (mode, name, type, previewLabel) => {
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp(() => [h(MediaCompress, { mode }), h(AppToast)]).use(i18n);
  app.mount(root);
  dispose = () => { app.unmount(); root.remove(); };

  const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File(["内容"], name, { type })] });
  input.dispatchEvent(new Event("change"));
  await nextTick();

  const row = root.querySelector(".rows li")!;
  row.querySelector<HTMLButtonElement>(`[aria-label="${previewLabel}"]`)!.click();
  row.querySelector<HTMLButtonElement>('[aria-label="保存这个文件"]')!.click();
  [...root.querySelectorAll("button")].find((button) => button.textContent?.trim() === "保存已选结果")!.click();
  await nextTick();

  const notices = root.querySelectorAll(".toast[role=status]");
  expect(notices).toHaveLength(2);
  expect(notices[0].textContent).toContain("文件尚未压缩，请勾选文件后点击「开始压缩」");
  expect(notices[1].textContent?.trim()).toBe("文件尚未压缩，请压缩后进行下载");
  expect(saveFiles).not.toHaveBeenCalled();
});
