import { describe, expect, it } from "vitest";
import { arrowHeadPoints, clampObject, createEditHistory, textLines, type PdfEditObject, type PdfEditPage } from "./pdfEditorModel";

const page: PdfEditPage = { width: 200, height: 300, transform: [1, 0, 0, -1, 0, 300] };
const object = (patch: Partial<PdfEditObject> = {}): PdfEditObject => ({ id: 1, page: 0, kind: "text", x: 15, y: 20, width: 160, height: 50, text: "中文 English 日本語", fontId: "default", fontSize: 12, color: "#141413", opacity: 1, strokeWidth: 2, ...patch });

it.each([[1, 0], [0, 1], [-1, 0], [0, -1], [1, -1]])("箭头方向 %s,%s 的两翼保持设置长度，允许超出线段框", (x, y) => {
  const arrow = object({ kind: "arrow", width: 100, height: 100, points: [{ x: 0.5, y: 0.5 }, { x: 0.5 + x * 0.5, y: 0.5 + y * 0.5 }] });
  for (const size of [24, 48]) {
    const head = arrowHeadPoints({ ...arrow, arrowHeadSize: size });
    for (const wing of [head[0], head[2]]) expect(Math.hypot(wing.x - head[1].x, wing.y - head[1].y)).toBeCloseTo(size);
  }
  const horizontal = arrowHeadPoints({ ...arrow, height: 4, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
  expect(horizontal.some((point) => point.y < 0)).toBe(true);
});
describe("PDF 内容编辑数据", () => {
  it("对象移动和缩放被限制在当前页面内", () => {
    expect(clampObject(object({ x: -30, y: 500, width: 900, height: 30 }), page)).toMatchObject({ x: 0, y: 270, width: 200, height: 30 });
    expect(clampObject(object({ width: NaN, height: 0 }), page).width).toBe(4);
  });
  it("撤销和重做保留笔迹快照，新编辑会清空重做", () => {
    const history = createEditHistory(); const items = [object({ points: [{ x: 0, y: 0 }] })];
    history.push(items); items[0].points![0].x = 1;
    const old = history.undo(items)!;
    expect(old[0].points![0].x).toBe(0);
    expect(history.redo(old)![0].points![0].x).toBe(1);
    history.undo(items); history.push([]); expect(history.canRedo).toBe(false);
  });
  it("中英文文本只在显式换行处分行，并保留空行和行尾空格", () => {
    expect(textLines("你好世界\r\n\nHello world  ")).toEqual(["你好世界", "", "Hello world  "]);
  });

});
