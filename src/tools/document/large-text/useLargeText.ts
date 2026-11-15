import { isTauri, invoke } from "@tauri-apps/api/core";
import { t } from "@/locales";
import { recordToolUsage } from "@/composables/toolLibrary";
import { showError, showNotice } from "@/utils/errorToast";
import { registerExitGuard } from "@/utils/exitGuards";
import { useUpdater } from "@/composables/useUpdater";
import { ref } from "vue";
import type { TextController } from "./controller";
import { textWorkspace, type TabCloseScope } from "./workspace";

let initialized = false;
export const confirming = ref(false);
let polling = false;
let timer: ReturnType<typeof setInterval> | undefined;

export async function saveOriginal(largeText: TextController): Promise<boolean> {
  if (!largeText.state.id || largeText.state.busy) return false;
  try { await largeText.save(); recordToolUsage(); showNotice(t("largeText.saveDone")); return true; }
  catch (e) { showError(e); return false; }
}
/** 原生对话框在切换工具或界面被缓存淘汰后仍可显示。 */
async function resolveChanges(largeText: TextController): Promise<boolean> {
  if (largeText.state.busy) { showNotice(t("largeText.wait")); return false; }
  if (!largeText.dirty.value) return true;
  const { message } = await import("@tauri-apps/plugin-dialog");
  const choice = await message(`${largeText.state.info?.path ?? ""}\n\n${t("largeText.pendingPrompt")}`, {
    title: t("largeText.unsaved"), kind: "warning",
    buttons: { yes: t("largeText.saveChoice"), no: t("largeText.discardChoice"), cancel: t("largeText.cancelChoice") },
  });
  if (choice === t("largeText.saveChoice")) return saveOriginal(largeText);
  return choice === t("largeText.discardChoice");
}
/** 先处理选中文件的全部提示，全部同意后才关闭；取消时保留所有标签。 */
async function closeFiles(controllers: TextController[], fallbackKey?: number): Promise<boolean> {
  if (confirming.value || textWorkspace.opening.value) return false;
  const targets = [...new Set(controllers)].filter((controller) => controller.state.id);
  if (!targets.length) return true;
  confirming.value = true;
  const originalKey = textWorkspace.activeKey.value;
  try {
    if (targets.some((controller) => controller.state.busy)) { showNotice(t("largeText.wait")); return false; }
    for (const controller of targets) {
      const tab = textWorkspace.tabs.find((candidate) => candidate.controller === controller);
      if (tab && controller.dirty.value) textWorkspace.activate(tab);
      if (!(await resolveChanges(controller))) return false;
    }
    for (const controller of targets) { await controller.close(true); textWorkspace.remove(controller); }
    const active = textWorkspace.tabs.find((tab) => tab.key === originalKey) ?? textWorkspace.tabs.find((tab) => tab.key === fallbackKey);
    if (active) textWorkspace.activate(active);
    return true;
  } catch (e) { showError(e); return false; } finally { confirming.value = false; }
}
export const closeFile = (controller: TextController) => closeFiles([controller]);
export const closeAllFiles = () => closeFiles(textWorkspace.tabs.map((tab) => tab.controller));
/** 左右以打开菜单的标签为基准，不包含该标签本身。 */
export const closeTabGroup = (key: number, scope: TabCloseScope) =>
  closeFiles(textWorkspace.tabsToClose(key, scope).map((tab) => tab.controller), key);
export async function openFile(encoding = "auto", paths?: string | string[]): Promise<void> {
  if (textWorkspace.opening.value || confirming.value) return;
  if (["downloading", "installing"].includes(useUpdater().status.value)) { showNotice(t("largeText.updateBusy")); return; }
  try {
    if (!paths) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: true, directory: false });
      if (!selected) return;
      paths = selected;
    }
    for (const path of typeof paths === "string" ? [paths] : paths) await textWorkspace.open(path, encoding);
  } catch (e) { showError(e); }
}
/** 切换编码重新读取当前文件；取消提示或解码失败均保留原会话。 */
export async function changeEncoding(largeText: TextController, encoding: string): Promise<boolean> {
  if (encoding === largeText.state.encoding) return true;
  if (largeText.state.busy || confirming.value || textWorkspace.opening.value) return false;
  if (["downloading", "installing"].includes(useUpdater().status.value)) { showNotice(t("largeText.updateBusy")); return false; }
  if (!largeText.state.id) { largeText.state.encoding = encoding; return true; }
  confirming.value = true;
  try {
    if (!(await resolveChanges(largeText))) return false;
    await largeText.reopen(encoding);
    return true;
  } catch (e) { showError(e); return false; }
  finally { confirming.value = false; }
}
export async function initializeLargeText(): Promise<void> {
  if (initialized || !isTauri()) return;
  initialized = true;
  registerExitGuard("large-text", closeAllFiles);
  const { listen } = await import("@tauri-apps/api/event");
  try {
    await listen<number | null>("large-text-exit-requested", async (event) => {
      if (await closeAllFiles()) await invoke("large_text_exit", { code: event.payload }).catch(showError);
    });
  } catch (e) { initialized = false; showError(e); }
  // 与原生会话同生命周期；页面被 KeepAlive 淘汰后仍保护草稿及退出流程。
  timer ??= setInterval(async () => {
    if (!textWorkspace.tabs.length || polling) return;
    polling = true;
    try {
      await Promise.all(textWorkspace.tabs.map(async ({ controller }) => {
        try { await controller.poll(); } catch (e) { if (!controller.state.busy) controller.state.error = String(e); }
      }));
    } finally { polling = false; }
  }, 500);
}
