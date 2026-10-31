import { ref } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";

/**
 * 在线更新（只在桌面版可用）：
 * 检查 GitHub Releases 上的 latest.json → 下载并安装 → 重启程序。
 * 状态放在模块里，所有组件共享同一份。
 */
export type UpdateStatus = "idle" | "checking" | "latest" | "available" | "downloading" | "installing" | "error";

const status = ref<UpdateStatus>("idle");
const currentVersion = ref("");
const newVersion = ref("");
const notes = ref("");
const progress = ref(0);
const error = ref("");
let pending: Update | null = null;

/** 浏览器中（开发预览）不支持在线更新 */
export const updaterSupported = isTauri();

async function loadCurrentVersion() {
  if (currentVersion.value || !updaterSupported) return;
  const { getVersion } = await import("@tauri-apps/api/app");
  currentVersion.value = await getVersion();
}

/** 检查更新；silent 为 true 时（启动时自动检查）出错不提示 */
async function checkForUpdate(silent = false) {
  if (!updaterSupported || status.value === "checking" || status.value === "downloading") return;
  status.value = "checking";
  error.value = "";
  try {
    await loadCurrentVersion();
    const { check } = await import("@tauri-apps/plugin-updater");
    pending = await check();
    if (pending) {
      newVersion.value = pending.version;
      notes.value = pending.body ?? "";
      status.value = "available";
    } else {
      status.value = "latest";
    }
  } catch (e) {
    status.value = silent ? "idle" : "error";
    error.value = `检查更新失败：${e instanceof Error ? e.message : String(e)}`;
  }
}

/** 下载并安装新版本，完成后重启程序 */
async function installUpdate() {
  if (!pending) return;
  status.value = "downloading";
  progress.value = 0;
  let total = 0;
  let received = 0;
  try {
    await pending.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      else if (event.event === "Progress") {
        received += event.data.chunkLength;
        progress.value = total ? Math.min(100, Math.round((received / total) * 100)) : 0;
      } else if (event.event === "Finished") status.value = "installing";
    });
    // Windows 上安装程序会自动关闭当前程序，其他情况手动重启
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    status.value = "error";
    error.value = `更新失败：${e instanceof Error ? e.message : String(e)}`;
  }
}

export function useUpdater() {
  return {
    supported: updaterSupported,
    status,
    currentVersion,
    newVersion,
    notes,
    progress,
    error,
    checkForUpdate,
    installUpdate,
    loadCurrentVersion,
  };
}
