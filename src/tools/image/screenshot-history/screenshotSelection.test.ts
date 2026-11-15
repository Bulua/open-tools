import { describe, expect, it } from "vitest";
import { clientRectToDesktop, desktopRectToClient, resizeHandleAt, resizeSelection, windowAt } from "./screenshotSelection";

describe("截图窗口识别与选区调整", () => {
  const rect = { x: 100, y: 80, w: 200, h: 120 };
  const bounds = { w: 800, h: 600 };

  it("高 DPI 和客户区偏移下，吸附窗口与最终裁剪使用同一坐标", () => {
    const viewport = { x: -8, y: 4, w: 3840, h: 2160 };
    const cssSize = { w: 2560, h: 1440 };
    const nativeWindow = { x: 292, y: 154, w: 1200, h: 900 };
    const client = desktopRectToClient(nativeWindow, viewport, cssSize);
    expect(client).toEqual({ x: 200, y: 100, w: 800, h: 600 });
    expect(clientRectToDesktop(client, viewport, cssSize)).toEqual(nativeWindow);
  });

  it("重叠窗口优先选择顶层窗口，窗口外不误选", () => {
    const front = { x: 120, y: 90, w: 50, h: 50 };
    expect(windowAt({ x: 130, y: 100 }, [front, rect])).toBe(front);
    expect(windowAt({ x: 299, y: 150 }, [front, rect])).toBe(rect);
    expect(windowAt({ x: 310, y: 150 }, [front, rect])).toBeUndefined();
  });

  it("识别角点和边框，内部标注不触发缩放", () => {
    expect(resizeHandleAt(rect, { x: 102, y: 82 })).toBe("nw");
    expect(resizeHandleAt(rect, { x: 140, y: 200 })).toBe("s");
    expect(resizeHandleAt(rect, { x: 140, y: 150 })).toBeUndefined();
  });

  it("左上角调整保持右下角固定，且不能越过桌面边界", () => {
    expect(resizeSelection(rect, "nw", { x: -20, y: -30 }, bounds)).toEqual({ x: 0, y: 0, w: 300, h: 200 });
    expect(resizeSelection(rect, "nw", { x: 400, y: 400 }, bounds)).toEqual({ x: 296, y: 196, w: 4, h: 4 });
  });

  it("右下角扩大到屏幕边界，单边缩放不改变另一方向", () => {
    expect(resizeSelection(rect, "se", { x: 1000, y: 900 }, bounds)).toEqual({ x: 100, y: 80, w: 700, h: 520 });
    expect(resizeSelection(rect, "e", { x: 380, y: 300 }, bounds)).toEqual({ ...rect, w: 280 });
  });
});
