import { ChangeSet } from "@codemirror/state";
import { computed, reactive, shallowRef } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { EditorCache, FileInfo, OpenedFile, SearchResult, TaskStatus, TextBlock } from "./types";

/** 会话独立于页面组件存活：KeepAlive 淘汰界面后，当前文本草稿仍留在这里。 */
export function createTextController(call: typeof invoke = invoke) {
  const state = reactive({
    id: "", encoding: "auto", query: "", lineInput: "", searchVisible: false, jumpVisible: false, generation: 0, info: null as FileInfo | null, block: null as TextBlock | null, draft: "", busy: false,
    status: null as TaskStatus | null, error: "", back: [] as number[],
  });
  const editorCache = shallowRef<EditorCache>();
  const localDirty = computed(() => Boolean(state.block && state.draft !== state.block.text));
  const dirty = computed(() => localDirty.value || Boolean(state.info?.dirty));
  let pending = Promise.resolve();
  let sentPending = false;
  let changes: ChangeSet | undefined;
  let segments: TextBlock[] = [];
  const load = (block: TextBlock) => { editorCache.value = undefined; segments = [block]; changes = undefined; state.generation++; state.block = block; state.draft = block.text; sentPending = false; };
  const args = () => ({ id: state.id, revision: state.info!.revision });
  const changed = (text: string, update?: ChangeSet) => {
    const delta = update ?? ChangeSet.of({ from: 0, to: state.draft.length, insert: text }, state.draft.length);
    changes = changes ? changes.compose(delta) : delta;
    state.draft = text;
    const value = localDirty.value;
    if (!value) changes = undefined;
    if (!state.id || value === sentPending) return;
    sentPending = value; const id = state.id;
    pending = pending.catch(() => {}).then(() => call("large_text_pending", { id, pending: value })).then(() => {}, (error) => {
      if (state.id === id) { state.error = String(error); throw error; }
    });
    // 保存/导航仍会观察该失败；防止未保存提示调用产生未处理拒绝。
    void pending.catch(() => {});
  };
  const perform = async <T>(action: () => Promise<T>): Promise<T> => {
    if (state.busy) throw new Error("Another file operation is still running");
    state.busy = true; state.error = "";
    try { return await action(); } catch (e) { state.error = String(e); throw e; } finally { state.busy = false; }
  };
  const flush = async () => {
    await pending;
    if (!localDirty.value || !state.block) return;
    const block = state.block;
    const size = state.info!.size;
    const edits: { from: number; to: number; text: string }[] = [];
    changes?.iterChanges((from, to, _fromB, _toB, insert) => edits.push({ from, to, text: insert.toString() }));
    state.info = await call<FileInfo>("large_text_edit", { ...args(), start: block.start, end: block.end, text: state.draft, changes: edits });
    // 只有后端确认后才清除草稿标记。读取失败时，原草稿仍可继续保存/恢复。
    sentPending = false; changes = undefined;
    state.block = { ...block, end: block.end + state.info.size - size, text: state.draft, revision: state.info.revision };
  };
  const refresh = async (start: number) => load(await call<TextBlock>("large_text_read", { ...args(), start }));
  const adopt = (file: OpenedFile, encoding: string) => {
    state.id = file.id; state.encoding = encoding; state.info = file.info; state.status = null; state.back = []; pending = Promise.resolve(); load(file.block);
  };
  const open = (path: string, encoding: string) => perform(async () => {
    adopt(await call<OpenedFile>("large_text_open", { path, encoding }), encoding);
  });
  // 新编码成功读取后才关闭旧会话；解码失败时保留旧文本、草稿和编码选项。
  const reopen = (encoding: string) => perform(async () => {
    const id = state.id; const path = state.info!.path;
    await pending.catch(() => {});
    const file = await call<OpenedFile>("large_text_open", { path, encoding });
    try { await call("large_text_close", { id, discard: true }); }
    catch (error) { await call("large_text_close", { id: file.id, discard: true }).catch(() => {}); throw error; }
    adopt(file, encoding);
  });
  const close = (discard: boolean) => perform(async () => {
    await pending.catch(() => {}); await call("large_text_close", { id: state.id, discard });
    state.id = ""; state.info = null; state.block = null; state.draft = ""; state.status = null; state.back = []; sentPending = false; changes = undefined;
  });
  const page = (direction: "next" | "previous" | "first" | "last") => perform(async () => {
    const originalStart = state.block!.start;
    await flush(); await refresh(originalStart);
    const block = state.block!; const info = state.info!;
    let start = info.bom;
    if (direction === "next") { state.back.push(block.start); start = block.end; }
    if (direction === "previous") start = state.back.pop() ?? Math.max(info.bom, block.start - 256 * 1024);
    if (direction === "last") { state.back = []; start = Math.max(info.bom, info.size - 256 * 1024); }
    if (direction === "first") state.back = [];
    await refresh(start);
  });
  const scroll = (direction: "next" | "previous") => perform(async (): Promise<number> => {
    await flush();
    const original = state.block!; const info = state.info!;
    if (direction === "next" ? original.end >= info.size : original.start <= info.bom) return 0;
    const readSpan = async (start: number, end: number) => {
      const result: TextBlock[] = [];
      while (start < end) {
        const block = await call<TextBlock>("large_text_read", { ...args(), start, end });
        if (block.start !== start || block.end <= start || block.end > end) throw new Error("Invalid continuous text range");
        result.push(block); start = block.end;
      }
      return result;
    };
    // 编辑可能改变字节位置。先按已暂存的范围重建片段边界，再接入相邻内容。
    let current = segments.every((block) => block.revision === info.revision) ? [...segments] : await readSpan(original.start, original.end);
    if (!current.length) current = [original];
    let shift = 0;
    if (direction === "next") {
      const next = await call<TextBlock>("large_text_read", { ...args(), start: original.end });
      if (next.start !== original.end || next.end <= next.start) throw new Error("Invalid next text range");
      current.push(next);
      while (current.length > 3) shift -= current.shift()!.text.length;
    } else {
      const start = Math.max(info.bom, original.start - 256 * 1024);
      // 任意字节起点可能落在多字节字符中，后端会向前对齐到下一个安全边界。
      const previous = await call<TextBlock>("large_text_read", { ...args(), start, end: original.start });
      if (previous.start >= original.start || previous.end <= previous.start || previous.end > original.start) throw new Error("Invalid previous text range");
      const prefix = [previous, ...await readSpan(previous.end, original.start)];
      shift = prefix.reduce((length, block) => length + block.text.length, 0);
      current.unshift(...prefix);
      while (current.length > 3) current.pop();
    }
    const first = current[0]!; const last = current[current.length - 1]!;
    load({ ...first, end: last.end, text: current.map((block) => block.text).join("") });
    segments = current; state.back = [];
    return shift;
  });
  const history = (redo: boolean) => perform(async () => {
    const start = state.block!.start; await flush();
    state.info = await call<FileInfo>("large_text_history", { ...args(), redo });
    state.back = []; await refresh(Math.min(start, state.info.size));
  });
  const jump = (line: number) => perform(async () => {
    await flush(); const block = await call<TextBlock>("large_text_jump", { ...args(), line }); state.back = []; load(block);
  });
  const search = (query: string, start: number) => perform(async () => {
    await flush(); const result = await call<SearchResult>("large_text_search", { ...args(), start, query });
    if (result.block) { state.back = []; load(result.block); } return result.found;
  });
  const save = () => perform(async () => {
    await flush();
    if (state.info!.dirty) {
      const result = await call<{ info: FileInfo }>("large_text_save", args());
      state.info = result.info;
    }
    // 保存不会改变文本版本；保留连续窗口及编辑器实例，避免保存时跳回窗口开头。
  });
  const poll = async () => { const id = state.id; if (!id) return; try { const status = await call<TaskStatus>("large_text_status", { id }); if (state.id === id) state.status = status; } catch (error) { if (state.id === id) throw error; } };
  const cancel = () => call("large_text_cancel", { id: state.id });
  return { state, editorCache, localDirty, dirty, changed, open, reopen, close, page, scroll, history, jump, search, save, poll, cancel };
}
export type TextController = ReturnType<typeof createTextController>;
