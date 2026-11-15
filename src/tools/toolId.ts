/** 工具改名后仍能恢复收藏、最近使用及分类选择。 */
export function currentToolId(id: string): string {
  return ({ countdown: "clock", "large-text": "large-file" } as Record<string, string>)[id] ?? id;
}
