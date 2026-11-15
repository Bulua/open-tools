// @vitest-environment jsdom
import { createApp, h, nextTick, shallowRef } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import CompressionPreview, { type CompressionPreviewSource } from "./CompressionPreview.vue";

vi.mock("@/tools/audio/shared/peaks", () => ({
  readPeaks: vi.fn().mockResolvedValue({ min: new Float32Array(1), max: new Float32Array(1), duration: 1, done: true, version: 1 }),
}));
vi.mock("@/tools/audio/shared/components/Waveform.vue", () => ({
  default: { template: '<div class="test-waveform"><slot /></div>' },
}));

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ["image", "img", "image/webp", "original", "原始文件预览"],
  ["audio", "audio", "audio/mpeg", "compressed", "试听压缩音频"],
  ["video", "video", "video/mp4", "original", "原始文件预览"],
] as const)("在工具内预览 %s 文件并在关闭后释放地址", async (kind, tag, mime, variant, title) => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const create = vi.fn(() => "blob:compressed-result");
  const revoke = vi.fn();
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = create;
    static revokeObjectURL = revoke;
  });
  const source = shallowRef<CompressionPreviewSource | null>(null);
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp(() => h(CompressionPreview, {
    source: source.value,
    onClose: () => { source.value = null; },
  })).use(i18n);
  app.mount(root);
  dispose = () => { app.unmount(); root.remove(); };

  const dialog = document.querySelector("dialog")!;
  dialog.showModal = vi.fn(() => dialog.setAttribute("open", ""));
  dialog.close = vi.fn(() => dialog.removeAttribute("open"));
  const blob = new File(["文件内容"], "预览文件", { type: mime });
  source.value = { kind, variant, name: blob.name, blob };
  await vi.waitFor(() => expect(dialog.open).toBe(true));
  expect(dialog.getAttribute("aria-label")).toBe(title);
  const element = dialog.querySelector(tag)!;
  expect(element.getAttribute("src")).toBe("blob:compressed-result");
  expect(create).toHaveBeenCalledWith(blob);

  let paused = false;
  const pause = vi.fn(() => { paused = true; });
  if (element instanceof HTMLMediaElement) {
    if (kind === "audio") {
      expect(dialog.querySelector(".test-waveform")).not.toBeNull();
      expect(dialog.querySelector(".track .play")).not.toBeNull();
      expect(element.controls).toBe(false);
    } else expect(element.controls).toBe(true);
    await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
    Object.defineProperty(element, "paused", { get: () => paused });
    element.pause = pause;
  } else expect(play).not.toHaveBeenCalled();
  dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  await nextTick();
  if (element instanceof HTMLMediaElement) expect(pause).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(dialog.open).toBe(false));
  expect(revoke).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledWith("blob:compressed-result");
});
