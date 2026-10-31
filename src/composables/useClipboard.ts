import { ref } from "vue";

/** 剪贴板读写；copied 在复制成功后短暂为 true，用于显示对勾 */
export function useClipboard() {
  const copied = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const copy = async (text: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied.value = false), 1200);
  };

  const paste = () => navigator.clipboard.readText();

  return { copied, copy, paste };
}
