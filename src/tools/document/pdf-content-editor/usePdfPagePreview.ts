import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch, type Ref } from "vue";
import { showError } from "@/utils/errorToast";
import { renderPage, type PdfDocument } from "../shared/pdfjs";
import type { PdfEditPage } from "./pdfEditorModel";

export interface PdfEditorSource { name: string; data: Uint8Array; doc: PdfDocument }
interface PreviewContext {
  source: Readonly<Ref<PdfEditorSource | undefined>>;
  pages: Readonly<Ref<PdfEditPage[]>>;
  pageIndex: Readonly<Ref<number>>;
  zoom: Readonly<Ref<number>>;
  redactedDoc: Readonly<Ref<PdfDocument | undefined>>;
  visiblePages: Readonly<Ref<number[]>>;
  removedIds: () => ReadonlySet<string>;
  onLayout: () => void;
}

/** 页面位图、解码切换与缩略图统一管理；旧任务不能写入新文档的缓存。 */
export function usePdfPagePreview(context: PreviewContext) {
  const { source, pages, pageIndex, zoom, redactedDoc, visiblePages } = context;
  const rendering = ref(false);
  const pageImages = shallowRef(new Map<number, string>());
  const pageImageVersions = new Map<number, number>();
  const pageRemovedIds = shallowRef(new Map<number, Set<string>>());
  const thumbs = shallowRef(new Map<number, string>());
  const pageUrl = computed(() => pageImages.value.get(pageIndex.value) || "");
  let renderToken = 0, thumbnailToken = 0, disposed = false;
  let renderQueue = Promise.resolve();
  const pendingRenders = new Set<string>();
  const requestVisiblePages = () => {
    const src = source.value, generation = renderToken;
    if (!src) return;
    const indices = [...new Set([pageIndex.value, ...visiblePages.value, pageIndex.value - 1, pageIndex.value + 1])].filter((i) => i >= 0 && i < pages.value.length);
    // 保留屏幕附近页面，长文档滚动时释放远处的高分辨率图片。
    const retained = new Set(indices);
    const cache = new Map(pageImages.value);
    for (const [index, url] of cache) if (!retained.has(index)) { URL.revokeObjectURL(url); cache.delete(index); pageImageVersions.delete(index); pageRemovedIds.value.delete(index); }
    pageImages.value = cache;
    for (const index of indices) {
      const key = `${generation}:${index}`;
      if ((pageImages.value.has(index) && pageImageVersions.get(index) === generation) || pendingRenders.has(key)) continue;
      pendingRenders.add(key);
      renderQueue = renderQueue.then(async () => {
        if (generation !== renderToken || disposed) { pendingRenders.delete(key); return; }
        if (index === pageIndex.value) rendering.value = true;
        try {
          const removed = new Set(context.removedIds());
          const url = await renderPage(redactedDoc.value ?? src.doc, index, pages.value[index].width * zoom.value);
          try {
            const image = new Image(); image.src = url;
            await image.decode();
            if (generation !== renderToken || disposed) { URL.revokeObjectURL(url); return; }
            const previous = pageImages.value.get(index);
            // 新位图解码完成后一起切换背景和文字层，避免闪白及原文与替换文字重叠。
            pageRemovedIds.value = new Map(pageRemovedIds.value).set(index, removed);
            pageImages.value = new Map(pageImages.value).set(index, url);
            pageImageVersions.set(index, generation);
            await nextTick();
            if (previous && previous !== url) URL.revokeObjectURL(previous);
          } catch (error) { URL.revokeObjectURL(url); throw error; }
        } catch (error) { if (generation === renderToken && !disposed) showError(error); }
        finally { pendingRenders.delete(key); if (generation === renderToken) rendering.value = false; }
      });
    }
  };
  watch([source, zoom, redactedDoc], (values, previous) => {
    renderToken++;
    // 同一文件的缩放和原文替换都保留旧位图，直到新背景解码完成。
    if (values[0] !== previous?.[0]) {
      for (const url of pageImages.value.values()) URL.revokeObjectURL(url);
      pageImages.value = new Map(); pageImageVersions.clear(); pageRemovedIds.value = new Map();
    }
    requestVisiblePages();
    void nextTick(context.onLayout);
  });
  watch([pageIndex, visiblePages], requestVisiblePages);
  // 缩略图按可见范围渲染，避免长文档在打开时一次生成所有页面图片。
  let thumbQueue = Promise.resolve();
  const pendingThumbs = new Set<number>();
  const requestThumb = (index: number) => {
    if (!source.value || thumbs.value.has(index) || pendingThumbs.has(index)) return;
    pendingThumbs.add(index);
    const src = source.value, generation = thumbnailToken;
    thumbQueue = thumbQueue.then(async () => {
      if (generation !== thumbnailToken || disposed) return;
      try {
        const url = await renderPage(src.doc, index, 120);
        if (generation !== thumbnailToken || disposed) URL.revokeObjectURL(url);
        else thumbs.value = new Map(thumbs.value).set(index, url);
      } catch { /* 主页面渲染会报告错误，缩略图失败时保留页码入口。 */ }
      finally { if (generation === thumbnailToken) pendingThumbs.delete(index); }
    });
  };
  const thumbObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { requestThumb(Number((entry.target as HTMLElement).dataset.page)); thumbObserver.unobserve(entry.target); }
  }, { rootMargin: "180px" });
  const observeThumb = (element: unknown) => { if (element instanceof HTMLElement) thumbObserver.observe(element); };

  const reset = () => {
    renderToken++; thumbnailToken++;
    rendering.value = false;
    for (const url of pageImages.value.values()) URL.revokeObjectURL(url);
    pageImages.value = new Map(); pageImageVersions.clear(); pageRemovedIds.value = new Map();
    for (const url of thumbs.value.values()) URL.revokeObjectURL(url);
    thumbs.value = new Map(); pendingThumbs.clear(); thumbObserver.disconnect();
  };
  onBeforeUnmount(() => { disposed = true; reset(); });
  return { rendering, pageImages, pageRemovedIds, pageUrl, thumbs, observeThumb, reset };
}
