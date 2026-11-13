/** 同一模块的文案分散在不同工具中，递归合并命名空间，数组作为整体保留。 */
export function mergeMessages(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const current = target[key];
      const nested = current !== null && typeof current === "object" && !Array.isArray(current)
        ? current as Record<string, unknown>
        : {};
      target[key] = nested;
      mergeMessages(nested, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
}
