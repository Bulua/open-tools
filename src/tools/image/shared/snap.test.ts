import { describe, expect, it } from "vitest";
import { snapBox } from "./snap";

describe("拖动吸附", () => {
  it("靠近另一张图片的顶边时水平对齐，并显示横线", () => {
    const other = { x: 0, y: 100, w: 200, h: 200 };
    const r = snapBox({ x: 400, y: 104, w: 100, h: 100 }, [other], 6);
    expect(r.y).toBe(100);
    expect(r.guides.y).toContain(100);
  });

  it("中线对齐另一张图片的中线", () => {
    const other = { x: 400, y: 0, w: 200, h: 100 };
    const r = snapBox({ x: 447, y: 333, w: 100, h: 100 }, [other], 6);
    expect(r.x).toBe(450);
    expect(r.guides.x).toEqual([500]);
  });

  it("贴着另一张图片的右边", () => {
    const other = { x: 100, y: 100, w: 200, h: 200 };
    const r = snapBox({ x: 303, y: 500, w: 100, h: 50 }, [other], 6);
    expect(r.x).toBe(300);
    expect(r.guides.x).toContain(300);
  });

  it("离得远时不吸附，也没有参考线", () => {
    const r = snapBox({ x: 123, y: 321, w: 100, h: 100 }, [{ x: 600, y: 600, w: 50, h: 50 }], 6);
    expect(r).toEqual({ x: 123, y: 321, guides: { x: [], y: [] } });
  });

  it("只有一张图片时不吸附", () => {
    expect(snapBox({ x: 1, y: 2, w: 100, h: 100 }, [], 6)).toEqual({ x: 1, y: 2, guides: { x: [], y: [] } });
  });

  it("有多条线可吸附时选最近的", () => {
    const r = snapBox({ x: 0, y: 98, w: 50, h: 50 }, [{ x: 500, y: 95, w: 10, h: 10 }, { x: 600, y: 99, w: 10, h: 10 }], 6);
    expect(r.y).toBe(99);
  });
});
