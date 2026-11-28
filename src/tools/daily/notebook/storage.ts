import { nextTick, readonly, ref, watch } from "vue";
import { notebookApi } from "@/api/notebook";
import { t } from "@/locales";
import { showError } from "@/utils/errorToast";
import { emptyNotebook, readNotebook, type Notebook } from "./notebook";

const notebook = ref<Notebook>();
const loadState = ref<"loading" | "error" | "ready">("loading");
const saveState = ref<"saved" | "saving" | "error">("saved");
let loading: Promise<void> | undefined;
let writing: Promise<void> | undefined;
let pending: string | undefined;
let storingImages = false;
let reloading = false;
let listeningExternal = false;
let imageWrites = Promise.resolve();

function load() {
  if (notebook.value || loading) return;
  loadState.value = "loading";
  loading = (async () => {
    try {
      const raw = await notebookApi.read();
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
      const paths = [];
      for (const image of images) {
        const blob = typeof image === "string" ? await (await fetch(image)).blob() : image;
        paths.push(await notebookApi.saveImage(id, await blob.arrayBuffer()));
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
        await notebookApi.write(snapshot);
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
    await notebookApi.reveal(id);
  } catch (error) {
    showError(error);
  }
}

async function reloadFromDisk() {
  if (!notebook.value || loading) return;
  await imageWrites;
  await flush();
  if (!notebook.value || loading) return;
  const previousSelected = notebook.value.selectedId;
  loading = (async () => {
    try {
      const raw = await notebookApi.read();
      const next = raw === null ? emptyNotebook() : readNotebook(raw);
      if (previousSelected && next.nodes.some((n) => n.id === previousSelected)) {
        next.selectedId = previousSelected;
      }
      reloading = true;
      try {
        notebook.value = next;
        loadState.value = "ready";
        await nextTick();
      } finally {
        reloading = false;
      }
    } catch (error) {
      showError(error);
    }
  })().finally(() => { loading = undefined; });
}

function ensureExternalListener() {
  if (listeningExternal) return;
  listeningExternal = true;
  void notebookApi.onChanged(() => {
    void reloadFromDisk();
  }).catch(() => {
    listeningExternal = false;
  });
}

// 初始化与外部同步重载不写回文件。损坏的存档会停留在读取失败状态。
watch(notebook, (state, previous) => {
  if (reloading || !state || !previous) return;
  pending = JSON.stringify(state);
  void flush();
}, { deep: true });

export function useNotebook() {
  load();
  ensureExternalListener();
  return {
    notebook, loadState: readonly(loadState), saveState: readonly(saveState), retryLoad: load, retrySave: flush,
    revealEntry,
  };
}
