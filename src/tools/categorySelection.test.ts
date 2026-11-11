import { expect, it } from "vitest";
import { categories } from "./index";
import { restoreCategorySelection } from "./categorySelection";

it.each([
  ["json", "json-format", "developer"],
  ["text", "regex", "developer"],
  ["text", "password-vault", "daily"],
  ["text", "clipboard-history", "daily"],
  ["calc", "color", "image"],
])("原分类 %s 中的 %s 随工具迁移到 %s", (previous, toolId, destination) => {
  const restored = restoreCategorySelection(categories, previous, { [previous]: toolId });
  expect(restored.categoryId).toBe(destination);
  expect(restored.tools[destination]).toBe(toolId);
  expect(restored.tools[previous]).toBeUndefined();
  expect(restoreCategorySelection(categories, restored.categoryId, restored.tools)).toEqual(restored);
});

it("合并分类时优先恢复当前打开的工具，同时保留其他分类的选择", () => {
  const restored = restoreCategorySelection(categories, "text", {
    json: "json-diff",
    text: "base64",
    time: "countdown",
    image: "image-compress",
  });
  expect(restored).toEqual({
    categoryId: "developer",
    tools: { developer: "base64", time: "countdown", image: "image-compress" },
  });
});

it("已有新分类选择时，其他旧分类的历史不会覆盖它", () => {
  const restored = restoreCategorySelection(categories, "time", {
    developer: "json-format",
    json: "json-diff",
    text: "base64",
    time: "calendar",
  });
  expect(restored.tools.developer).toBe("json-format");
  expect(restored.categoryId).toBe("time");
});

it("旧分类没有选中工具时可回到新分类，无效偏好安全回退", () => {
  expect(restoreCategorySelection(categories, "json", {}).categoryId).toBe("developer");
  expect(restoreCategorySelection(categories, "text", {}).categoryId).toBe("developer");
  expect(restoreCategorySelection(categories, "missing", null)).toEqual({ categoryId: "developer", tools: {} });
});
