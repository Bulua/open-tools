import { expect, it, vi } from "vitest";
import { matchingSystemFonts, normalizeFontName, type SystemFont } from "./systemFonts";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));

const font = (patch: Partial<SystemFont> = {}): SystemFont => ({ id: 1, family: "微软雅黑", name: "Microsoft YaHei", aliases: ["Microsoft YaHei", "MicrosoftYaHei", "微软雅黑"], bold: false, italic: false, ...patch });

it("通过中英文及 PostScript 名称匹配，并去除 PDF 子集前缀", () => {
  const regular = font();
  for (const name of ["ABCDEF+MicrosoftYaHei", "微软雅黑", "Microsoft YaHei"]) {
    expect(matchingSystemFonts([regular], name)).toEqual([regular]);
  }
  expect(normalizeFontName("ABCDEF+Times-New-Roman")).toBe("timesnewroman");
});

it("同一家族必须保留粗体和斜体，不能只按家族名选择常规体", () => {
  const regular = font(), bold = font({ id: 2, bold: true }), italic = font({ id: 3, italic: true });
  expect(matchingSystemFonts([regular, bold, italic], "微软雅黑", true)).toEqual([bold]);
  expect(matchingSystemFonts([regular, bold, italic], "微软雅黑", false, true)).toEqual([italic]);
  expect(matchingSystemFonts([regular], "微软雅黑", true)).toEqual([]);
  expect(matchingSystemFonts([regular], "SimSun")).toEqual([]);
});

it("相同家族的 Light 与常规体按 PostScript 名和实际字重排序", () => {
  const light = font({ id: 2, name: "微软雅黑 Light", weight: 300, postscriptNames: ["MicrosoftYaHeiLight"] });
  const regular = font({ name: "微软雅黑", weight: 400, postscriptNames: ["MicrosoftYaHei"] });
  expect(matchingSystemFonts([light, regular], "MicrosoftYaHei")[0]).toEqual(regular);
  expect(matchingSystemFonts([light, regular], "微软雅黑")[0]).toEqual(regular);
});
