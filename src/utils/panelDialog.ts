import type { ObjectDirective } from "vue";

const closingDialogs = new WeakMap<HTMLDialogElement, () => void>();
const backdropListeners = new WeakMap<HTMLDialogElement, AbortController>();

function isBackdrop(dialog: HTMLDialogElement, event: MouseEvent): boolean {
  if (event.target !== dialog) return false;
  const { left, right, top, bottom } = dialog.getBoundingClientRect();
  return event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom;
}

/** 遮罩点击复用 Esc 的取消行为，拖出面板和点击内部留白不触发取消。 */
export const vPanelDismiss: ObjectDirective<HTMLDialogElement> = {
  mounted(dialog) {
    const controller = new AbortController();
    backdropListeners.set(dialog, controller);
    const { signal } = controller;
    let pressedBackdrop = false;
    dialog.addEventListener("pointerdown", (event) => {
      pressedBackdrop = event.isPrimary && event.button === 0 && isBackdrop(dialog, event);
    }, { signal });
    dialog.addEventListener("pointercancel", () => { pressedBackdrop = false; }, { signal });
    dialog.addEventListener("click", (event) => {
      const dismiss = pressedBackdrop && dialog.open && !dialog.inert && isBackdrop(dialog, event);
      pressedBackdrop = false;
      if (dismiss && dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) closePanelDialog(dialog);
    }, { signal });
    dialog.addEventListener("close", () => { pressedBackdrop = false; }, { signal });
  },
  beforeUnmount(dialog) {
    backdropListeners.get(dialog)?.abort();
    backdropListeners.delete(dialog);
  },
};

/** 退场完成后再调用原生 close，保留弹窗内容和顶层遮罩。 */
export function closePanelDialog(dialog: HTMLDialogElement | null | undefined, immediate = false): void {
  if (!dialog?.open) return;
  const pending = closingDialogs.get(dialog);
  if (pending) {
    if (immediate) pending();
    return;
  }
  if (immediate || !dialog.getAnimations || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    dialog.close();
    return;
  }

  // 用户在入场时取消，直接从当前的透明度与位置开始退场。
  const style = getComputedStyle(dialog);
  dialog.style.setProperty("--panel-start-opacity", style.opacity);
  dialog.style.setProperty("--panel-start-translate", style.translate === "none" ? "0 0" : style.translate);
  dialog.classList.add("panel-closing");
  const wasInert = dialog.inert;
  dialog.inert = true;

  const finish = () => {
    if (closingDialogs.get(dialog) !== finish) return;
    closingDialogs.delete(dialog);
    dialog.close();
    dialog.inert = wasInert;
    dialog.classList.remove("panel-closing");
    dialog.style.removeProperty("--panel-start-opacity");
    dialog.style.removeProperty("--panel-start-translate");
  };
  closingDialogs.set(dialog, finish);
  const animation = dialog.getAnimations().find((item) => "animationName" in item && item.animationName === "panel-out");
  if (animation) void animation.finished.then(finish, finish);
  else finish();
}
