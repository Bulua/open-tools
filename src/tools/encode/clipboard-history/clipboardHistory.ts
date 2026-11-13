import { recordToolUsage } from "@/composables/toolLibrary";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useStoredRef } from "@/composables/useStoredRef";
import { showError } from "@/utils/errorToast";

export interface ClipboardEntry {
  id: number;
  preview: string;
  copiedAt: number;
}

/** 目录按本地日期和小时分组，沿用后端的倒序。 */
export function groupClipboardHistory(entries: ClipboardEntry[]) {
  const days = new Map<string, {
    id: string;
    date: Date;
    count: number;
    hours: Map<number, ClipboardEntry[]>;
  }>();
  for (const entry of entries) {
    const date = new Date(entry.copiedAt);
    const id = [date.getFullYear(), date.getMonth(), date.getDate()].join("-");
    const group = days.get(id) ?? { id, date, count: 0, hours: new Map<number, ClipboardEntry[]>() };
    const hour = date.getHours();
    const items = group.hours.get(hour) ?? [];
    items.push(entry);
    group.hours.set(hour, items);
    group.count += 1;
    days.set(id, group);
  }
  return [...days.values()].map(({ hours, ...day }) => ({
    ...day,
    hours: [...hours].map(([hour, entries]) => ({ hour, entries })),
  }));
}

interface ClipboardSnapshot {
  enabled: boolean;
  maxItems: number;
  entries: ClipboardEntry[];
  error: string | null;
}

export type ClipboardUpdate =
  | { kind: "recording"; enabled: boolean }
  | { kind: "limit"; count: number }
  | { kind: "delete"; id: number }
  | { kind: "clear" };

export const listClipboardHistory = (query: string) => invoke<ClipboardSnapshot>("clipboard_history_list", { query });
export const updateClipboardHistory = (action: ClipboardUpdate) => invoke<void>("clipboard_history_update", { action });
export const copyClipboardEntry = async (id: number) => {
  await invoke<void>("clipboard_history_copy", { id });
  recordToolUsage();
};
export const openClipboardHistory = () => invoke<void>("clipboard_history_open");

export const MAX_CLIPBOARD_ITEMS = 1000;
const DEFAULT_CLIPBOARD_SHORTCUT = "Ctrl+Alt+V";
export const clipboardShortcut = useStoredRef("clipboardHistoryShortcut", DEFAULT_CLIPBOARD_SHORTCUT);
if (typeof clipboardShortcut.value !== "string" || !clipboardShortcut.value.trim()) {
  clipboardShortcut.value = DEFAULT_CLIPBOARD_SHORTCUT;
}
export const clipboardShortcutBusy = ref(false);
export const clipboardShortcutUnavailable = ref(false);
let registered: string | undefined;
let onRecorded: ((shortcut: string) => void) | undefined;

export function setClipboardShortcutRecorder(callback?: (shortcut: string) => void) {
  onRecorded = callback;
}

export async function registerClipboardShortcut(shortcut = clipboardShortcut.value) {
  if (clipboardShortcutBusy.value || shortcut === registered) return;
  clipboardShortcutBusy.value = true;
  try {
    const { register, unregister } = await import("@tauri-apps/plugin-global-shortcut");
    await register(shortcut, (event) => {
      if (event.state !== "Pressed") return;
      if (onRecorded && document.hasFocus()) onRecorded(shortcut);
      else void openClipboardHistory().catch(showError);
    });
    if (registered) {
      try {
        await unregister(registered);
      } catch (error) {
        await unregister(shortcut).catch(() => undefined);
        throw error;
      }
    }
    registered = shortcut;
    clipboardShortcut.value = shortcut;
    clipboardShortcutUnavailable.value = false;
  } catch (error) {
    clipboardShortcutUnavailable.value = !registered;
    throw error;
  } finally {
    clipboardShortcutBusy.value = false;
  }
}
