import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import script from "../../../../src-tauri/src/tools/video/xiaohongshu_download/xiaohongshu_capture.js?raw";

const id = "6a8e6dc4000000001f003a9b";
const note = { noteId: id, type: "video", title: "测试视频", user: { nickName: "作者" }, video: { media: { stream: { h264: [] } } } };
function setup(state: unknown) {
  const frame: Record<string, unknown> = { __INITIAL_STATE__: state };
  frame.top = frame;
  const location = { pathname: `/discovery/item/${id}`, href: "" };
  let scan = () => {}, timeout = () => {};
  const clearInterval = vi.fn();
  runInNewContext(script, {
    window: frame, location,
    setInterval: (cb: () => void) => { scan = cb; return 1; },
    setTimeout: (cb: () => void) => { timeout = cb; return 2; }, clearInterval,
  });
  return { location, scan: () => scan(), timeout: () => timeout(), clearInterval };
}
const result = (href: string) => JSON.parse(new URL(href).searchParams.get("d")!);

describe("小红书后台页面读取", () => {
  it("只返回指定笔记的必要数据，并且只发送一次", () => {
    const run = setup({ note: { noteDetailMap: { [id]: { note }, recommended: { note: { ...note, title: "推荐视频" } } } } });
    run.scan();
    expect(result(run.location.href)).toMatchObject({ id, state: { note: { noteDetailMap: { [id]: { note: { title: "测试视频", user: { nickname: "作者" } } } } } } });
    const href = run.location.href;
    run.timeout();
    run.scan();
    expect(run.location.href).toBe(href);
    expect(run.clearInterval).toHaveBeenCalledWith(1);
  });
  it("兼容手机页，并拒绝不同编号的笔记", () => {
    const mobile = setup({ noteData: { data: { noteData: note } } });
    mobile.scan();
    expect(result(mobile.location.href).id).toBe(id);
    const wrong = setup({ noteData: { data: { noteData: { ...note, noteId: "other" } } } });
    wrong.scan();
    expect(wrong.location.href).toBe("");
    wrong.timeout();
    expect(result(wrong.location.href)).toEqual({ error: "unavailable" });
  });
  it("图文笔记返回全部图片，而不是只返回封面", () => {
    const images = [{ url: "https://cdn.test/1.jpg" }, { url: "https://cdn.test/2.jpg" }];
    const run = setup({ noteData: { data: { noteData: { ...note, type: "normal", video: undefined, imageList: images } } } });
    run.scan();
    expect(result(run.location.href).state.note.noteDetailMap[id].note.imageList).toEqual(images);
  });
});
