import { ref, watch, type Ref } from "vue";

/**
 * 与 localStorage 同步的 ref，用于记住界面状态（主题、上次打开的工具等）。
 * 值以 JSON 保存，读取失败时使用默认值。
 */
export function useStoredRef<T>(key: string, fallback: T): Ref<T> {
  let initial = fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) initial = JSON.parse(raw);
  } catch {
    // 数据损坏或无法访问 localStorage 时忽略
  }

  const state = ref(initial) as Ref<T>;
  watch(
    state,
    (value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // 写入失败不影响使用
      }
    },
    { deep: true },
  );
  return state;
}
