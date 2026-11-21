// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { closePanelDialog } from "./panelDialog";

test("面板退场后才关闭，重复关闭只执行一次", async () => {
  const dialog = document.createElement("dialog");
  dialog.open = true;
  dialog.inert = false;
  const close = vi.fn(() => { dialog.open = false; });
  dialog.close = close;
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  dialog.getAnimations = vi.fn(() => [{ animationName: "panel-out", finished } as unknown as Animation]);
  document.body.append(dialog);
  try {
    closePanelDialog(dialog);
    closePanelDialog(dialog);
    expect(dialog.classList.contains("panel-closing")).toBe(true);
    expect(dialog.inert).toBe(true);
    expect(close).not.toHaveBeenCalled();
    finish();
    await finished;
    expect(close).toHaveBeenCalledTimes(1);
    expect(dialog.inert).toBe(false);
    expect(dialog.classList.contains("panel-closing")).toBe(false);
  } finally {
    dialog.remove();
  }
});

test("切换工具可立即关闭，旧动画不会关闭已重新打开的面板", async () => {
  const dialog = document.createElement("dialog");
  dialog.open = true;
  const close = vi.fn(() => { dialog.open = false; });
  dialog.close = close;
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  dialog.getAnimations = () => [{ animationName: "panel-out", finished } as unknown as Animation];
  closePanelDialog(dialog);
  closePanelDialog(dialog, true);
  dialog.open = true;
  finish();
  await finished;
  expect(close).toHaveBeenCalledTimes(1);
  expect(dialog.open).toBe(true);
});
