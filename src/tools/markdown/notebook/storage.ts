import { invoke, isTauri } from "@tauri-apps/api/core";
import { nextTick, readonly, ref, watch } from "vue";
import { t } from "@/locales";
import { showError } from "@/utils/errorToast";
import { getAppPlatform } from "@/utils/platform";
import { emptyNotebook, readNotebook, type Notebook } from "./notebook";

const STORAGE_KEY = "open-tools.notebook.v1";
const notebook = ref<Notebook>();
const loadState = ref<"loading" | "error" | "ready">("loading");
const saveState = ref<"saved" | "saving" | "error">("saved");
let loading: Promise<void> | undefined;
let writing: Promise<void> | undefined;
let pending: string | undefined;
let storingImages = false;
let imageWrites = Promise.resolve();

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

function flush(): Promise<void> | undefined {
  if (storingImages || writing || pending === undefined) return writing;
  writing = savePending().finally(() => {
    writing = undefined;
    if (saveState.value === "saved") return flush();
  });
  return writing;
}

export function savePastedImages(
  id: string,
  images: readonly (Blob | string)[],
  isCurrent: () => boolean,
  insert: (paths: string[]) => void,
) {
  imageWrites = imageWrites.then(async () => {
    if (!isCurrent()) return;
    await nextTick();
    await flush();
    if (saveState.value !== "saved") throw new Error(t("markdown.notebook.saveError"));
    if (!isCurrent()) return;

    // 附件写入后先插入引用，再提交期间排队的正文或移动操作。
    storingImages = true;
    try {
      const noteId = btoa(String.fromCharCode(...new TextEncoder().encode(id)));
      const paths = [];
      for (const image of images) {
        const blob = typeof image === "string" ? await (await fetch(image)).blob() : image;
        paths.push(await invoke<string>("notebook_save_image", await blob.arrayBuffer(), {
          headers: { "x-note-id": noteId },
        }));
      }
      if (isCurrent()) insert(paths);
      await nextTick();
    } finally {
      storingImages = false;
      void flush();
    }
  }).catch(showError);
  return imageWrites;
}

async function savePending() {
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
  }
}

async function revealEntry(id: string) {
  // 新建或移动后可能还有保存正在进行，等磁盘路径更新后再打开。
  await nextTick();
  await imageWrites;
  await flush();
  if (saveState.value !== "saved") return;
  try {
    await invoke("notebook_reveal", { id });
  } catch (error) {
    showError(error);
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
  return {
    notebook, loadState: readonly(loadState), saveState: readonly(saveState), retryLoad: load, retrySave: flush,
    canReveal: getAppPlatform() === "desktop" && /Windows/i.test(navigator.userAgent),
    revealEntry,
  };
}
