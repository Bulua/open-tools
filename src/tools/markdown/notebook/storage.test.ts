import { nextTick } from "vue";
import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useNotebook } from "./storage";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: vi.fn() }));
vi.mock("@/utils/errorToast", () => ({ showError: vi.fn() }));

it("写入期间的编辑保留最新快照，保存失败后可重试", async () => {
  const call = vi.mocked(invoke);
  let finish: () => void = () => {};
  const firstWrite = new Promise<void>(resolve => { finish = resolve; });
  call.mockResolvedValueOnce(null)
    .mockReturnValueOnce(firstWrite)
    .mockRejectedValueOnce(new Error("磁盘写入失败"))
    .mockResolvedValueOnce(undefined);
  const { notebook, loadState, saveState, retrySave } = useNotebook();
  await vi.waitFor(() => expect(loadState.value).toBe("ready"));
  expect(call).toHaveBeenCalledTimes(1);

  const state = notebook.value!;
  state.nodes.push({ id: "note", name: "笔记", kind: "note", parentId: null, markdown: "第一笔" });
  await nextTick();
  expect(saveState.value).toBe("saving");
  const note = state.nodes[0];
  if (note.kind !== "note") throw new Error("应当是笔记");
  note.markdown = "最新一笔";
  await nextTick();
  expect(call).toHaveBeenCalledTimes(2);
  finish();
  await vi.waitFor(() => expect(saveState.value).toBe("error"));
  await retrySave();
  expect(call).toHaveBeenLastCalledWith("notebook_write", { data: JSON.stringify(state) });
  expect(saveState.value).toBe("saved");
});
