import { watch } from "vue";
import { useStoredRef } from "./useStoredRef";

export type Theme = "light" | "dark";

/** 浅色 / 深色主题，首次打开跟随系统 */
export function useTheme() {
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = useStoredRef<Theme>("theme", prefersDark ? "dark" : "light");

  watch(theme, (t) => (document.documentElement.dataset.theme = t), { immediate: true });

  const toggleTheme = () => {
    theme.value = theme.value === "dark" ? "light" : "dark";
  };

  return { theme, toggleTheme };
}
