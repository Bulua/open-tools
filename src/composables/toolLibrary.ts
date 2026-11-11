import { ref } from "vue";
import { useStoredRef } from "./useStoredRef";
import { activityDateKey, normalizeActivity, type ToolActivity } from "@/utils/toolActivity";

/** 去重，也容忍旧数据或损坏的偏好；展示数量由主页控制。 */
export function toolIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && !!id))] : [];
}

const favorites = useStoredRef<string[]>("home.favorites", []);
const recent = useStoredRef<string[]>("home.recent", []);
const ACTIVITY_KEY = "toolUsage.daily";
export const toolActivity = ref<ToolActivity>({});
try { toolActivity.value = normalizeActivity(JSON.parse(localStorage.getItem(ACTIVITY_KEY) ?? "{}")); } catch { /* 无法读取时从空记录开始 */ }
// 截图和剪贴板小窗也能完成操作，主窗口及时显示它们写入的统计。
if (typeof window !== "undefined") window.addEventListener("storage", (event) => {
  if (event.key !== ACTIVITY_KEY) return;
  try { toolActivity.value = normalizeActivity(JSON.parse(event.newValue ?? "{}")); } catch { /* 忽略损坏的外部记录 */ }
});
favorites.value = toolIds(favorites.value);
recent.value = toolIds(recent.value);

export const favoriteToolIds = favorites;
export const recentToolIds = recent;
export function toggleFavorite(id: string) {
  favorites.value = favorites.value.includes(id) ? favorites.value.filter((item) => item !== id) : [...favorites.value, id];
}
export function rememberRecentTool(id: string) {
  recent.value = toolIds([id, ...recent.value]);
}

/** 仅由工具成功处理或用户实际操作调用，页面导航不计数。 */
export function recordToolUsage() {
  // 小窗可能刚写入一笔，先读取再累加，避免主窗口用旧值覆盖。
  const next = { ...toolActivity.value };
  try {
    const stored = normalizeActivity(JSON.parse(localStorage.getItem(ACTIVITY_KEY) ?? "{}"));
    for (const [key, count] of Object.entries(stored)) next[key] = Math.max(next[key] ?? 0, count);
  } catch { /* 无法访问本地存储时继续使用内存中的记录 */ }
  const day = activityDateKey(new Date());
  next[day] = Math.min((next[day] ?? 0) + 1, Number.MAX_SAFE_INTEGER);
  toolActivity.value = next;
  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next)); } catch { /* 保存失败不影响工具操作 */ }
}
