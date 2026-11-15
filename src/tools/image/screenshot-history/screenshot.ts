import { invoke, isTauri } from "@tauri-apps/api/core";
import { isAndroidApp } from "@/utils/platform";
import { showError } from "@/utils/errorToast";

export interface ScreenshotItem {
  id: string;
  name: string;
  createdAt: string;
  day: string;
  hour: string;
}

export interface ScreenshotDayGroup {
  day: string;
  hours: { hour: string; shots: ScreenshotItem[] }[];
}

/** 后端已按时间倒序返回；这里只分组，保留同一小时内的原有顺序。 */
export function groupScreenshots(items: ScreenshotItem[]): ScreenshotDayGroup[] {
  const days = new Map<string, Map<string, ScreenshotItem[]>>();
  for (const item of items) {
    if (!days.has(item.day)) days.set(item.day, new Map());
    const hours = days.get(item.day)!;
    if (!hours.has(item.hour)) hours.set(item.hour, []);
    hours.get(item.hour)!.push(item);
  }
  return [...days].map(([day, hours]) => ({
    day,
    hours: [...hours].map(([hour, shots]) => ({ hour, shots })),
  }));
}

export const DEFAULT_SCREENSHOT_SHORTCUT = "Ctrl+Shift+A";
const SHORTCUT_KEY = "screenshotShortcut";
let registeredShortcut = "";
let recordingShortcut = false;
let recordedShortcut: ((shortcut: string) => void) | undefined;

export function setScreenshotShortcutRecording(recording: boolean, onShortcut?: (shortcut: string) => void): void {
  recordingShortcut = recording;
  recordedShortcut = recording ? onShortcut : undefined;
}

export const screenshotShortcut = () => localStorage.getItem(SHORTCUT_KEY) || DEFAULT_SCREENSHOT_SHORTCUT;

export async function beginScreenshot(): Promise<void> {
  await invoke("screenshot_begin");
}

export async function registerScreenshotShortcut(shortcut = screenshotShortcut()): Promise<void> {
  if (!isTauri() || isAndroidApp()) return;
  await invoke("screenshot_prepare");
  const { isRegistered, register, unregister } = await import("@tauri-apps/plugin-global-shortcut");
  if (await isRegistered(shortcut)) {
    if (registeredShortcut === shortcut) return;
    // isRegistered 只检查本程序；热更新后重新绑定回调，不应误报为其他程序占用。
    await unregister(shortcut);
  }
  await register(shortcut, (event) => {
    if (event.state !== "Pressed") return;
    // 已注册的组合键可能被 Windows 转为全局事件，输入框收不到 keydown。
    // 把它交回录入框，既不触发截图，也不提前保存设置。
    if (recordingShortcut && document.hasFocus()) {
      recordedShortcut?.(shortcut);
      return;
    }
    void beginScreenshot().catch(showError);
  });
  if (registeredShortcut && registeredShortcut !== shortcut) {
    try {
      await unregister(registeredShortcut);
    } catch (error) {
      await unregister(shortcut).catch(() => undefined);
      throw error;
    }
  }
  registeredShortcut = shortcut;
}

export async function updateScreenshotShortcut(shortcut: string): Promise<void> {
  const previous = screenshotShortcut();
  try {
    await registerScreenshotShortcut(shortcut);
    localStorage.setItem(SHORTCUT_KEY, shortcut);
  } catch (error) {
    if (registeredShortcut !== previous) await registerScreenshotShortcut(previous).catch(() => undefined);
    throw error;
  }
}

export const listScreenshots = () => invoke<ScreenshotItem[]>("screenshot_list");
export const readScreenshot = (id: string) => invoke<string>("screenshot_read", { id });
export const deleteScreenshot = (id: string) => invoke("screenshot_delete", { id });
export const pinScreenshot = (id: string) => invoke("screenshot_pin", { id });
export const revealScreenshot = (id: string) => invoke("screenshot_reveal", { id });

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
