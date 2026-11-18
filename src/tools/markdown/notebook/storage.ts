import { invoke, isTauri } from "@tauri-apps/api/core";
import { readonly, ref, watch } from "vue";
import { showError } from "@/utils/errorToast";
import { emptyNotebook, readNotebook, type Notebook } from "./notebook";

const STORAGE_KEY = "open-tools.notebook.v1";
const notebook = ref<Notebook>();
const loadState = ref<"loading" | "error" | "ready">("loading");
const saveState = ref<"saved" | "saving" | "error">("saved");
let loading: Promise<void> | undefined;
let writing = false;
let pending: string | undefined;

function load() {
  if (notebook.value || loading) return;
  loadState.value = "loading";
  loading = (async () => {
    try {
      const raw = isTauri() ? await invoke<string | null>("notebook_read") : localStorage.getItem(STORAGE_KEY);
      notebook.value = raw === null ? emptyNotebook() : readNotebook(raw);
      loadState.value = "ready";
    } catch (error) {
      loadState.value = "error";
      showError(error);
    }
  })().finally(() => { loading = undefined; });
}

async function flush() {
  if (writing || pending === undefined) return;
  writing = true;
  saveState.value = "saving";
  try {
    // 同一时间只写一份快照。前一次写入期间的连续编辑只保留最新内容。
    while (pending !== undefined) {
      const snapshot = pending;
      pending = undefined;
      try {
        if (isTauri()) await invoke("notebook_write", { data: snapshot });
        else localStorage.setItem(STORAGE_KEY, snapshot);
      } catch (error) {
        pending ??= snapshot;
        throw error;
      }
    }
    saveState.value = "saved";
  } catch (error) {
    saveState.value = "error";
    showError(error);
  } finally {
    writing = false;
  }
}

// 初始化不写回文件。损坏的存档会停留在读取失败状态。
watch(notebook, (state, previous) => {
  if (!state || !previous) return;
  pending = JSON.stringify(state);
  void flush();
}, { deep: true });

export function useNotebook() {
  load();
  return { notebook, loadState: readonly(loadState), saveState: readonly(saveState), retryLoad: load, retrySave: flush };
}
