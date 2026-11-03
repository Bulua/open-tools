import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { t } from "@/locales";

/**
 * PDF.js：渲染 PDF 页面缩略图。
 * 中文 PDF 常常没有嵌入字体，需要 CMap 文件才能正确显示文字，这些文件随程序打包，不访问网络。
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const cmaps = import.meta.glob("/node_modules/pdfjs-dist/cmaps/*.bcmap", { query: "?url", import: "default", eager: true }) as Record<
  string,
  string
>;
const cmapUrls = new Map(Object.entries(cmaps).map(([path, url]) => [path.split("/").pop()!.replace(".bcmap", ""), url]));

/** 从打包的文件中读取 CMap */
class BundledCMapFactory {
  async fetch({ name }: { name: string }) {
    const url = cmapUrls.get(name);
    if (!url) throw new Error(t("document.missingCmap", { name }));
    const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
    return { cMapData: data, isCompressed: true };
  }
}

/** readOnly：只读取文字和图片、不渲染页面时传 true，不载入字体文件（中文字体很大，载入很慢） */
export async function openPdf(data: Uint8Array, { readOnly = false } = {}) {
  // PDF.js 会转移（清空）传入的数据，传一份副本
  return pdfjs.getDocument({
    data: data.slice(),
    CMapReaderFactory: BundledCMapFactory as never,
    isEvalSupported: false,
    disableFontFace: readOnly,
  }).promise;
}

export type PdfDocument = Awaited<ReturnType<typeof openPdf>>;

/** 渲染一页为图片，返回 blob URL；width 是显示宽度（像素） */
export async function renderPage(doc: PdfDocument, pageIndex: number, width: number): Promise<string> {
  const page = await doc.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const scale = (width * Math.min(window.devicePixelRatio || 1, 2)) / base.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // print 模式一次画完，不按动画帧分段（窗口在后台时动画帧会暂停，缩略图就一直出不来）
  await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;
  page.cleanup();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return blob ? URL.createObjectURL(blob) : "";
}
