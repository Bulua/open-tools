// @vitest-environment jsdom
import { createApp, nextTick } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { i18n } from "@/locales";
import ImageWatermark from "./ImageWatermark.vue";

const io = vi.hoisted(() => ({ saveFiles: vi.fn(), canvasToBytes: vi.fn() }));
vi.mock("@/utils/saveFile", () => ({ saveFiles: io.saveFiles }));
vi.mock("../utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("../utils")>(),
  loadImage: async () => Object.assign(document.createElement("img"), { width: 100, height: 100 }),
  canvasToBytes: io.canvasToBytes,
}));
vi.mock("@/composables/useFitFrame", async () => {
  const { ref } = await import("vue");
  return { useFitFrame: () => ({ observeArea: () => {}, frameStyle: ref({}), scale: ref(1) }) };
});

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function mountWatermark(imageSize = 100) {
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = () => "blob:watermark-test";
    static revokeObjectURL = () => {};
  });
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(imageSize);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(imageSize);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 100, height: 100, left: 0, top: 0 } as DOMRect);
  type Drawing = { text: string; position: number[]; angle: number; marks: { angle: number; font: string }[] };
  const drawings = new WeakMap<HTMLCanvasElement, Drawing>();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    const drawing: Drawing = { text: "", position: [], angle: 0, marks: [] };
    drawings.set(this, drawing);
    return {
      drawImage() {}, save() {}, restore() {}, setTransform() {}, clearRect() {},
      rotate: (angle: number) => { drawing.angle = angle; },
      measureText: () => ({ width: 20 }),
      fillText(this: CanvasRenderingContext2D, text: string) {
        drawing.text = text;
        drawing.marks.push({ angle: drawing.angle, font: this.font });
      },
      translate: (x: number, y: number) => { drawing.position = [x, y]; },
    } as unknown as CanvasRenderingContext2D;
  });
  io.canvasToBytes.mockImplementation(async (canvas: HTMLCanvasElement) => drawings.get(canvas));

  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp(ImageWatermark).use(i18n);
  app.mount(root);
  dispose = () => { app.unmount(); root.remove(); };
  const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })] });
  input.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(root.querySelectorAll(".thumb")).toHaveLength(2));
  return { root, drawings };
}

function gesture(target: HTMLElement, from: [number, number], to: [number, number]) {
  target.setPointerCapture = vi.fn();
  for (const [type, [clientX, clientY]] of [["pointerdown", from], ["pointermove", to], ["pointerup", to]] as const) {
    const event = new MouseEvent(type, { clientX, clientY, bubbles: true });
    Object.defineProperty(event, "pointerId", { value: 1 });
    target.dispatchEvent(event);
  }
}

it("切换图片恢复各自的水印文字与位置，批量导出逐张应用配置", async () => {
  const { root } = await mountWatermark();
  await vi.waitFor(() => expect(root.querySelector(".mark-target")).not.toBeNull());
  expect(root.querySelector(".mark-handle")).toBeNull();
  gesture(root.querySelector<HTMLElement>(".mark-target")!, [87, 94], [87, 94]);
  await nextTick();
  expect(root.querySelectorAll(".mark-handle")).toHaveLength(2);
  root.querySelector(".mark-overlay")!.dispatchEvent(new MouseEvent("pointerdown", { clientX: 10, clientY: 10 }));
  await nextTick();
  expect(root.querySelector(".mark-handle")).toBeNull();
  const edit = (text: string) => {
    const field = root.querySelector<HTMLInputElement>(".field")!;
    field.value = text;
    field.dispatchEvent(new Event("input"));
  };
  const move = async (x: number, y: number) => {
    await vi.waitFor(() => expect(root.querySelector<HTMLElement>(".mark-target")?.style.left).toBe("87%"));
    const target = root.querySelector<HTMLElement>(".mark-target")!;
    gesture(target, [87, 94], [x, y]);
  };
  edit("第一张");
  await move(20, 20);
  const thumbs = root.querySelectorAll<HTMLElement>(".thumb");
  thumbs[1].click();
  await nextTick();
  edit("第二张");
  await move(60, 65);
  thumbs[0].click();
  await vi.waitFor(() => {
    expect(root.querySelector<HTMLInputElement>(".field")?.value).toBe("第一张");
    expect(parseFloat(root.querySelector<HTMLElement>(".mark-target")!.style.left)).toBeCloseTo(20);
  });

  root.querySelector<HTMLButtonElement>(".btn.primary")!.click();
  await vi.waitFor(() => expect(io.saveFiles).toHaveBeenCalled());
  const exported = await Promise.all(io.canvasToBytes.mock.results.map((result) => result.value));
  expect(exported.map(({ text }) => text)).toEqual(["第一张", "第二张"]);
  expect(exported[0].position[0]).toBeCloseTo(20);
  expect(exported[1].position[0]).toBeCloseTo(60);
});

