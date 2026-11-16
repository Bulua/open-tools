import { t } from "@/locales";
import type { EmbeddedPdfFont, OriginalPdfText } from "./pdfTextTypes";

export function createPdfTextClient(data: Uint8Array) {
  const worker = new Worker(new URL("./pdfText.worker.ts", import.meta.url), { type: "module" });
  let nextId = 0;
  let failure: Error | undefined;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const errorOf = (message: string) => new Error(message === "PDF_TEXT_UNSAFE" ? t("document.pdfEditUnsafeOriginal") : message === "PDF_TEXT_UNSUPPORTED" ? t("document.pdfEditUnsupportedOriginal") : message === "PDF_TEXT_STALE" ? t("document.pdfEditStaleOriginal") : message);
  worker.onmessage = (event: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
    const request = pending.get(event.data.id); if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error) request.reject(errorOf(event.data.error)); else request.resolve(event.data.result);
  };
  worker.onerror = (event) => { failure = errorOf(event.message); for (const request of pending.values()) request.reject(failure); pending.clear(); };
  const request = <T>(message: Record<string, unknown>, transfer: Transferable[] = []) => new Promise<T>((resolve, reject) => {
    if (failure) { reject(failure); return; }
    const id = ++nextId; pending.set(id, { resolve: (value) => resolve(value as T), reject });
    worker.postMessage({ ...message, id }, transfer);
  });
  const copy = data.slice();
  const ready = request({ type: "open", data: copy }, [copy.buffer]);
  return {
    async read(page: number) { await ready; return request<OriginalPdfText[]>({ type: "read", page }); },
    async fonts(page: number) { await ready; return request<EmbeddedPdfFont[]>({ type: "fonts", page }); },
    async remove(ids: string[]) { await ready; return request<Uint8Array>({ type: "remove", ids }); },
    destroy() { failure = new Error("PDF_TEXT_CANCELLED"); worker.terminate(); for (const item of pending.values()) item.reject(failure); pending.clear(); },
  };
}
