import { describe, expect, it } from "vitest";
import { hitMark, markBounds, markCenter, markHandleAt, markHandles, markWorldBounds, markWorldPoint, moveMark, resizeMark, rotateMark, textFontSize, textLineHeight, type ScreenshotMark } from "./screenshotAnnotations";

const measure = (text: string, fontSize: number) => text.length * fontSize;
const make = (tool: ScreenshotMark["tool"], points = [{ x: 10, y: 20 }, { x: 110, y: 120 }]): ScreenshotMark => ({ tool, points, color: "red", width: 3 });

describe("截图标注编辑", () => {
  it("直线只命中笔迹附近，不把外接矩形内部全部当作拖动区", () => {
    const line = make("line");
    expect(hitMark(line, { x: 60, y: 70 }, measure)).toBe(true);
    expect(hitMark(line, { x: 100, y: 25 }, measure)).toBe(false);
  });

  it("空心框只命中边框，马赛克命中整个范围", () => {
    expect(hitMark(make("rect"), { x: 10, y: 70 }, measure)).toBe(true);
    expect(hitMark(make("rect"), { x: 60, y: 70 }, measure)).toBe(false);
    expect(hitMark(make("mosaic"), { x: 60, y: 70 }, measure)).toBe(true);
  });

  it("多行文字使用真实测量宽度与统一行高确定可拖动区域", () => {
    const text = { ...make("text", [{ x: 10, y: 20 }]), text: "第一行\n第二行文字" };
    const bounds = markBounds(text, measure);
    expect(bounds.w).toBe(5 * 18);
    expect(bounds.h).toBe(2 * textLineHeight(text));
    expect(hitMark(text, { x: 80, y: 55 }, measure)).toBe(true);
    expect(hitMark(text, { x: 150, y: 55 }, measure)).toBe(false);
  });

  it("拖动保留所有笔迹点的相对位置，并保留原对象供撤销", () => {
    const mark = make("pen", [{ x: 10, y: 20 }, { x: 25, y: 30 }, { x: 30, y: 40 }]);
    const moved = moveMark(mark, { x: 40, y: -10 });
    expect(moved.points).toEqual([{ x: 50, y: 10 }, { x: 65, y: 20 }, { x: 70, y: 30 }]);
    expect(mark.points[0]).toEqual({ x: 10, y: 20 });
  });

  it("矩形拖动角点缩放，固定对角，且不修改原对象", () => {
    const mark = make("rect");
    const resized = resizeMark(mark, "se", { x: 210, y: 220 }, { x: 0, y: 0, w: 600, h: 600 }, measure);
    expect(resized.points).toEqual([{ x: 10, y: 20 }, { x: 210, y: 220 }]);
    expect(resized.width).toBe(6);
    expect(mark.points[1]).toEqual({ x: 110, y: 120 });
  });

  it("多行文字按字号等比缩放，并固定左上角", () => {
    const mark = { ...make("text", [{ x: 10, y: 20 }]), text: "两行文字\n第二行" };
    const rect = markBounds(mark, measure);
    const resized = resizeMark(mark, "se", { x: rect.x + rect.w * 2, y: rect.y + rect.h * 2 }, { x: 0, y: 0, w: 600, h: 600 }, measure);
    expect(textFontSize(resized)).toBeCloseTo(36);
    expect(resized.points[0].x).toBeCloseTo(10);
    expect(resized.points[0].y).toBeCloseTo(20);
    expect(markBounds(resized, measure).w).toBeCloseTo(rect.w * 2);
  });

  it("水平线端点可拖成斜线，零高度不导致无效缩放值", () => {
    const mark = make("arrow", [{ x: 10, y: 20 }, { x: 110, y: 20 }]);
    expect(markHandles(mark, measure).map((entry) => entry.handle)).toEqual(["start", "end"]);
    const resized = resizeMark(mark, "end", { x: 210, y: 120 }, { x: 0, y: 0, w: 600, h: 600 }, measure);
    expect(resized.points[0].x).toBeCloseTo(10);
    expect(resized.points[0].y).toBeCloseTo(20);
    expect(resized.points[1].x).toBeCloseTo(210);
    expect(resized.points[1].y).toBeCloseTo(120);
    expect(Number.isFinite(resized.width)).toBe(true);
  });

  it("旋转后命中判断和缩放控制点跟随标注，而非原始坐标", () => {
    const mark = { ...make("rect", [{ x: 100, y: 100 }, { x: 300, y: 200 }]), rotation: 90 };
    expect(hitMark(mark, { x: 200, y: 50 }, measure)).toBe(true);
    expect(hitMark(mark, { x: 100, y: 150 }, measure)).toBe(false);
    const handle = markHandles(mark, measure).find((entry) => entry.handle === "se")!;
    expect(handle.x).toBeCloseTo(150);
    expect(handle.y).toBeCloseTo(250);
    expect(markHandleAt(mark, handle, measure)).toBe("se");
    const bounds = markWorldBounds(mark, measure);
    expect(bounds.w).toBeCloseTo(100);
    expect(bounds.h).toBeCloseTo(200);
  });

  it("旋转后再次缩放仍固定对角的屏幕位置", () => {
    const mark = { ...make("rect", [{ x: 150, y: 150 }, { x: 250, y: 250 }]), rotation: 45 };
    const fixedBefore = markWorldPoint(mark, mark.points[0], measure);
    const target = markWorldPoint(mark, { x: 300, y: 300 }, measure);
    const resized = resizeMark(mark, "se", target, { x: 0, y: 0, w: 600, h: 600 }, measure);
    const fixedAfter = markWorldPoint(resized, resized.points[0], measure);
    expect(fixedAfter.x).toBeCloseTo(fixedBefore.x);
    expect(fixedAfter.y).toBeCloseTo(fixedBefore.y);
  });

  it("旋转保留中心与局部笔迹，支持按 15 度对齐", () => {
    const mark = make("pen");
    const center = markCenter(mark, measure);
    const rotated = rotateMark(mark, { x: center.x, y: center.y - 50 }, { x: center.x + 50, y: center.y }, measure);
    expect(rotated.rotation).toBeCloseTo(90);
    expect(rotated.points).toEqual(mark.points);
    expect(markCenter(rotated, measure)).toEqual(center);
    const angle = 23 * Math.PI / 180;
    const snapped = rotateMark(mark, { x: center.x + 50, y: center.y }, { x: center.x + Math.cos(angle) * 50, y: center.y + Math.sin(angle) * 50 }, measure, true);
    expect(snapped.rotation).toBe(30);
  });
});
