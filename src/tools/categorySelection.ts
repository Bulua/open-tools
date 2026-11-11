import type { Category } from "./types";

/** 按工具的新归属恢复分类偏好，当前打开的工具优先于其他分类的历史选择。 */
export function restoreCategorySelection(
  categories: Category[],
  categoryId: string,
  savedTools: Record<string, string> | null,
) {
  const previous = savedTools ?? {};
  const locations = new Map(categories.flatMap((category) =>
    category.tools.map((tool) => [tool.id, category.id] as const),
  ));
  const tools: Record<string, string> = {};

  // 先保留仍处于原分类中的选择，避免被旧分类合并进来的偏好覆盖。
  for (const category of categories) {
    const toolId = previous[category.id];
    if (locations.get(toolId) === category.id) tools[category.id] = toolId;
  }
  for (const toolId of Object.values(previous)) {
    const destination = locations.get(toolId);
    if (destination) tools[destination] ??= toolId;
  }

  const activeTool = previous[categoryId];
  const destination = locations.get(activeTool);
  if (destination) {
    tools[destination] = activeTool;
    return { categoryId: destination, tools };
  }

  const legacyCategories: Record<string, string> = { json: "developer", text: "developer" };
  const fallback = legacyCategories[categoryId] ?? categoryId;
  return {
    categoryId: categories.find((category) => category.id === fallback)?.id ?? categories[0]?.id ?? "",
    tools,
  };
}
