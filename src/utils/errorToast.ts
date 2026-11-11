/**
 * 报错提示：各工具遇到真正的错误（读取、处理、保存、网络失败等）时统一用它提醒，
 * AppToast 在窗口上方显示错误和普通提示，3 秒后收起，鼠标停在上面时不会消失。
 * 输入格式不对之类的即时提示仍留在输入框旁边。
 *
 * 用法（.vue 和普通 .ts 都一样）：
 *   import { showError } from "@/utils/errorToast";
 *   try { ... } catch (e) { showError(e); }
 *   showError(e, t("xxx.saveFailed"));   // 第二个参数是加粗显示在前面的标题，可以不传
 */
import { ref } from "vue";

interface ToastItem {
  id: number;
  kind: "error" | "notice";
  title?: string;
  message: string;
}

/** 提示显示多久（毫秒） */
export const TOAST_DURATION = 3000;
/** 最多同时显示几条，更早的直接收起 */
const MAX_VISIBLE = 3;

/** 正在显示的提示，新的在最后 */
export const toasts = ref<ToastItem[]>([]);

const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

/** 把 catch 到的任意值转成文字 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string") return e.message;
  return String(e);
}

/** 开始（或重新开始）倒计时，到时间自动收起 */
function schedule(id: number) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => dismissToast(id), TOAST_DURATION));
}

function showToast(kind: ToastItem["kind"], text: string, title?: string) {
  const message = text.trim();
  if (!message) return;
  const same = toasts.value.find((x) => x.kind === kind && x.message === message && x.title === title);
  if (same) return schedule(same.id);
  const item = { id: nextId++, kind, title, message };
  toasts.value.push(item);
  schedule(item.id);
  while (toasts.value.length > MAX_VISIBLE) dismissToast(toasts.value[0].id);
}

export function showError(e: unknown, title?: string) {
  showToast("error", errorMessage(e), title);
}

/** 普通操作提示，与错误共用提示队列。 */
export function showNotice(message: string) {
  showToast("notice", message);
}

/** 收起一条 */
export function dismissToast(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts.value = toasts.value.filter((x) => x.id !== id);
}

/** 鼠标停在提示上时暂停计时，方便看完或复制 */
export function holdToast(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

/** 鼠标移开后重新计时 */
export function releaseToast(id: number) {
  if (toasts.value.some((x) => x.id === id)) schedule(id);
}
