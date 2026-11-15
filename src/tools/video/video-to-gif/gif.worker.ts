import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { GIFEncoder, applyPalette, quantize, type Palette } from "gifenc";
import { frameDelays, frameTimestamps } from "./gif";

/**
 * 在后台线程把视频转成 GIF：按时间点解码画面（缩放到输出尺寸），每帧单独生成调色板后写入 GIF。
 * 颜色量化比较耗时，放在这里界面不会卡住。报错只回传类型，文案由界面按当前语言显示。
 */
export interface GifRequest {
  file: Blob;
  /** 开始、结束时间（秒，视频文件里的时间，已经加上第一帧的时间） */
  start: number;
  end: number;
  fps: number;
  width: number;
  height: number;
  colors: number;
  loop: boolean;
}
export type GifResponse =
  | { type: "progress"; value: number }
  | { type: "done"; data: Uint8Array }
  | { type: "error"; code: "unsupported" | "noVideo" | "failed"; message?: string };

const post = (msg: GifResponse, transfer: Transferable[] = []) => self.postMessage(msg, { transfer });

self.onmessage = async (e: MessageEvent<GifRequest>) => {
  const req = e.data;
  const input = new Input({ source: new BlobSource(req.file), formats: ALL_FORMATS });
  try {
    if (!(await input.canRead().catch(() => false))) return post({ type: "error", code: "unsupported" });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return post({ type: "error", code: "noVideo" });
    if (!(await track.canDecode())) return post({ type: "error", code: "unsupported" });

    const times = frameTimestamps(req.start, req.end, req.fps);
    const delays = frameDelays(times.length, req.fps);
    const sink = new CanvasSink(track, { width: req.width, height: req.height, fit: "fill", poolSize: 1 });
    const gif = GIFEncoder();
    // 晚一帧写入：取不到画面的时间点（超出视频结尾）把停留时间加到上一帧，总时长不变
    let pending: { index: Uint8Array; palette: Palette; delay: number } | null = null;
    const flush = () => {
      if (!pending) return;
      gif.writeFrame(pending.index, req.width, req.height, { palette: pending.palette, delay: pending.delay, repeat: req.loop ? 0 : -1 });
      pending = null;
    };
    let i = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(times)) {
      if (wrapped) {
        const ctx = wrapped.canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
        const { data } = ctx.getImageData(0, 0, req.width, req.height);
        flush();
        const palette = quantize(data, req.colors);
        pending = { index: applyPalette(data, palette), palette, delay: delays[i] };
      } else if (pending) {
        pending.delay += delays[i];
      }
      i++;
      post({ type: "progress", value: i / times.length });
    }
    if (!pending) return post({ type: "error", code: "failed" });
    flush();
    gif.finish();
    const bytes = gif.bytes();
    post({ type: "done", data: bytes }, [bytes.buffer]);
  } catch (err) {
    post({ type: "error", code: "failed", message: err instanceof Error ? err.message : String(err) });
  } finally {
    input.dispose();
  }
};