it("平铺水印共享拖动后的参考位置、缩放尺寸和旋转角度", async () => {
  const { root, drawings } = await mountWatermark();
  const tiled = root.querySelector<HTMLInputElement>(".check.push input")!;
  tiled.click();
  await vi.waitFor(() => expect(root.querySelector(".mark-overlay.tiled")).not.toBeNull());
  expect(root.querySelector(".mark-handle")).toBeNull();
  const mark = root.querySelector<HTMLElement>(".mark-target")!;
  const x = parseFloat(mark.style.left);
  const y = parseFloat(mark.style.top);
  gesture(mark, [x, y], [x + 7, y + 8]);
  await vi.waitFor(() => expect(parseFloat(mark.style.left)).toBeCloseTo(x + 7));

  const cx = parseFloat(mark.style.left);
  const cy = parseFloat(mark.style.top);
  gesture(mark.querySelector<HTMLElement>(".scale-handle")!, [cx + 5, cy + 5], [cx + 10, cy + 10]);
  await vi.waitFor(() => expect(parseFloat(mark.style.height)).toBeCloseTo(12));
  gesture(mark.querySelector<HTMLElement>(".rotate-handle")!, [cx, cy - 20], [cx + 20, cy]);
  await vi.waitFor(() => {
    const drawing = drawings.get(root.querySelector("canvas")!)!;
    expect(drawing.marks.length).toBeGreaterThan(1);
    expect(drawing.marks.every(({ angle, font }) => angle === Math.PI / 2 && font.includes("10px"))).toBe(true);
  });
});

it("短边小于 40 像素时，缩放手柄仍能改变实际字号", async () => {
  const { root, drawings } = await mountWatermark(32);
  const canvas = root.querySelector("canvas")!;
  await vi.waitFor(() => expect(drawings.get(canvas)?.marks[0].font).toContain("1.6px"));
  const mark = root.querySelector<HTMLElement>(".mark-target")!;
  const x = parseFloat(mark.style.left);
  const y = parseFloat(mark.style.top);
  gesture(mark, [x, y], [x, y]);
  await nextTick();
  gesture(mark.querySelector<HTMLElement>(".scale-handle")!, [x + 5, y - 5], [x + 10, y - 10]);
  await vi.waitFor(() => expect(drawings.get(canvas)?.marks[0].font).toContain("3.2px"));
});

it("平铺水印拖出预览再松手时，选中框回到图内的副本", async () => {
  const { root } = await mountWatermark();
  root.querySelector<HTMLInputElement>(".check.push input")!.click();
  await vi.waitFor(() => expect(root.querySelector(".mark-overlay.tiled")).not.toBeNull());
  const mark = root.querySelector<HTMLElement>(".mark-target")!;
  const x = parseFloat(mark.style.left);
  const y = parseFloat(mark.style.top);
  // 新参考水印稍微越过右边缘，自己仍部分可见，但控制点应选择图内另一枚。
  gesture(mark, [x, y], [104, y]);
  await vi.waitFor(() => {
    expect(root.querySelectorAll(".mark-handle")).toHaveLength(2);
    // 相邻交错行的副本比同一行的下一个副本更近。
    expect(parseFloat(mark.style.left)).toBeCloseTo(88);
  });
});
