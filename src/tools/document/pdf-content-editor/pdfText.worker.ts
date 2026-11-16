/// <reference lib="webworker" />
import wasmUrl from "../../../../node_modules/mupdf/dist/mupdf-wasm.wasm?url";

// 指定打包后的本地 WASM 地址，既不依赖 CDN，也不阻塞界面线程。
(globalThis as unknown as { $libmupdf_wasm_Module: unknown }).$libmupdf_wasm_Module = { locateFile: () => wasmUrl };
// 首次请求再初始化，让模块加载失败也通过请求通道返回，避免未捕获的拒绝。
let engine: Promise<typeof import("./pdfTextEngine")> | undefined;
let data: Uint8Array | undefined;
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<{ id: number; type: "open" | "read" | "remove" | "fonts"; data?: Uint8Array; page?: number; ids?: string[] }>) => {
  queue = queue.then(async () => {
    const { id, type } = event.data;
    try {
      const { readOriginalPdfText, removeOriginalPdfText, readEmbeddedPdfFonts } = await (engine ??= import("./pdfTextEngine"));
      if (type === "open") { data = event.data.data; self.postMessage({ id, result: null }); return; }
      if (!data) throw new Error("PDF_TEXT_STALE");
      const result = type === "read" ? readOriginalPdfText(data, event.data.page!) : type === "fonts" ? readEmbeddedPdfFonts(data, event.data.page!) : removeOriginalPdfText(data, event.data.ids!);
      if (result instanceof Uint8Array) self.postMessage({ id, result }, { transfer: [result.buffer] });
      else self.postMessage({ id, result });
    } catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
  });
};
