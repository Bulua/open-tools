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
/** 上次检查完成的时间（毫秒），0 表示还没检查过 */
const lastChecked = ref(0);
let pending: Update | null = null;
/** 上次尝试检查的时间（包括失败的），用于定时检查，避免网络不好时反复请求 */
let lastAttempt = 0;

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
  lastAttempt = Date.now();
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
    lastChecked.value = Date.now();
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

/** 定时检查的间隔：4 小时 */
const CHECK_INTERVAL = 4 * 3600_000;
/** 窗口重新显示、切回程序时，距上次检查超过 1 小时就补查一次 */
const REFOCUS_INTERVAL = 3600_000;
let autoStarted = false;

/**
 * 自动检查（程序关闭窗口后会隐藏到托盘，可能一直不重启）：
 * 启动 3 秒后检查一次；之后每 4 小时检查一次；窗口重新显示或获得焦点时，距上次超过 1 小时也检查。
 * 都是静默检查：发现新版本只在顶部显示提示，不弹窗；已经发现新版本或正在更新时不再检查。
 */
function startAutoCheck() {
  if (!updaterSupported || autoStarted) return;
  autoStarted = true;
  const due = (interval: number) => {
    if (["available", "checking", "downloading", "installing"].includes(status.value)) return;
    if (Date.now() - lastAttempt >= interval) checkForUpdate(true);
  };
  setTimeout(() => checkForUpdate(true), 3000);
  // 每 10 分钟看一次是否到时间：电脑睡眠后计时器不准，用实际时间判断
  setInterval(() => due(CHECK_INTERVAL), 10 * 60_000);
  const onBack = () => document.visibilityState === "visible" && due(REFOCUS_INTERVAL);
  document.addEventListener("visibilitychange", onBack);
  window.addEventListener("focus", onBack);
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
    lastChecked,
    checkForUpdate,
    startAutoCheck,
    installUpdate,
    loadCurrentVersion,
  };
}
