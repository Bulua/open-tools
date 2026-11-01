import { describe, expect, it } from "vitest";
import { AI_MODELS, modelById, toInputTensor, toMask } from "./aiModels";

describe("AI 抠图模型", () => {
  it("预处理：按最大值归一化，减均值除标准差，按通道排列", () => {
    // 2 × 2：红、绿、蓝、白
    const rgba = Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const t = toInputTensor(rgba, 2, [0.5, 0.5, 0.5], [1, 1, 1]);
    // 通道依次排列：先 4 个 R，再 4 个 G，再 4 个 B
    expect([...t].map((v) => Number(v.toFixed(2)))).toEqual([0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5]);
  });

  it("后处理：拉伸到 0～255", () => {
    expect([...toMask(Float32Array.from([0.2, 0.6, 1.0]))]).toEqual([0, 128, 255]);
    // 全部相同时不会除以 0
    expect([...toMask(Float32Array.from([0.5, 0.5]))]).toEqual([0, 0]);
  });

  it("只有一个内置模型；找不到的 id 退回内置模型", () => {
    expect(AI_MODELS.filter((m) => m.builtin).map((m) => m.id)).toEqual(["u2netp"]);
    expect(modelById("nope").id).toBe("u2netp");
  });
});
