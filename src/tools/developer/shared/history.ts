export const MAX_HISTORY = 30;
const DEFAULT_MAX_ITEM_CHARS = 120_000;

/** 生成一条历史记录的唯一 ID */
export function createHistoryId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 提取首行非空预览文本用于列表标题或副标题 */
export function previewLine(text: string | undefined, maxLength: number): string {
  const line = text
    ?.split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean) ?? "";
  if (line.length <= maxLength) return line;
  return `${line.slice(0, maxLength - 1)}…`;
}

/** 按当前界面语言格式化时间（HH:mm） */
export function formatHistoryTime(timestamp: number, loc: string): string {
  return new Intl.DateTimeFormat(loc, { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

/** 从 localStorage 读取历史记录列表 */
export function loadHistory<T>(storageKey: string, maxItems = MAX_HISTORY): T[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed.slice(0, maxItems) as T[]) : [];
  } catch {
    return [];
  }
}

/** 将历史记录写入 localStorage，先按估算长度 O(1) 跳过超长条目避免卡顿 */
export function saveHistory<T>(
  storageKey: string,
  items: T[],
  maxItems = MAX_HISTORY,
  maxItemChars = DEFAULT_MAX_ITEM_CHARS,
  estimateSize?: (item: T) => number,
): void {
  try {
    const persistable: T[] = [];
    for (const item of items) {
      if (persistable.length >= maxItems) break;
      if (estimateSize && estimateSize(item) > maxItemChars) continue;
      if (JSON.stringify(item).length <= maxItemChars) persistable.push(item);
    }
    localStorage.setItem(storageKey, JSON.stringify(persistable));
  } catch {
    // localStorage 满或不可用时保持当前会话可用
  }
}
